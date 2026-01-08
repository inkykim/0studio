# Supabase & AWS S3 Setup Guide

This document outlines the setup steps for the new Supabase authentication and cloud storage integration.

## Prerequisites

1. **Install Supabase client** (if not already installed):
   ```bash
   npm install @supabase/supabase-js
   ```

2. **Supabase Project**: Create a project at https://supabase.com

3. **AWS S3 Bucket**: Set up an S3 bucket with versioning enabled (for later integration)

## Environment Variables

Create a `.env` file in the project root (or add to existing `.env`):

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_AWS_API_URL=http://localhost:3000/api/aws  # Optional, for backend API
```

## Supabase Database Setup

Run the following SQL in your Supabase SQL Editor:

```sql
-- 1. Projects: Each row is ONE file location
create table projects (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  s3_key text not null, -- e.g. "org_123/proj_456/main.obj"
  owner_id uuid references auth.users(id),
  created_at timestamptz default now()
);

-- 2. Commits: Each row is ONE file version
create table commits (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade,
  parent_commit_id uuid references commits(id),
  message text,
  author_id uuid references auth.users(id),
  s3_version_id text not null, -- The AWS Version ID
  created_at timestamptz default now()
);

-- 3. Branches: Pointers to specific commits
create table branches (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade,
  name text not null,
  head_commit_id uuid references commits(id),
  unique (project_id, name)
);

-- Enable Row Level Security (RLS)
alter table projects enable row level security;
alter table commits enable row level security;
alter table branches enable row level security;

-- Policies: Users can only access their own projects
create policy "Users can view their own projects"
  on projects for select
  using (auth.uid() = owner_id);

create policy "Users can create their own projects"
  on projects for insert
  with check (auth.uid() = owner_id);

create policy "Users can update their own projects"
  on projects for update
  using (auth.uid() = owner_id);

create policy "Users can delete their own projects"
  on projects for delete
  using (auth.uid() = owner_id);

-- Commits: Users can access commits for their projects
create policy "Users can view commits for their projects"
  on commits for select
  using (
    exists (
      select 1 from projects
      where projects.id = commits.project_id
      and projects.owner_id = auth.uid()
    )
  );

create policy "Users can create commits for their projects"
  on commits for insert
  with check (
    exists (
      select 1 from projects
      where projects.id = commits.project_id
      and projects.owner_id = auth.uid()
    )
  );

-- Branches: Users can access branches for their projects
create policy "Users can view branches for their projects"
  on branches for select
  using (
    exists (
      select 1 from projects
      where projects.id = branches.project_id
      and projects.owner_id = auth.uid()
    )
  );

create policy "Users can create branches for their projects"
  on branches for insert
  with check (
    exists (
      select 1 from projects
      where projects.id = branches.project_id
      and projects.owner_id = auth.uid()
    )
  );

create policy "Users can update branches for their projects"
  on branches for update
  using (
    exists (
      select 1 from projects
      where projects.id = branches.project_id
      and projects.owner_id = auth.uid()
    )
  );

create policy "Users can delete branches for their projects"
  on branches for delete
  using (
    exists (
      select 1 from projects
      where projects.id = branches.project_id
      and projects.owner_id = auth.uid()
    )
  );
```

## Features Implemented

### ✅ Authentication
- **AuthContext**: Manages user session state
- **Auth Components**: Login, Signup, Password Reset dialogs
- **UserMenu**: Display user email and sign out button in TitleBar
- **Session Management**: Auto-refresh tokens, persist sessions

### ✅ Supabase API Service
- **Projects**: CRUD operations for projects
- **Commits**: Create, read, and query commits with parent relationships
- **Branches**: Create, read, update, and delete branches
- **Error Handling**: Toast notifications for errors

### ✅ AWS S3 API Service (Dummy)
- **Presigned URLs**: Methods for upload/download URLs
- **File Upload**: Upload with version ID tracking
- **File Download**: Download specific versions
- **S3 Key Generation**: Helper for generating S3 paths

## Next Steps

### 1. Backend API for AWS S3
The `aws-api.ts` service currently has dummy implementations. You need to create a backend API that:

- Generates presigned URLs for S3 uploads/downloads
- Handles file uploads and captures `x-amz-version-id` headers
- Generates presigned URLs with `VersionId` parameter for downloads
- Lists file versions
- Deletes specific file versions

**Example Backend Endpoint** (Node.js/Express):
```javascript
// GET /api/aws/presigned-upload?key=...
app.get('/api/aws/presigned-upload', async (req, res) => {
  const { key } = req.query;
  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
  });
  const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  res.json({ url, expiresIn: 3600 });
});
```

### 2. Enable S3 Versioning
In your AWS S3 bucket settings, enable versioning:
```bash
aws s3api put-bucket-versioning \
  --bucket your-bucket-name \
  --versioning-configuration Status=Enabled
```

### 3. Integration with VersionControlContext
Update `VersionControlContext` to:
- Create projects in Supabase when opening a file
- Store commits in Supabase with S3 version IDs
- Fetch commit history from Supabase
- Restore commits by downloading from S3

### 4. Project Management
Add UI for:
- Listing user's projects
- Creating new projects
- Switching between projects
- Project settings

## Testing

1. **Test Authentication**:
   - Sign up with a new email
   - Check email for verification link
   - Sign in with credentials
   - Verify UserMenu shows email
   - Test sign out

2. **Test Supabase API**:
   - Create a project via `supabaseAPI.createProject()`
   - Create commits via `supabaseAPI.createCommit()`
   - Query commits via `supabaseAPI.getCommits()`
   - Create branches via `supabaseAPI.createBranch()`

3. **Test AWS API** (after backend is set up):
   - Get presigned upload URL
   - Upload a file and capture version ID
   - Get presigned download URL for specific version
   - Download file from S3

## Architecture Notes

- **S3 Storage**: Files are stored with versioning enabled. Each commit stores the S3 version ID.
- **Delta Commits**: When creating a new commit, only changed files get new S3 versions. Unchanged files reference the same version ID.
- **Database as Commit Log**: Supabase acts as the "commit log" tracking which S3 version ID belongs to each commit.
- **Row Level Security**: All tables have RLS enabled so users can only access their own data.

