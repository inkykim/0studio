import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectVersionsCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@supabase/supabase-js';
import rateLimit from 'express-rate-limit';
import Stripe from 'stripe';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get the directory of the current file (backend/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from backend directory, not root
const envPath = join(__dirname, '.env');
dotenv.config({ path: envPath });
console.log('📁 Loading .env from:', envPath);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

// Regular JSON body parser for most routes
app.use(express.json());

// Initialize AWS S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME;

// Initialize Supabase client for auth verification
if (!process.env.SUPABASE_URL) {
  console.error('❌ ERROR: SUPABASE_URL is not set in .env file');
  process.exit(1);
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ ERROR: SUPABASE_SERVICE_ROLE_KEY is not set in .env file');
  console.error('   Get it from: Supabase Dashboard → Settings → API → service_role key');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role key for backend
);

// Validate the key format
if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const keyLength = process.env.SUPABASE_SERVICE_ROLE_KEY.length;
  if (keyLength < 100) {
    console.error('⚠️ WARNING: Service role key seems too short. Expected 100+ characters, got', keyLength);
    console.error('   Make sure you copied the FULL service_role key, not the anon key.');
  }
  // Check if it looks like anon key (starts with eyJ and is shorter)
  if (process.env.SUPABASE_SERVICE_ROLE_KEY.startsWith('eyJ') && keyLength < 200) {
    console.error('⚠️ WARNING: This might be an anon key, not a service_role key!');
    console.error('   Service role keys are typically longer. Check Supabase Dashboard → Settings → API');
  }
}

console.log('✅ Supabase client initialized:', process.env.SUPABASE_URL);
console.log('   Key length:', process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 'NOT SET');

// Initialize Stripe
if (!process.env.STRIPE_SECRET_KEY) {
  console.error('❌ ERROR: STRIPE_SECRET_KEY is not set in .env file');
  console.error('   Get it from: Stripe Dashboard → Developers → API keys → Secret key');
  process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
});

console.log('✅ Stripe client initialized');

// Middleware to verify Supabase JWT token
async function verifyAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error) {
      console.error('Token verification error:', error.message);
      console.error('Error details:', error);
      return res.status(401).json({ 
        error: 'Invalid or expired token',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
    
    if (!user) {
      console.error('No user returned from token verification');
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Attach user to request for use in routes
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth verification error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
}

// Validate S3 key belongs to user
function validateS3Key(s3Key, userId) {
  // S3 keys should be in format: org-{userId}/project-{projectId}/...
  const expectedPrefix = `org-${userId}/`;
  if (!s3Key.startsWith(expectedPrefix)) {
    throw new Error('S3 key does not belong to user');
  }
}

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

app.use('/api/aws', limiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get presigned URL for upload
app.get('/api/aws/presigned-upload', verifyAuth, async (req, res) => {
  try {
    const { key, expiresIn = 3600 } = req.query;
    
    if (!key) {
      return res.status(400).json({ error: 'Missing key parameter' });
    }

    // Validate that the S3 key belongs to the authenticated user
    validateS3Key(key, req.user.id);

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: parseInt(expiresIn) });
    
    res.json({ 
      url, 
      expiresIn: parseInt(expiresIn) 
    });
  } catch (error) {
    console.error('Error generating presigned upload URL:', error);
    
    if (error.message.includes('does not belong to user')) {
      return res.status(403).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});

// Get presigned URL for download (with version)
app.get('/api/aws/presigned-download', verifyAuth, async (req, res) => {
  try {
    const { key, versionId, expiresIn = 3600 } = req.query;
    
    if (!key || !versionId) {
      return res.status(400).json({ error: 'Missing key or versionId parameter' });
    }

    // Validate that the S3 key belongs to the authenticated user
    validateS3Key(key, req.user.id);

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      VersionId: versionId,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: parseInt(expiresIn) });
    
    res.json({ 
      url, 
      expiresIn: parseInt(expiresIn) 
    });
  } catch (error) {
    console.error('Error generating presigned download URL:', error);
    
    if (error.message.includes('does not belong to user')) {
      return res.status(403).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
});

// List file versions
app.get('/api/aws/list-versions', verifyAuth, async (req, res) => {
  try {
    const { key } = req.query;
    
    if (!key) {
      return res.status(400).json({ error: 'Missing key parameter' });
    }

    // Validate that the S3 key belongs to the authenticated user
    validateS3Key(key, req.user.id);

    const command = new ListObjectVersionsCommand({
      Bucket: BUCKET_NAME,
      Prefix: key,
    });

    const response = await s3Client.send(command);
    
    const versions = (response.Versions || []).map(version => ({
      key: version.Key,
      versionId: version.VersionId,
      size: version.Size,
      lastModified: version.LastModified?.toISOString(),
      isLatest: version.IsLatest,
    }));

    res.json({ versions });
  } catch (error) {
    console.error('Error listing versions:', error);
    
    if (error.message.includes('does not belong to user')) {
      return res.status(403).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to list versions' });
  }
});

// Delete a specific version
app.delete('/api/aws/delete-version', verifyAuth, async (req, res) => {
  try {
    const { key, versionId } = req.body;
    
    if (!key || !versionId) {
      return res.status(400).json({ error: 'Missing key or versionId parameter' });
    }

    // Validate that the S3 key belongs to the authenticated user
    validateS3Key(key, req.user.id);

    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      VersionId: versionId,
    });

    await s3Client.send(command);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting version:', error);
    
    if (error.message.includes('does not belong to user')) {
      return res.status(403).json({ error: error.message });
    }
    
    res.status(500).json({ error: 'Failed to delete version' });
  }
});

// ==================== STRIPE PAYMENT ENDPOINTS ====================

// Create Stripe Checkout Session
app.post('/api/stripe/create-checkout-session', verifyAuth, async (req, res) => {
  try {
    const { lookup_key, price_id } = req.body;
    
    if (!lookup_key && !price_id) {
      return res.status(400).json({ error: 'Missing lookup_key or price_id parameter' });
    }

    let price;

    // Try lookup_key first, then fall back to price_id
    if (lookup_key) {
      console.log('🔍 Looking up Stripe price with lookup_key:', lookup_key);
      const prices = await stripe.prices.list({
        lookup_keys: [lookup_key],
        expand: ['data.product'],
      });

      if (prices.data.length === 0) {
        console.error('❌ Price not found for lookup_key:', lookup_key);
        console.error('   Available prices in your Stripe account:');
        
        // List all prices to help debug
        try {
          const allPrices = await stripe.prices.list({ limit: 10 });
          allPrices.data.forEach(p => {
            console.log(`   - ${p.lookup_key || '(no lookup_key)'}: ${p.id} - ${p.unit_amount ? `$${(p.unit_amount / 100).toFixed(2)}` : 'N/A'}`);
          });
        } catch (err) {
          console.error('   Could not list prices:', err.message);
        }
        
        return res.status(404).json({ 
          error: 'Price not found',
          lookup_key: lookup_key,
          hint: 'Check your Stripe Dashboard → Products → Prices to find the correct lookup_key, or use price_id instead'
        });
      }

      price = prices.data[0];
    } else if (price_id) {
      // Use price_id directly
      console.log('🔍 Looking up Stripe price with price_id:', price_id);
      try {
        price = await stripe.prices.retrieve(price_id);
      } catch (error) {
        console.error('❌ Price not found for price_id:', price_id);
        return res.status(404).json({ 
          error: 'Price not found',
          price_id: price_id,
          hint: 'Check that the price_id is correct in your Stripe Dashboard'
        });
      }
    }

    // Determine plan name from price or metadata
    let planName = 'student';
    if (lookup_key && lookup_key.toLowerCase().includes('enterprise')) {
      planName = 'enterprise';
    } else if (lookup_key && lookup_key.toLowerCase().includes('student')) {
      planName = 'student';
    } else if (price.product) {
      // Try to get plan from product name
      const product = typeof price.product === 'string' 
        ? await stripe.products.retrieve(price.product)
        : price.product;
      if (product.name && product.name.toLowerCase().includes('enterprise')) {
        planName = 'enterprise';
      }
    }

    console.log('💰 Creating checkout session for:', {
      priceId: price.id,
      plan: planName,
      userEmail: req.user.email,
      userId: req.user.id
    });

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      billing_address_collection: 'auto',
      line_items: [
        {
          price: price.id,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard?canceled=true`,
      customer_email: req.user.email,
      metadata: {
        userId: req.user.id,
        plan: planName,
      },
    });

    console.log('✅ Checkout session created:', session.id);
    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('❌ Error creating checkout session:', error);
    console.error('   Error type:', error.type);
    console.error('   Error message:', error.message);
    console.error('   Error code:', error.code);
    
    res.status(500).json({ 
      error: 'Failed to create checkout session',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Stripe Webhook Handler - needs raw body for signature verification
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'customer.subscription.created':
      const newSubscription = event.data.object;
      
      // Extract plan from subscription metadata or items
      let plan = 'student';
      if (newSubscription.metadata?.plan) {
        plan = newSubscription.metadata.plan;
      } else if (newSubscription.items?.data?.[0]?.price?.lookup_key) {
        // Try to determine plan from price lookup_key
        const lookupKey = newSubscription.items.data[0].price.lookup_key;
        if (lookupKey.toLowerCase().includes('student')) {
          plan = 'student';
        } else if (lookupKey.toLowerCase().includes('enterprise')) {
          plan = 'enterprise';
        }
      }

      // Determine status
      let status = 'active';
      if (newSubscription.status === 'past_due' || newSubscription.status === 'unpaid') {
        status = 'past_due';
      } else if (newSubscription.status === 'active' || newSubscription.status === 'trialing') {
        status = 'active';
      }

      // Check if subscription already exists
      const { data: existingSub, error: fetchError } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('stripe_subscription_id', newSubscription.id)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('Error checking existing subscription:', fetchError);
        break;
      }

      if (existingSub) {
        // Update existing subscription
        const { error: updateError } = await supabase
          .from('subscriptions')
          .update({
            plan: plan,
            stripe_customer_id: newSubscription.customer,
            stripe_subscription_id: newSubscription.id,
            status: status,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', newSubscription.id);

        if (updateError) {
          console.error('Error updating subscription:', updateError);
        }
      } else {
        // Find user by customer ID if available
        let userId = newSubscription.metadata?.userId || null;
        
        if (!userId && newSubscription.customer) {
          // Try to find user by customer ID in existing subscriptions
          const { data: userSub } = await supabase
            .from('subscriptions')
            .select('user_id')
            .eq('stripe_customer_id', newSubscription.customer)
            .single();
          
          if (userSub) {
            userId = userSub.user_id;
          }
        }

        // Create new subscription record
        const { error: insertError } = await supabase
          .from('subscriptions')
          .insert({
            user_id: userId,
            plan: plan,
            stripe_customer_id: newSubscription.customer,
            stripe_subscription_id: newSubscription.id,
            status: status,
          });

        if (insertError) {
          console.error('Error creating subscription:', insertError);
        }
      }
      break;

    case 'customer.subscription.updated':
      const updatedSubscription = event.data.object;
      
      // Find subscription by subscription ID or customer ID
      const { data: subscriptionData, error: subError } = await supabase
        .from('subscriptions')
        .select('*')
        .or(`stripe_subscription_id.eq.${updatedSubscription.id},stripe_customer_id.eq.${updatedSubscription.customer}`)
        .single();

      if (subError && subError.code !== 'PGRST116') {
        console.error('Error finding subscription:', subError);
        break;
      }

      if (!subscriptionData) {
        console.log('Subscription not found in database, skipping update');
        break;
      }

      // Map Stripe subscription status to our status
      // Stripe statuses: active, past_due, canceled, unpaid, trialing, incomplete, incomplete_expired, paused
      let updateStatus = 'active';
      if (updatedSubscription.status === 'canceled') {
        updateStatus = 'canceled';
      } else if (updatedSubscription.status === 'past_due' || updatedSubscription.status === 'unpaid') {
        updateStatus = 'past_due';
      } else if (updatedSubscription.status === 'active' || updatedSubscription.status === 'trialing') {
        updateStatus = 'active';
      }

      // Update subscription status
      const { error: updateSubError } = await supabase
        .from('subscriptions')
        .update({
          status: updateStatus,
          stripe_subscription_id: updatedSubscription.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscriptionData.id);

      if (updateSubError) {
        console.error('Error updating subscription status:', updateSubError);
      }
      break;

    case 'customer.subscription.deleted':
      const deletedSubscription = event.data.object;
      
      // Find subscription by subscription ID or customer ID
      const { data: deletedSubData, error: deletedSubError } = await supabase
        .from('subscriptions')
        .select('*')
        .or(`stripe_subscription_id.eq.${deletedSubscription.id},stripe_customer_id.eq.${deletedSubscription.customer}`)
        .single();

      if (deletedSubError && deletedSubError.code !== 'PGRST116') {
        console.error('Error finding subscription:', deletedSubError);
        break;
      }

      if (!deletedSubData) {
        console.log('Subscription not found in database, skipping deletion');
        break;
      }

      // Mark subscription as canceled
      const { error: deleteSubError } = await supabase
        .from('subscriptions')
        .update({
          status: 'canceled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', deletedSubData.id);

      if (deleteSubError) {
        console.error('Error updating subscription status to canceled:', deleteSubError);
      }
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

// Get user's payment status
app.get('/api/stripe/payment-status', verifyAuth, async (req, res) => {
  try {
    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('status', 'active')
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching payment status:', error);
      return res.status(500).json({ error: 'Failed to fetch payment status' });
    }

    if (!subscription) {
      return res.json({ 
        hasActivePlan: false,
        plan: null,
        status: null 
      });
    }

    res.json({
      hasActivePlan: true,
      plan: subscription.plan,
      status: subscription.status,
    });
  } catch (error) {
    console.error('Error getting payment status:', error);
    res.status(500).json({ error: 'Failed to get payment status' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Backend API running on http://localhost:${PORT}`);
  console.log(`📦 S3 Bucket: ${BUCKET_NAME || 'NOT CONFIGURED'}`);
  console.log(`🌍 Region: ${process.env.AWS_REGION || 'us-east-1'}`);
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.S3_BUCKET_NAME) {
    console.warn('⚠️  Warning: AWS credentials not configured. Please set up .env file.');
  }
});
