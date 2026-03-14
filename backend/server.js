import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { S3Client } from '@aws-sdk/client-s3';
import { SESClient } from '@aws-sdk/client-ses';
import { createClient } from '@supabase/supabase-js';
import rateLimit from 'express-rate-limit';
import Stripe from 'stripe';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { createAuthMiddleware } from './middleware/auth.js';
import { createUtils } from './lib/utils.js';
import { createS3Routes } from './routes/s3.js';
import { createProjectRoutes } from './routes/projects.js';
import { createSyncRoutes } from './routes/sync.js';
import { createStripeRoutes } from './routes/stripe.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

const PORT = process.env.PORT || 3000;
const BUCKET_NAME = process.env.S3_BUCKET_NAME;

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.STRIPE_SECRET_KEY) {
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const sesClient = new SESClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }
    : undefined,
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });

// ---------------------------------------------------------------------------
// Middleware & utils factories
// ---------------------------------------------------------------------------
const { verifyAuth, validateS3Key, checkProjectPermission } = createAuthMiddleware(supabase);

const INVITE_FROM_EMAIL = process.env.INVITE_FROM_EMAIL;
const { resolvePendingInvites, sendProjectInviteEmail, ensureS3Cors } = createUtils({
  supabase, sesClient, s3Client, BUCKET_NAME, INVITE_FROM_EMAIL,
});

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// Global rate limiter — skip the webhook route (needs raw body, not JSON)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  skip: (req) => req.originalUrl === '/api/stripe/webhook',
});
app.use('/api', apiLimiter);

// Stripe webhook must be mounted BEFORE express.json() so the raw body is preserved
app.use('/api/stripe', createStripeRoutes({ stripe, supabase, verifyAuth }));

// JSON body parser for all other routes
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Route modules
app.use('/api/aws', createS3Routes({ s3Client, BUCKET_NAME, verifyAuth, validateS3Key }));
app.use('/api/projects', createProjectRoutes({ supabase, verifyAuth, checkProjectPermission, resolvePendingInvites, sendProjectInviteEmail }));
app.use('/api/projects/:projectId/sync', createSyncRoutes({ s3Client, BUCKET_NAME, verifyAuth, checkProjectPermission }));

// Error handling
app.use((_err, _req, res, _next) => {
  res.status(500).json({ error: 'Internal server error' });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
ensureS3Cors();

app.listen(PORT, () => {
  // Server started
});
