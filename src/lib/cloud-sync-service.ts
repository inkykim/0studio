import { projectAPI, CloudProject } from './project-api';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

async function getAuthHeaders(): Promise<HeadersInit> {
  const { supabase } = await import('./supabase');
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  return {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };
}

export interface RemoteCommitInfo {
  id: string;
  message: string;
  timestamp: number;
  parentCommitId: string | null;
  branchId: string;
  starred: boolean;
}

export interface RemoteBranchInfo {
  id: string;
  name: string;
  headCommitId: string;
  color: string;
  isMain: boolean;
  parentBranchId?: string;
  originCommitId?: string;
}

export interface RemoteTreeData {
  version: string;
  activeBranchId: string | null;
  currentCommitId: string | null;
  previouslyWorkingBranchId?: string | null;
  branches: RemoteBranchInfo[];
  commits: RemoteCommitInfo[];
  cloudSyncedCommitIds: string[];
}

export interface SyncStatus {
  localOnly: string[];
  remoteOnly: string[];
  synced: string[];
}

// Local storage helpers for mapping cloud projects to local file paths (per-user)
function getCloudPathsKey(userId: string): string {
  return `0studio_cloud_paths_${userId}`;
}

function getSeenProjectsKey(userId: string): string {
  return `0studio_seen_shared_projects_${userId}`;
}

export function getCloudProjectPaths(userId: string): Record<string, string> {
  try {
    const stored = localStorage.getItem(getCloudPathsKey(userId));
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

export function setCloudProjectPath(userId: string, projectId: string, localPath: string): void {
  const paths = getCloudProjectPaths(userId);
  paths[projectId] = localPath;
  localStorage.setItem(getCloudPathsKey(userId), JSON.stringify(paths));
}

export function getLocalPathForProject(userId: string, projectId: string): string | null {
  const paths = getCloudProjectPaths(userId);
  return paths[projectId] || null;
}

export function findProjectIdByLocalPath(userId: string, localPath: string): string | null {
  const paths = getCloudProjectPaths(userId);
  for (const [projectId, path] of Object.entries(paths)) {
    if (path === localPath) return projectId;
  }
  return null;
}

export function getSeenSharedProjectIds(userId: string): string[] {
  try {
    const stored = localStorage.getItem(getSeenProjectsKey(userId));
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function markProjectAsSeen(userId: string, projectId: string): void {
  const seen = getSeenSharedProjectIds(userId);
  if (!seen.includes(projectId)) {
    seen.push(projectId);
    localStorage.setItem(getSeenProjectsKey(userId), JSON.stringify(seen));
  }
}

class CloudSyncService {
  /**
   * Resolve a local file path to its cloud project. Returns null if not registered.
   */
  async getCloudProject(filePath: string): Promise<CloudProject | null> {
    return projectAPI.getProjectByFilePath(filePath);
  }

  /**
   * Get a presigned upload URL for a project file.
   */
  async getPushUrl(projectId: string, fileKey: string): Promise<{ upload_url: string; s3_key: string }> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${BACKEND_URL}/api/projects/${projectId}/sync/push-url`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ file_key: fileKey }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || 'Failed to get push URL');
    }

    return response.json();
  }

  /**
   * Get a presigned download URL for a project file.
   */
  async getPullUrl(projectId: string, fileKey: string): Promise<{ download_url: string; s3_key: string }> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${BACKEND_URL}/api/projects/${projectId}/sync/pull-url`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ file_key: fileKey }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || 'Failed to get pull URL');
    }

    return response.json();
  }

  /**
   * List all files synced for a project.
   */
  async listRemoteFiles(projectId: string): Promise<{ file_key: string; size: number; lastModified: string }[]> {
    const headers = await getAuthHeaders();
    const response = await fetch(`${BACKEND_URL}/api/projects/${projectId}/sync/list`, {
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || 'Failed to list remote files');
    }

    const data = await response.json();
    return data.files;
  }

  /**
   * Upload a file buffer to S3 via presigned URL.
   */
  async uploadFile(uploadUrl: string, data: ArrayBuffer | string): Promise<void> {
    const body = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      body,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }
  }

  /**
   * Download a file from S3 via presigned URL as ArrayBuffer.
   */
  async downloadFile(downloadUrl: string): Promise<ArrayBuffer> {
    const response = await fetch(downloadUrl);

    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }

    return response.arrayBuffer();
  }

  /**
   * Download text content from S3 via presigned URL.
   */
  async downloadText(downloadUrl: string): Promise<string> {
    const response = await fetch(downloadUrl);

    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }

    return response.text();
  }

  /**
   * Push tree.json to the cloud.
   */
  async pushTreeJson(projectId: string, treeData: RemoteTreeData): Promise<void> {
    const { upload_url } = await this.getPushUrl(projectId, 'tree.json');
    await this.uploadFile(upload_url, JSON.stringify(treeData, null, 2));
  }

  /**
   * Pull tree.json from the cloud. Returns null if not found.
   */
  async pullTreeJson(projectId: string): Promise<RemoteTreeData | null> {
    try {
      const { download_url } = await this.getPullUrl(projectId, 'tree.json');
      const text = await this.downloadText(download_url);
      return JSON.parse(text) as RemoteTreeData;
    } catch (error: any) {
      if (error.message?.includes('not found') || error.message?.includes('404') || error.message?.includes('NoSuchKey')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Push a single commit file (.3dm) to the cloud.
   */
  async pushCommitFile(projectId: string, commitId: string, fileBuffer: ArrayBuffer): Promise<void> {
    const fileKey = `commits/${commitId}.3dm`;
    const { upload_url } = await this.getPushUrl(projectId, fileKey);
    await this.uploadFile(upload_url, fileBuffer);
  }

  /**
   * Pull a single commit file (.3dm) from the cloud.
   */
  async pullCommitFile(projectId: string, commitId: string): Promise<ArrayBuffer> {
    const fileKey = `commits/${commitId}.3dm`;
    const { download_url } = await this.getPullUrl(projectId, fileKey);
    return this.downloadFile(download_url);
  }

  /**
   * Compare local commits with remote to determine sync status.
   */
  computeSyncStatus(localCommitIds: string[], cloudSyncedIds: string[], remoteCommitIds: string[]): SyncStatus {
    const localSet = new Set(localCommitIds);
    const remoteSet = new Set(remoteCommitIds);
    const syncedSet = new Set(cloudSyncedIds);

    return {
      localOnly: localCommitIds.filter(id => !syncedSet.has(id)),
      remoteOnly: remoteCommitIds.filter(id => !localSet.has(id)),
      synced: localCommitIds.filter(id => syncedSet.has(id) && remoteSet.has(id)),
    };
  }

  /**
   * Download the latest commit .3dm file for a project (for first-time pull).
   * Returns the tree data and the latest commit's binary data.
   */
  async downloadLatestSnapshot(projectId: string): Promise<{
    treeData: RemoteTreeData;
    latestCommitId: string;
    commitBuffer: ArrayBuffer;
  } | null> {
    const treeData = await this.pullTreeJson(projectId);
    if (!treeData) return null;

    // Find the latest commit on the active branch
    const activeBranch = treeData.branches.find(b => b.id === treeData.activeBranchId);
    if (!activeBranch) return null;

    const latestCommitId = activeBranch.commits[activeBranch.commits.length - 1]?.id;
    if (!latestCommitId) return null;

    const commitBuffer = await this.pullCommitFile(projectId, latestCommitId);
    return { treeData, latestCommitId, commitBuffer };
  }
}

export const cloudSyncService = new CloudSyncService();
