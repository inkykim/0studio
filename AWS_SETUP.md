# AWS S3 Setup Guide for 0studio

Complete guide to set up AWS S3 storage for your 0studio application.

## Prerequisites

- AWS account with $10k credits (you have this!)
- AWS CLI installed (optional, but helpful)
- Supabase project already set up

## Step 1: Create S3 Bucket

### Option A: Using AWS Console (Recommended for beginners)

1. **Go to AWS S3 Console**
   - Visit https://console.aws.amazon.com/s3/
   - Click "Create bucket"

2. **Configure Bucket**
   - **Bucket name**: `0studio-files` (must be globally unique, add your initials if needed)
   - **AWS Region**: Choose closest to your users (e.g., `us-east-1`, `us-west-2`, `eu-west-1`)
   - **Object Ownership**: ACLs disabled (recommended)
   - **Block Public Access**: ✅ Keep all boxes checked (we use presigned URLs, not public access)
   - **Bucket Versioning**: ✅ Enable (CRITICAL - required for file versioning)
   - **Default encryption**: Enable (recommended)
   - Click "Create bucket"

3. **Enable Versioning** (if not done above)
   - Click on your bucket
   - Go to "Properties" tab
   - Scroll to "Bucket Versioning"
   - Click "Edit" → Select "Enable" → Save

### Option B: Using AWS CLI

```bash
# Create bucket
aws s3api create-bucket \
  --bucket 0studio-files \
  --region us-east-1 \
  --create-bucket-configuration LocationConstraint=us-east-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket 0studio-files \
  --versioning-configuration Status=Enabled
```

## Step 2: Create IAM User for Backend

1. **Go to IAM Console**
   - Visit https://console.aws.amazon.com/iam/
   - Click "Users" → "Create user"

2. **Set User Details**
   - **User name**: `0studio-backend`
   - Click "Next"

3. **Set Permissions**
   - Select "Attach policies directly"
   - Search for and select: `AmazonS3FullAccess`
   - ⚠️ **For production**, create a custom policy with minimal permissions (see below)
   - Click "Next" → "Create user"

4. **Save Credentials**
   - Click on the newly created user
   - Go to "Security credentials" tab
   - Click "Create access key"
   - Select "Application running outside AWS"
   - Click "Create access key"
   - **IMPORTANT**: Copy both:
     - Access Key ID
     - Secret Access Key
   - ⚠️ You won't be able to see the secret key again!

### Custom IAM Policy (Recommended for Production)

Instead of `AmazonS3FullAccess`, create a custom policy with minimal permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket",
        "s3:ListBucketVersions",
        "s3:GetObjectVersion"
      ],
      "Resource": [
        "arn:aws:s3:::0studio-files",
        "arn:aws:s3:::0studio-files/*"
      ]
    }
  ]
}
```

## Step 3: Get Supabase Service Role Key

1. **Go to Supabase Dashboard**
   - Visit https://app.supabase.com
   - Select your project

2. **Get Service Role Key**
   - Go to Settings → API
   - Find "Project API keys"
   - Copy the `service_role` key (NOT the `anon` key!)
   - ⚠️ This key has admin access - keep it secret!

## Step 4: Configure Backend

1. **Create `.env` file**
   ```bash
   cd backend
   cp .env.example .env
   ```

2. **Edit `.env` file** with your values:
   ```env
   # AWS Configuration
   AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
   AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
   AWS_REGION=us-east-1
   S3_BUCKET_NAME=0studio-files

   # Supabase Configuration
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

   # Server Configuration
   PORT=3000
   FRONTEND_URL=http://localhost:5173
   ```

## Step 5: Test Backend

1. **Start the backend server**
   ```bash
   cd backend
   npm run dev
   ```

2. **Test health endpoint**
   ```bash
   curl http://localhost:3000/health
   ```
   Should return: `{"status":"ok","timestamp":"..."}`

3. **Test authenticated endpoint** (requires Supabase token)
   - First, sign in to your app and get the JWT token from browser DevTools
   - Or use Supabase Dashboard → Authentication → Users → Create a test token
   
   ```bash
   curl -H "Authorization: Bearer YOUR_SUPABASE_JWT_TOKEN" \
     "http://localhost:3000/api/aws/presigned-upload?key=org-test123/project-test456/models/test.3dm"
   ```

## Step 6: Update Frontend Environment

Add to your frontend `.env` file (in project root):

```env
VITE_AWS_API_URL=http://localhost:3000/api/aws
```

For production, update this to your deployed backend URL.

## Step 7: Verify Everything Works

1. **Start backend**: `cd backend && npm run dev`
2. **Start frontend**: `npm run dev`
3. **Sign in** to your app
4. **Try uploading a file** (when you implement the upload feature)

## Cost Estimation

With your $10k AWS credits, here's what to expect:

**Monthly costs** (example with 100 active users, 10GB storage):
- **S3 Storage**: ~$0.023/GB/month = $0.23 for 10GB
- **S3 Requests**: ~$0.005 per 1,000 requests = ~$0.50/month
- **Data Transfer Out**: First 100GB free, then ~$0.09/GB = ~$1-2/month
- **Total**: ~$2-3/month

**Your credits will last**: ~3,000-5,000 months (250-400 years!) 😄

## Troubleshooting

### "Access Denied" errors
- Check IAM user has correct permissions
- Verify bucket name matches `.env` file
- Ensure bucket region matches `AWS_REGION` in `.env`

### "Bucket not found" errors
- Verify bucket name is correct (case-sensitive)
- Check AWS region matches
- Ensure bucket exists in your AWS account

### "Invalid token" errors
- Verify Supabase URL is correct
- Check service role key (not anon key)
- Ensure user is authenticated in frontend

### "S3 key does not belong to user" errors
- S3 keys must start with `org-{userId}/`
- Verify user ID matches authenticated user
- Check the `generateS3Key` function format

### Version ID not returned on upload
- Ensure bucket versioning is enabled
- Check bucket properties → Versioning → Enabled

## Next Steps

1. ✅ Backend API is set up
2. ✅ Frontend AWS API is updated
3. ⏭️ Integrate with VersionControlContext to store commits in S3
4. ⏭️ Add UI for syncing commits to cloud
5. ⏭️ Deploy backend to production

## Security Checklist

- ✅ S3 bucket has versioning enabled
- ✅ Bucket has Block Public Access enabled
- ✅ IAM user has minimal required permissions
- ✅ Backend verifies Supabase JWT tokens
- ✅ Backend validates user ownership of S3 keys
- ✅ Rate limiting enabled on API endpoints
- ✅ `.env` file is in `.gitignore`
- ✅ Service role key is kept secret

## Production Deployment

When ready to deploy:

1. **Deploy backend** to:
   - AWS Elastic Beanstalk (recommended)
   - AWS Lambda + API Gateway
   - VPS (DigitalOcean, Linode, etc.)

2. **Update frontend `.env`**:
   ```env
   VITE_AWS_API_URL=https://your-backend-domain.com/api/aws
   ```

3. **Set production environment variables** on your hosting platform

4. **Enable HTTPS** (required for production)

5. **Set up monitoring** (CloudWatch, etc.)

## Support

If you run into issues:
1. Check backend logs: `cd backend && npm run dev`
2. Check browser console for frontend errors
3. Verify all environment variables are set correctly
4. Test backend endpoints with curl/Postman
