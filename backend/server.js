import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectVersionsCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
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

// SES client for invite emails (uses same AWS creds as S3)
const sesClient = new SESClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }
    : undefined,
});
const INVITE_FROM_EMAIL = process.env.INVITE_FROM_EMAIL; // Verified sender in SES

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
// ==================== PROJECT & MEMBER ENDPOINTS ====================

// Register a project in the cloud
app.post('/api/projects', verifyAuth, async (req, res) => {
  try {
    const { name, file_path } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Missing project name' });
    }

    // Check if project already exists for this file path and user
    if (file_path) {
      const { data: existing } = await supabase
        .from('projects')
        .select('*')
        .eq('owner_id', req.user.id)
        .eq('s3_key', file_path)
        .single();

      if (existing) {
        return res.json(existing);
      }
    }

    const s3Key = file_path || `org-${req.user.id}/project-${Date.now()}`;

    const { data: project, error } = await supabase
      .from('projects')
      .insert({
        name,
        s3_key: s3Key,
        owner_id: req.user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating project:', error);
      return res.status(500).json({ error: 'Failed to create project' });
    }

    // Auto-add the creator as owner in project_members
    await supabase.from('project_members').insert({
      project_id: project.id,
      user_id: req.user.id,
      email: req.user.email,
      role: 'owner',
      invited_by: req.user.id,
      status: 'active',
    });

    console.log('✅ Project registered:', project.id, name);
    res.json(project);
  } catch (error) {
    console.error('Error registering project:', error);
    res.status(500).json({ error: 'Failed to register project' });
  }
});

// Get projects the user owns or is a member of
app.get('/api/projects/user-projects', verifyAuth, async (req, res) => {
  try {
    // Get projects user owns
    const { data: ownedProjects, error: ownedError } = await supabase
      .from('projects')
      .select('*')
      .eq('owner_id', req.user.id)
      .order('created_at', { ascending: false });

    if (ownedError) {
      console.error('Error fetching owned projects:', ownedError);
      return res.status(500).json({ error: 'Failed to fetch projects' });
    }

    // Get projects user is a member of (not owner)
    const { data: memberships, error: memberError } = await supabase
      .from('project_members')
      .select('project_id')
      .eq('user_id', req.user.id)
      .eq('status', 'active')
      .neq('role', 'owner');

    if (memberError) {
      console.error('Error fetching memberships:', memberError);
      return res.status(500).json({ error: 'Failed to fetch projects' });
    }

    let memberProjects = [];
    if (memberships && memberships.length > 0) {
      const projectIds = memberships.map(m => m.project_id);
      const { data: projects, error: projError } = await supabase
        .from('projects')
        .select('*')
        .in('id', projectIds)
        .order('created_at', { ascending: false });

      if (!projError && projects) {
        memberProjects = projects;
      }
    }

    // Combine and deduplicate
    const allProjects = [...(ownedProjects || []), ...memberProjects];
    const seen = new Set();
    const unique = allProjects.filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    res.json({ projects: unique });
  } catch (error) {
    console.error('Error fetching user projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Get project by file path
app.get('/api/projects/by-path', verifyAuth, async (req, res) => {
  try {
    const { file_path } = req.query;

    if (!file_path) {
      return res.status(400).json({ error: 'Missing file_path parameter' });
    }

    // Check if user owns or is a member of this project
    const { data: project, error } = await supabase
      .from('projects')
      .select('*')
      .eq('s3_key', file_path)
      .single();

    if (error && error.code === 'PGRST116') {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (error) {
      console.error('Error fetching project:', error);
      return res.status(500).json({ error: 'Failed to fetch project' });
    }

    // Verify user has access
    if (project.owner_id !== req.user.id) {
      const { data: membership } = await supabase
        .from('project_members')
        .select('*')
        .eq('project_id', project.id)
        .eq('user_id', req.user.id)
        .eq('status', 'active')
        .single();

      if (!membership) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    res.json(project);
  } catch (error) {
    console.error('Error fetching project by path:', error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// Helper: check if user has specific role or higher on a project
async function checkProjectPermission(projectId, userId, minRole = 'viewer') {
  const roleHierarchy = { owner: 3, editor: 2, viewer: 1 };

  // Check if user is project owner
  const { data: project } = await supabase
    .from('projects')
    .select('owner_id')
    .eq('id', projectId)
    .single();

  if (project && project.owner_id === userId) {
    return { allowed: true, role: 'owner' };
  }

  // Check project_members table
  const { data: membership } = await supabase
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (!membership) {
    return { allowed: false, role: null };
  }

  const userLevel = roleHierarchy[membership.role] || 0;
  const requiredLevel = roleHierarchy[minRole] || 0;

  return {
    allowed: userLevel >= requiredLevel,
    role: membership.role,
  };
}

// Send project invite email via Amazon SES (no-op if INVITE_FROM_EMAIL not set)
async function sendProjectInviteEmail({ toEmail, projectName, inviterEmail, role, appUrl }) {
  if (!INVITE_FROM_EMAIL) {
    console.log('⏭️ Skipping invite email (INVITE_FROM_EMAIL not set)');
    return;
  }
  const appLink = appUrl || process.env.FRONTEND_URL || 'http://localhost:5173';
  const subject = `You're invited to the project "${projectName}" on 0studio`;
  const text = `${inviterEmail} invited you to the project "${projectName}" as ${role}.\n\nOpen 0studio and sign in to see the project: ${appLink}`;
  const html = `
    <p>${escapeHtml(inviterEmail)} invited you to the project <strong>${escapeHtml(projectName)}</strong> as <strong>${escapeHtml(role)}</strong>.</p>
    <p><a href="${escapeHtml(appLink)}">Open 0studio</a> and sign in to see the project.</p>
  `.trim();
  try {
    const command = new SendEmailCommand({
      Source: INVITE_FROM_EMAIL,
      Destination: { ToAddresses: [toEmail] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Text: { Data: text, Charset: 'UTF-8' },
          Html: { Data: html, Charset: 'UTF-8' },
        },
      },
    });
    await sesClient.send(command);
    console.log('✅ Invite email sent to', toEmail);
  } catch (err) {
    console.error('Failed to send invite email:', err);
  }
}

function escapeHtml(s) {
  if (typeof s !== 'string') return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Get project members
app.get('/api/projects/:projectId/members', verifyAuth, async (req, res) => {
  try {
    const { projectId } = req.params;

    // Check user has at least viewer access
    const permission = await checkProjectPermission(projectId, req.user.id, 'viewer');
    if (!permission.allowed) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data: members, error } = await supabase
      .from('project_members')
      .select('*')
      .eq('project_id', projectId)
      .neq('status', 'removed')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching members:', error);
      return res.status(500).json({ error: 'Failed to fetch members' });
    }

    res.json({ members: members || [] });
  } catch (error) {
    console.error('Error fetching project members:', error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// Invite a member to a project
app.post('/api/projects/:projectId/members', verifyAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { email, role = 'viewer' } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Missing email parameter' });
    }

    if (!['owner', 'editor', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be owner, editor, or viewer' });
    }

    // Check user has owner or editor access to invite
    const permission = await checkProjectPermission(projectId, req.user.id, 'editor');
    if (!permission.allowed) {
      return res.status(403).json({ error: 'You need editor or owner access to invite members' });
    }

    // Only owners can invite other owners
    if (role === 'owner' && permission.role !== 'owner') {
      return res.status(403).json({ error: 'Only project owners can assign the owner role' });
    }

    // Check if member already exists
    const { data: existing } = await supabase
      .from('project_members')
      .select('*')
      .eq('project_id', projectId)
      .eq('email', email.toLowerCase())
      .neq('status', 'removed')
      .single();

    if (existing) {
      return res.status(409).json({ error: 'User is already a member of this project' });
    }

    // Try to find the user by email in Supabase auth
    let userId = null;
    const { data: userData } = await supabase.auth.admin.listUsers();
    if (userData?.users) {
      const matchedUser = userData.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
      if (matchedUser) {
        userId = matchedUser.id;
      }
    }

    // Create the member record
    const { data: member, error } = await supabase
      .from('project_members')
      .insert({
        project_id: projectId,
        user_id: userId,
        email: email.toLowerCase(),
        role,
        invited_by: req.user.id,
        status: userId ? 'active' : 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('Error inviting member:', error);
      return res.status(500).json({ error: 'Failed to invite member' });
    }

    console.log('✅ Member invited:', email, 'as', role, 'to project', projectId);

    // Send invite email via SES (same AWS creds; does not fail the request if email fails)
    const { data: project } = await supabase
      .from('projects')
      .select('name')
      .eq('id', projectId)
      .single();
    const projectName = project?.name || 'Unnamed project';
    await sendProjectInviteEmail({
      toEmail: email.toLowerCase(),
      projectName,
      inviterEmail: req.user.email || 'A team member',
      role,
      appUrl: process.env.FRONTEND_URL,
    });

    res.json({ member });
  } catch (error) {
    console.error('Error inviting member:', error);
    res.status(500).json({ error: 'Failed to invite member' });
  }
});

// Update a member's role
app.put('/api/projects/:projectId/members/:memberId/role', verifyAuth, async (req, res) => {
  try {
    const { projectId, memberId } = req.params;
    const { role } = req.body;

    if (!role || !['owner', 'editor', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be owner, editor, or viewer' });
    }

    // Check user has owner access to change roles
    const permission = await checkProjectPermission(projectId, req.user.id, 'owner');
    if (!permission.allowed) {
      return res.status(403).json({ error: 'Only project owners can change member roles' });
    }

    // Don't allow changing your own role (prevent accidental lockout)
    const { data: targetMember } = await supabase
      .from('project_members')
      .select('*')
      .eq('id', memberId)
      .eq('project_id', projectId)
      .single();

    if (!targetMember) {
      return res.status(404).json({ error: 'Member not found' });
    }

    if (targetMember.user_id === req.user.id) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    const { data: updatedMember, error } = await supabase
      .from('project_members')
      .update({
        role,
        updated_at: new Date().toISOString(),
      })
      .eq('id', memberId)
      .eq('project_id', projectId)
      .select()
      .single();

    if (error) {
      console.error('Error updating member role:', error);
      return res.status(500).json({ error: 'Failed to update role' });
    }

    console.log('✅ Member role updated:', memberId, 'to', role);
    res.json({ member: updatedMember });
  } catch (error) {
    console.error('Error updating member role:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// Remove a member from a project
app.delete('/api/projects/:projectId/members/:memberId', verifyAuth, async (req, res) => {
  try {
    const { projectId, memberId } = req.params;

    // Check user has owner access
    const permission = await checkProjectPermission(projectId, req.user.id, 'owner');
    if (!permission.allowed) {
      return res.status(403).json({ error: 'Only project owners can remove members' });
    }

    // Don't allow removing yourself
    const { data: targetMember } = await supabase
      .from('project_members')
      .select('*')
      .eq('id', memberId)
      .eq('project_id', projectId)
      .single();

    if (!targetMember) {
      return res.status(404).json({ error: 'Member not found' });
    }

    if (targetMember.user_id === req.user.id) {
      return res.status(400).json({ error: 'Cannot remove yourself from the project' });
    }

    // Soft delete - mark as removed
    const { error } = await supabase
      .from('project_members')
      .update({
        status: 'removed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', memberId)
      .eq('project_id', projectId);

    if (error) {
      console.error('Error removing member:', error);
      return res.status(500).json({ error: 'Failed to remove member' });
    }

    console.log('✅ Member removed:', memberId, 'from project', projectId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({ error: 'Failed to remove member' });
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
    case 'invoice.payment_succeeded':
      const invoice = event.data.object;
      
      // When payment succeeds, update subscription status to active
      if (invoice.subscription) {
        console.log('💰 Invoice payment succeeded for subscription:', invoice.subscription);
        
        const { error: updateError } = await supabase
          .from('subscriptions')
          .update({
            status: 'active',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', invoice.subscription);

        if (updateError) {
          console.error('Error updating subscription status to active:', updateError);
        } else {
          console.log('✅ Subscription marked as active');
        }
      }
      break;

    case 'invoice.payment_failed':
      const failedInvoice = event.data.object;
      
      // When payment fails, update subscription status
      if (failedInvoice.subscription) {
        console.log('❌ Invoice payment failed for subscription:', failedInvoice.subscription);
        
        const { error: failError } = await supabase
          .from('subscriptions')
          .update({
            status: 'past_due',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', failedInvoice.subscription);

        if (failError) {
          console.error('Error updating subscription status to past_due:', failError);
        }
      }
      break;

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

// Create Subscription Intent for custom checkout
app.post('/api/stripe/create-subscription-intent', verifyAuth, async (req, res) => {
  try {
    const { price_id, plan } = req.body;
    
    if (!price_id) {
      return res.status(400).json({ error: 'Missing price_id parameter' });
    }

    console.log('💳 Creating subscription intent for:', {
      priceId: price_id,
      plan: plan,
      userEmail: req.user.email,
      userId: req.user.id
    });

    // Check if customer already exists
    let customer;
    const existingCustomers = await stripe.customers.list({
      email: req.user.email,
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
      console.log('✅ Found existing customer:', customer.id);
    } else {
      // Create a new customer
      customer = await stripe.customers.create({
        email: req.user.email,
        metadata: {
          userId: req.user.id,
        },
      });
      console.log('✅ Created new customer:', customer.id);
    }

    // Retrieve the price to get the amount
    let price;
    try {
      price = await stripe.prices.retrieve(price_id);
    } catch (error) {
      console.error('❌ Price not found:', price_id);
      return res.status(404).json({ 
        error: 'Price not found',
        price_id: price_id,
        hint: 'Check that the price_id is correct in your Stripe Dashboard'
      });
    }

    // Create a subscription with payment_behavior: 'default_incomplete'
    // This creates a subscription that requires payment confirmation
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: price_id }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        userId: req.user.id,
        plan: plan || 'student',
      },
    });

    // Get the client secret from the payment intent
    const invoice = subscription.latest_invoice;
    const paymentIntent = invoice?.payment_intent;

    if (!paymentIntent || typeof paymentIntent === 'string') {
      throw new Error('Failed to create payment intent for subscription');
    }

    console.log('✅ Subscription created:', subscription.id);
    console.log('✅ Payment intent created:', paymentIntent.id);

    // Store the subscription in our database (pending status until payment completes)
    const { error: dbError } = await supabase
      .from('subscriptions')
      .upsert({
        user_id: req.user.id,
        plan: plan || 'student',
        stripe_customer_id: customer.id,
        stripe_subscription_id: subscription.id,
        status: 'pending',
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });

    if (dbError) {
      console.error('Warning: Failed to store subscription in database:', dbError);
      // Don't fail the request, just log the warning
    }

    res.json({
      subscriptionId: subscription.id,
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    console.error('❌ Error creating subscription intent:', error);
    console.error('   Error type:', error.type);
    console.error('   Error message:', error.message);
    
    res.status(500).json({ 
      error: 'Failed to create subscription',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
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
