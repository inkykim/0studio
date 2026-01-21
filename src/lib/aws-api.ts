// AWS S3 API service
// Connects to backend API that handles AWS operations securely

export interface PresignedUrlResponse {
  url: string;
  expiresIn: number; // seconds
}

export interface UploadResponse {
  versionId: string;
  etag: string;
}

export interface S3FileMetadata {
  key: string;
  versionId: string;
  size: number;
  lastModified: string;
}

// ==================== NEW FILES API TYPES ====================
// Following the new architecture with explicit versioning

export interface UploadUrlRequest {
  project_id: string;
  model_id: string;
  version_name: string;
  file_name: string;
  file_size?: number;
}

export interface UploadUrlResponse {
  upload_url: string;
  s3_key: string;
}

export interface ConfirmUploadRequest {
  model_id: string;
  s3_key: string;
  version_name: string;
  file_size?: number;
}

export interface ConfirmUploadResponse {
  success: boolean;
  version: ModelVersion;
}

export interface DownloadUrlRequest {
  s3_key: string;
}

export interface DownloadUrlResponse {
  download_url: string;
}

export interface ModelVersion {
  id: string;
  model_id: string;
  s3_key: string;
  version_name: string;
  file_size: number;
  uploaded_by: string;
  is_current: boolean;
  created_at: string;
}

export interface Model {
  id: string;
  project_id: string;
  name: string;
  created_at: string;
  model_versions?: ModelVersion[];
}

export interface CreateModelRequest {
  project_id: string;
  name: string;
}

export interface CreateModelResponse {
  model: Model;
}

export class AWSS3API {
  private baseUrl: string;

  constructor() {
    // Use VITE_BACKEND_URL for consistency, fallback to VITE_AWS_API_URL for backward compatibility
    const backendUrl = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_AWS_API_URL || 'http://localhost:3000';
    this.baseUrl = `${backendUrl}/api/aws`;
  }

  /**
   * Get a presigned URL for uploading a file to S3
   * @param s3Key - The S3 key (path) where the file should be uploaded
   * @param expiresIn - Expiration time in seconds (default: 3600 = 1 hour)
   */
  async getPresignedUploadUrl(s3Key: string, expiresIn: number = 3600): Promise<PresignedUrlResponse> {
    const { supabase } = await import('@/lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error('User must be authenticated to upload files');
    }

    const response = await fetch(
      `${this.baseUrl}/presigned-upload?key=${encodeURIComponent(s3Key)}&expires=${expiresIn}`,
      {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      }
    );
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Failed to get presigned upload URL: ${response.statusText}`);
    }
    
    return await response.json();
  }

  /**
   * Get a presigned URL for downloading a specific version of a file from S3
   * @param s3Key - The S3 key (path) of the file
   * @param versionId - The S3 version ID to download
   * @param expiresIn - Expiration time in seconds (default: 3600 = 1 hour)
   */
  async getPresignedDownloadUrl(
    s3Key: string,
    versionId: string,
    expiresIn: number = 3600
  ): Promise<PresignedUrlResponse> {
    const { supabase } = await import('@/lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error('User must be authenticated to download files');
    }

    const response = await fetch(
      `${this.baseUrl}/presigned-download?key=${encodeURIComponent(s3Key)}&versionId=${versionId}&expires=${expiresIn}`,
      {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      }
    );
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Failed to get presigned download URL: ${response.statusText}`);
    }
    
    return await response.json();
  }

  /**
   * Upload a file directly to S3 using a presigned URL
   * Returns the S3 version ID from the response header
   * @param presignedUrl - The presigned URL from getPresignedUploadUrl
   * @param fileData - The file data (ArrayBuffer, Blob, or File)
   * @param contentType - Optional content type
   */
  async uploadFile(
    presignedUrl: string,
    fileData: ArrayBuffer | Blob | File,
    contentType?: string
  ): Promise<UploadResponse> {
    try {
      const response = await fetch(presignedUrl, {
        method: 'PUT',
        body: fileData,
        headers: contentType ? { 'Content-Type': contentType } : {},
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      // Extract version ID from response header (S3 returns this when versioning is enabled)
      const versionId = response.headers.get('x-amz-version-id');
      const etag = response.headers.get('etag') || '';

      if (!versionId) {
        throw new Error('S3 version ID not found in response. Make sure versioning is enabled on your S3 bucket.');
      }

      return {
        versionId,
        etag,
      };
    } catch (error) {
      console.error('Error uploading file:', error);
      throw error;
    }
  }

  /**
   * Download a file from S3 using a presigned URL
   * @param presignedUrl - The presigned URL from getPresignedDownloadUrl
   */
  async downloadFile(presignedUrl: string): Promise<ArrayBuffer> {
    try {
      const response = await fetch(presignedUrl);
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      return await response.arrayBuffer();
    } catch (error) {
      console.error('Error downloading file:', error);
      throw error;
    }
  }

  /**
   * List all versions of a file in S3
   * @param s3Key - The S3 key (path) of the file
   */
  async listFileVersions(s3Key: string): Promise<S3FileMetadata[]> {
    const { supabase } = await import('@/lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error('User must be authenticated to list file versions');
    }

    const response = await fetch(
      `${this.baseUrl}/list-versions?key=${encodeURIComponent(s3Key)}`,
      {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      }
    );
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Failed to list versions: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.versions;
  }

  /**
   * Delete a specific version of a file from S3
   * @param s3Key - The S3 key (path) of the file
   * @param versionId - The S3 version ID to delete
   */
  async deleteFileVersion(s3Key: string, versionId: string): Promise<void> {
    const { supabase } = await import('@/lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error('User must be authenticated to delete file versions');
    }

    const response = await fetch(`${this.baseUrl}/delete-version`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ key: s3Key, versionId }),
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Failed to delete version: ${response.statusText}`);
    }
  }

  /**
   * Generate S3 key from project and file path
   * Format: org-{userId}/project-{projectId}/models/{filename}
   * @deprecated Use FilesAPI.generateS3Key() for new architecture
   */
  generateS3Key(userId: string, projectId: string, filename: string, folder: string = 'models'): string {
    return `org-${userId}/project-${projectId}/${folder}/${filename}`;
  }
}

// Export singleton instance
export const awsS3API = new AWSS3API();


// ==================== NEW FILES API ====================
// This follows the new architecture with explicit versioning
// S3 key format: users/{user_id}/projects/{project_id}/models/{model_id}/versions/{version_name}-{original_file_name}

export class FilesAPI {
  private baseUrl: string;

  constructor() {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_AWS_API_URL || 'http://localhost:3000';
    this.baseUrl = `${backendUrl}/files`;
  }

  /**
   * Get auth headers with Supabase JWT
   */
  private async getAuthHeaders(): Promise<HeadersInit> {
    const { supabase } = await import('@/lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error('User must be authenticated');
    }

    return {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Generate S3 key from components
   * Format: users/{user_id}/projects/{project_id}/models/{model_id}/versions/{version_name}-{original_file_name}
   */
  generateS3Key(userId: string, projectId: string, modelId: string, versionName: string, fileName: string): string {
    return `users/${userId}/projects/${projectId}/models/${modelId}/versions/${versionName}-${fileName}`;
  }

  /**
   * POST /files/upload-url
   * Request a pre-signed URL for uploading a new version
   */
  async getUploadUrl(request: UploadUrlRequest): Promise<UploadUrlResponse> {
    const headers = await this.getAuthHeaders();

    const response = await fetch(`${this.baseUrl}/upload-url`, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Failed to get upload URL: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * POST /files/confirm-upload
   * Confirm upload and persist metadata
   */
  async confirmUpload(request: ConfirmUploadRequest): Promise<ConfirmUploadResponse> {
    const headers = await this.getAuthHeaders();

    const response = await fetch(`${this.baseUrl}/confirm-upload`, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Failed to confirm upload: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * POST /files/download-url
   * Request a pre-signed URL for downloading a file
   */
  async getDownloadUrl(request: DownloadUrlRequest): Promise<DownloadUrlResponse> {
    const headers = await this.getAuthHeaders();

    const response = await fetch(`${this.baseUrl}/download-url`, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Failed to get download URL: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Upload a file using a pre-signed URL
   */
  async uploadFile(
    uploadUrl: string,
    fileData: ArrayBuffer | Blob | File,
    contentType?: string
  ): Promise<void> {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      body: fileData,
      headers: contentType ? { 'Content-Type': contentType } : {},
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }
  }

  /**
   * Download a file using a pre-signed URL
   */
  async downloadFile(downloadUrl: string): Promise<ArrayBuffer> {
    const response = await fetch(downloadUrl);
    
    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }

    return await response.arrayBuffer();
  }

  /**
   * Upload a new version of a model
   * Complete flow: get URL -> upload file -> confirm upload
   */
  async uploadVersion(
    projectId: string,
    modelId: string,
    versionName: string,
    fileName: string,
    fileData: ArrayBuffer | Blob | File,
    contentType?: string
  ): Promise<ModelVersion> {
    // 1. Get file size
    const fileSize = fileData instanceof ArrayBuffer 
      ? fileData.byteLength 
      : fileData.size;

    // 2. Get presigned upload URL
    const { upload_url, s3_key } = await this.getUploadUrl({
      project_id: projectId,
      model_id: modelId,
      version_name: versionName,
      file_name: fileName,
      file_size: fileSize,
    });

    // 3. Upload file to S3
    await this.uploadFile(upload_url, fileData, contentType);

    // 4. Confirm upload and persist metadata
    const { version } = await this.confirmUpload({
      model_id: modelId,
      s3_key,
      version_name: versionName,
      file_size: fileSize,
    });

    return version;
  }

  /**
   * Download a version of a model by S3 key
   */
  async downloadVersion(s3Key: string): Promise<ArrayBuffer> {
    // 1. Get presigned download URL
    const { download_url } = await this.getDownloadUrl({ s3_key: s3Key });

    // 2. Download file
    return await this.downloadFile(download_url);
  }

  /**
   * GET /files/versions
   * List all versions of a model
   */
  async listVersions(modelId: string): Promise<ModelVersion[]> {
    const { supabase } = await import('@/lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error('User must be authenticated');
    }

    const response = await fetch(`${this.baseUrl}/versions?model_id=${encodeURIComponent(modelId)}`, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Failed to list versions: ${response.statusText}`);
    }

    const data = await response.json();
    return data.versions;
  }

  /**
   * POST /files/models
   * Create a new model within a project
   */
  async createModel(request: CreateModelRequest): Promise<Model> {
    const headers = await this.getAuthHeaders();

    const response = await fetch(`${this.baseUrl}/models`, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Failed to create model: ${response.statusText}`);
    }

    const data = await response.json();
    return data.model;
  }

  /**
   * GET /files/models
   * List all models in a project
   */
  async listModels(projectId: string): Promise<Model[]> {
    const { supabase } = await import('@/lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error('User must be authenticated');
    }

    const response = await fetch(`${this.baseUrl}/models?project_id=${encodeURIComponent(projectId)}`, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Failed to list models: ${response.statusText}`);
    }

    const data = await response.json();
    return data.models;
  }
}

// Export singleton instance for new architecture
export const filesAPI = new FilesAPI();

