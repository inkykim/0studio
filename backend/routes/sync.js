import { Router } from 'express';
import { PutObjectCommand, GetObjectCommand, ListObjectVersionsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Cloud sync routes — project-scoped S3 operations with member permission checks.
 * Mounted at /api/projects/:projectId/sync.
 *
 * NOTE: Express mergeParams is required so req.params.projectId is visible
 * from the parent mount path.
 */
export function createSyncRoutes({ s3Client, BUCKET_NAME, verifyAuth, checkProjectPermission }) {
  const router = Router({ mergeParams: true });

  // Get a presigned upload URL for a project file
  router.post('/push-url', verifyAuth, async (req, res) => {
    try {
      const { projectId } = req.params;
      const { file_key } = req.body;

      if (!file_key) {
        return res.status(400).json({ error: 'Missing file_key parameter' });
      }

      const permission = await checkProjectPermission(projectId, req.user.id, 'editor', req.user.email);
      if (!permission.allowed) {
        return res.status(403).json({ error: 'You need editor or owner access to push files' });
      }

      const s3Key = `projects/${projectId}/${file_key}`;

      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
      });

      const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

      res.json({ upload_url: url, s3_key: s3Key });
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  });

  // Get a presigned download URL for a project file
  router.post('/pull-url', verifyAuth, async (req, res) => {
    try {
      const { projectId } = req.params;
      const { file_key } = req.body;

      if (!file_key) {
        return res.status(400).json({ error: 'Missing file_key parameter' });
      }

      const permission = await checkProjectPermission(projectId, req.user.id, 'viewer', req.user.email);
      if (!permission.allowed) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const s3Key = `projects/${projectId}/${file_key}`;

      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
      });

      const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

      res.json({ download_url: url, s3_key: s3Key });
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.Code === 'NoSuchKey') {
        return res.status(404).json({ error: 'File not found in cloud storage' });
      }
      res.status(500).json({ error: 'Failed to generate download URL' });
    }
  });

  // Download file content directly (for browser clients that can't fetch S3 presigned URLs due to CORS)
  router.post('/pull-content', verifyAuth, async (req, res) => {
    try {
      const { projectId } = req.params;
      const { file_key } = req.body;

      if (!file_key) {
        return res.status(400).json({ error: 'Missing file_key parameter' });
      }

      const permission = await checkProjectPermission(projectId, req.user.id, 'viewer', req.user.email);
      if (!permission.allowed) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const s3Key = `projects/${projectId}/${file_key}`;

      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
      });

      const response = await s3Client.send(command);
      const body = await response.Body.transformToString();
      res.setHeader('Content-Type', 'application/json');
      res.send(body);
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.Code === 'NoSuchKey') {
        return res.status(404).json({ error: 'File not found in cloud storage' });
      }
      res.status(500).json({ error: 'Failed to download file' });
    }
  });

  // List all synced files for a project
  router.get('/list', verifyAuth, async (req, res) => {
    try {
      const { projectId } = req.params;

      const permission = await checkProjectPermission(projectId, req.user.id, 'viewer', req.user.email);
      if (!permission.allowed) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const prefix = `projects/${projectId}/`;

      const command = new ListObjectVersionsCommand({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
      });

      const response = await s3Client.send(command);

      const files = (response.Versions || [])
        .filter(v => v.IsLatest)
        .map(v => ({
          key: v.Key,
          file_key: v.Key.replace(prefix, ''),
          size: v.Size,
          lastModified: v.LastModified?.toISOString(),
        }));

      res.json({ files });
    } catch (error) {
      res.status(500).json({ error: 'Failed to list project files' });
    }
  });

  return router;
}
