# Local Development Setup - Stripe Integration

Quick guide to get Stripe checkout working locally.

## Step 1: Start the Backend Server

```bash
cd backend
npm install  # If you haven't already
npm run dev
```

You should see:
```
🚀 Backend API running on http://localhost:3000
```

## Step 2: Configure Backend Environment Variables

Create `backend/.env` file:

```bash
cd backend
touch .env
```

Add these required variables to `backend/.env`:

```env
# Supabase (required for auth)
SUPABASE_URL=https://fjgbfijgnkqzknwarptm.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Stripe (required for payments)
STRIPE_SECRET_KEY=sk_test_...  # Get from Stripe Dashboard → Developers → API keys
STRIPE_WEBHOOK_SECRET=whsec_...  # Optional for local dev (use Stripe CLI)

# Server Configuration
PORT=3000
FRONTEND_URL=http://localhost:5173

# AWS (optional - only needed for S3 features)
# AWS_ACCESS_KEY_ID=your_key_here
# AWS_SECRET_ACCESS_KEY=your_secret_here
# AWS_REGION=us-east-1
# S3_BUCKET_NAME=0studio-files
```

**Quick Copy-Paste Template:**
```bash
cd backend
cat > .env << 'EOF'
SUPABASE_URL=https://fjgbfijgnkqzknwarptm.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY_HERE
STRIPE_SECRET_KEY=YOUR_STRIPE_SECRET_KEY_HERE
PORT=3000
FRONTEND_URL=http://localhost:5173
EOF
```

Then edit `.env` and replace:
- `YOUR_SERVICE_ROLE_KEY_HERE` with your actual Supabase service role key
- `YOUR_STRIPE_SECRET_KEY_HERE` with your actual Stripe secret key

**Get Stripe Secret Key:**
1. Go to https://dashboard.stripe.com/test/apikeys
2. Copy the "Secret key" (starts with `sk_test_`)
3. Add it to `backend/.env` as `STRIPE_SECRET_KEY`

**Get Supabase Service Role Key:**
1. Go to https://app.supabase.com → Your Project → Settings → API
2. Copy the `service_role` key (NOT the `anon` key!)
3. Add it to `backend/.env` as `SUPABASE_SERVICE_ROLE_KEY`

## Step 3: Configure Frontend Environment Variables

Create `.env` file in the project root (if it doesn't exist):

```bash
# In project root (not backend/)
touch .env
```

Add to `.env`:

```env
VITE_BACKEND_URL=http://localhost:3000
```

## Step 4: Restart Both Servers

1. **Backend**: Make sure it's running on port 3000
   ```bash
   cd backend
   npm run dev
   ```

2. **Frontend**: Restart your dev server
   ```bash
   # Stop current server (Ctrl+C)
   npm run dev
   ```

## Step 5: Test the Connection

1. Open your app in the browser
2. Sign in
3. Go to Dashboard
4. Click "Subscribe - $10/month" button
5. Check browser console (F12) for any errors

## Troubleshooting

### "Failed to fetch" error

**Check 1: Is backend running?**
```bash
curl http://localhost:3000/health
```
Should return: `{"status":"ok","timestamp":"..."}`

**Check 2: Is VITE_BACKEND_URL set?**
- Check `.env` file in project root
- Make sure it has: `VITE_BACKEND_URL=http://localhost:3000`
- Restart frontend dev server after adding env vars

**Check 3: Check browser console**
- Open DevTools (F12) → Console tab
- Look for the actual error message
- Check Network tab to see if request is being made

**Check 4: CORS issues**
- Make sure `FRONTEND_URL=http://localhost:5173` in `backend/.env`
- Backend CORS is configured to allow `http://localhost:5173`

**Check 5: Missing Stripe key**
- Backend will crash if `STRIPE_SECRET_KEY` is missing
- Check backend console for errors
- Make sure `.env` file is in `backend/` directory (not root)

### "Not authenticated" error

- Make sure you're signed in
- Check that Supabase is configured correctly
- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env`

### Backend won't start

- Check that all required env variables are in `backend/.env`
- Make sure port 3000 is not in use: `lsof -i :3000`
- Check backend console for specific error messages

## Quick Test Commands

```bash
# Test backend health
curl http://localhost:3000/health

# Test if backend is accessible from frontend
# (Open browser console and run:)
fetch('http://localhost:3000/health').then(r => r.json()).then(console.log)
```

## Common Issues

1. **Backend not running**: Start it with `cd backend && npm run dev`
2. **Wrong port**: Make sure backend is on 3000 and frontend on 5173
3. **Env vars not loaded**: Restart both servers after adding env vars
4. **CORS error**: Check `FRONTEND_URL` in `backend/.env` matches your frontend URL
5. **Stripe key missing**: Backend needs `STRIPE_SECRET_KEY` to create checkout sessions

