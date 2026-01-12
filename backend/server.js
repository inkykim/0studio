import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectVersionsCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@supabase/supabase-js';
import rateLimit from 'express-rate-limit';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
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
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role key for backend
);

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
    
    if (error || !user) {
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
