import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { desktopAPI } from "@/lib/desktop-api";
import { LoadedModel } from "./ModelContext";
import { useAuth } from "./AuthContext";
import { supabaseAPI } from "@/lib/supabase-api";
import { awsS3API } from "@/lib/aws-api";
import { exportModelToBuffer } from "@/lib/rhino3dm-service";
import { storeFileBuffer, getFileBuffer } from "@/lib/commit-storage";
import { toast } from "sonner";

interface ModelCommit {
  id: string;
  message: string;
  timestamp: number;
  modelData?: LoadedModel; // Store the actual model data (for display/restore in UI)
  fileBuffer?: ArrayBuffer; // Store the exact .3dm file buffer (for exact file restoration)
  s3VersionId?: string; // S3 version ID for cloud commits
  supabaseCommitId?: string; // Supabase commit ID
  parentCommitId?: string; // Parent commit ID for cloud commits
  starred?: boolean; // Whether this commit is starred/favorited
}

interface VersionControlContextType {
  // Model tracking
  currentModel: string | null;
  modelName: string | null;
  commits: ModelCommit[];
  currentCommitId: string | null;
  hasUnsavedChanges: boolean;
  isProcessingAICommit: boolean;
  currentProjectId: string | null; // Supabase project ID
  isCloudEnabled: boolean; // Whether cloud sync is enabled
  
  // Actions
  setCurrentModel: (path: string) => void;
  commitModelChanges: (message: string, currentModelData?: LoadedModel) => Promise<void>;
  commitWithAI: (message: string) => Promise<{ success: boolean; error?: string }>;
  createInitialCommit: (modelData: LoadedModel, fileBuffer?: ArrayBuffer) => void;
  restoreToCommit: (commitId: string) => Promise<boolean>;
  pullFromCommit: (commitId: string) => Promise<boolean>; // Pull commit to local file (updates file on disk)
  markUnsavedChanges: () => void;
  clearUnsavedChanges: () => void;
  clearCurrentModel: () => void;
  pullFromCloud: () => Promise<void>; // Pull commits from cloud
  toggleStarCommit: (commitId: string) => void; // Toggle star status of a commit
  getStarredCommits: () => ModelCommit[]; // Get all starred commits
  
  // Gallery mode
  isGalleryMode: boolean;
  selectedCommitIds: Set<string>;
  toggleGalleryMode: () => void;
  toggleCommitSelection: (commitId: string) => void;
  clearSelectedCommits: () => void;
  
  // Model restoration callback - will be set by ModelContext
  onModelRestore?: (modelData: LoadedModel) => void;
  setModelRestoreCallback: (callback: (modelData: LoadedModel) => void) => void;
  
  // AI commit callbacks - will be set by a component that can execute commands
  onAICommit?: (message: string) => Promise<{ success: boolean; modelData?: LoadedModel; error?: string }>;
  setAICommitCallback: (callback: (message: string) => Promise<{ success: boolean; modelData?: LoadedModel; error?: string }>) => void;
}

const VersionControlContext = createContext<VersionControlContextType | undefined>(undefined);

interface VersionControlProviderProps {
  children: ReactNode;
}

export const VersionControlProvider: React.FC<VersionControlProviderProps> = ({ children }) => {
  const { user, session } = useAuth();
  const [currentModel, setCurrentModelState] = useState<string | null>(null);
  const [modelName, setModelName] = useState<string | null>(null);
  const [commits, setCommits] = useState<ModelCommit[]>([]);
  const [currentCommitId, setCurrentCommitId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isProcessingAICommit, setIsProcessingAICommit] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [isCloudEnabled, setIsCloudEnabled] = useState(false);
  const [onModelRestore, setOnModelRestore] = useState<((modelData: LoadedModel) => void) | undefined>(undefined);
  const [onAICommit, setOnAICommit] = useState<((message: string) => Promise<{ success: boolean; modelData?: LoadedModel; error?: string }>) | undefined>(undefined);
  const [isGalleryMode, setIsGalleryMode] = useState(false);
  const [selectedCommitIds, setSelectedCommitIds] = useState<Set<string>>(new Set());

  const setModelRestoreCallback = useCallback((callback: (modelData: LoadedModel) => void) => {
    setOnModelRestore(() => callback);
  }, []);

  const setAICommitCallback = useCallback((callback: (message: string) => Promise<{ success: boolean; modelData?: LoadedModel; error?: string }>) => {
    setOnAICommit(() => callback);
  }, []);

  // Helper function to get storage key for a file path
  const getStorageKey = useCallback((filePath: string): string => {
    // Create a stable key based on file path
    // Use a hash or normalized path to handle different path formats
    return `vc_commits_${filePath}`;
  }, []);

  // Helper function to save commits to localStorage
  const saveCommitsToStorage = useCallback((filePath: string, commitsToSave: ModelCommit[]) => {
    try {
      const storageKey = getStorageKey(filePath);
      
      // Convert commits to a serializable format
      // Note: fileBuffer is too large for localStorage, we'll store it separately in IndexedDB
      // For now, we'll store commits without fileBuffer and rely on reading from disk when needed
      const serializableCommits = commitsToSave.map(commit => ({
        id: commit.id,
        message: commit.message,
        timestamp: commit.timestamp,
        s3VersionId: commit.s3VersionId,
        supabaseCommitId: commit.supabaseCommitId,
        parentCommitId: commit.parentCommitId,
        starred: commit.starred,
        // Don't store modelData or fileBuffer in localStorage (too large)
        // We'll store fileBuffer in IndexedDB separately if needed
        hasFileBuffer: !!commit.fileBuffer,
        hasModelData: !!commit.modelData,
      }));

      localStorage.setItem(storageKey, JSON.stringify(serializableCommits));
      console.log(`Saved ${commitsToSave.length} commits to localStorage for: ${filePath}`);
    } catch (error) {
      console.error('Failed to save commits to localStorage:', error);
      // If quota exceeded, try to clean up old entries
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        console.warn('localStorage quota exceeded, consider using IndexedDB for larger files');
      }
    }
  }, [getStorageKey]);

  // Helper function to load commits from localStorage
  const loadCommitsFromStorage = useCallback(async (filePath: string): Promise<ModelCommit[]> => {
    try {
      const storageKey = getStorageKey(filePath);
      const stored = localStorage.getItem(storageKey);
      
      if (stored) {
        const serializableCommits = JSON.parse(stored);
        // Convert back to ModelCommit format and load fileBuffers from IndexedDB
        const commits: ModelCommit[] = await Promise.all(
          serializableCommits.map(async (c: any): Promise<ModelCommit> => {
            const commit: ModelCommit = {
              id: c.id,
              message: c.message,
              timestamp: c.timestamp,
              s3VersionId: c.s3VersionId,
              supabaseCommitId: c.supabaseCommitId,
              parentCommitId: c.parentCommitId,
              starred: c.starred,
            };
            
            // Try to load fileBuffer from IndexedDB if it was stored
            if (c.hasFileBuffer) {
              const buffer = await getFileBuffer(c.id, filePath);
              if (buffer) {
                commit.fileBuffer = buffer;
              }
            }
            
            return commit;
          })
        );
        
        console.log(`Loaded ${commits.length} commits from localStorage for: ${filePath}`);
        return commits;
      }
    } catch (error) {
      console.error('Failed to load commits from localStorage:', error);
    }
    return [];
  }, [getStorageKey]);

  // Initialize or load project from Supabase when model is set
  const initializeProject = useCallback(async (filePath: string, fileName: string) => {
    if (!user || !session) {
      console.log('User not authenticated, skipping cloud project initialization');
      setIsCloudEnabled(false);
      return;
    }

    try {
      // Check if project exists for this file path
      const s3Key = `org-${user.id}/project-${fileName.replace(/[^a-zA-Z0-9]/g, '-')}/models/${fileName}`;
      const projects = await supabaseAPI.getProjects(user.id);
      let project = projects.find(p => p.s3_key === s3Key);

      if (!project) {
        // Create new project
        project = await supabaseAPI.createProject(fileName, s3Key, user.id);
        console.log('Created new project:', project);
      } else {
        console.log('Found existing project:', project);
      }

      setCurrentProjectId(project.id);
      setIsCloudEnabled(true);

      // Load commits from Supabase
      const supabaseCommits = await supabaseAPI.getCommits(project.id);
      console.log('Loaded commits from Supabase:', supabaseCommits);

      // Load starred commits from localStorage
      const storageKey = `starred_commits_${project.id}`;
      const stored = localStorage.getItem(storageKey);
      const starredIds = stored ? new Set(JSON.parse(stored)) : new Set<string>();

      // Convert Supabase commits to ModelCommit format
      const cloudCommits: ModelCommit[] = supabaseCommits.map(commit => ({
        id: commit.id,
        message: commit.message || 'No message',
        timestamp: new Date(commit.created_at).getTime(),
        s3VersionId: commit.s3_version_id,
        supabaseCommitId: commit.id,
        parentCommitId: commit.parent_commit_id,
        starred: starredIds.has(commit.id),
      }));

      // Merge with local commits (local commits take precedence if they have the same ID)
      setCommits(prevCommits => {
        const localCommitIds = new Set(prevCommits.map(c => c.id));
        const newCommits = cloudCommits.filter(c => !localCommitIds.has(c.id));
        const merged = [...prevCommits, ...newCommits].sort((a, b) => b.timestamp - a.timestamp);
        
        // Save merged commits to localStorage (use the filePath parameter)
        saveCommitsToStorage(filePath, merged);
        
        return merged;
      });

      // Set current commit to the latest one
      if (supabaseCommits.length > 0) {
        const latestCommit = supabaseCommits[0];
        setCurrentCommitId(latestCommit.id);
      }
    } catch (error) {
      console.error('Failed to initialize cloud project:', error);
      setIsCloudEnabled(false);
      // Continue with local-only mode
    }
  }, [user, session, saveCommitsToStorage]);

  const setCurrentModel = useCallback((path: string) => {
    setCurrentModelState(path);
    
    // Extract filename from path
    const fileName = path.split('/').pop() || path;
    setModelName(fileName);
    
    // Clear unsaved changes only when switching to a different model
    console.log('Model switched, clearing unsaved changes for new model:', path);
    setHasUnsavedChanges(false);

    // Load persisted commits from localStorage (async)
    loadCommitsFromStorage(path).then(persistedCommits => {
      if (persistedCommits.length > 0) {
        console.log(`Found ${persistedCommits.length} persisted commits for file`);
        setCommits(persistedCommits);
        
        // Set current commit to the latest one
        const latestCommit = persistedCommits[0];
        setCurrentCommitId(latestCommit.id);
      } else {
        // No persisted commits, start fresh
        setCommits([]);
        setCurrentCommitId(null);
      }

      // Initialize cloud project if user is authenticated
      if (user && session) {
        initializeProject(path, fileName).then(() => {
          // After cloud initialization, merge cloud commits with persisted local commits
          loadCommitsFromStorage(path).then(persistedCommits => {
            setCommits(prevCommits => {
              const persistedIds = new Set(persistedCommits.map(c => c.id));
              const newLocalCommits = prevCommits.filter(c => !persistedIds.has(c.id));
              const merged = [...persistedCommits, ...newLocalCommits].sort((a, b) => b.timestamp - a.timestamp);
              // Save merged commits
              saveCommitsToStorage(path, merged);
              return merged;
            });
          });
        });
      } else {
        setIsCloudEnabled(false);
        setCurrentProjectId(null);
      }
    });
  }, [user, session, initializeProject, loadCommitsFromStorage]);

  const createInitialCommit = useCallback((modelData: LoadedModel, fileBuffer?: ArrayBuffer) => {
    // Only create initial commit if no commits exist
    setCommits(prevCommits => {
      if (prevCommits.length === 0) {
        const initialCommit: ModelCommit = {
          id: Date.now().toString(),
          message: "Initial model import",
          timestamp: Date.now(),
          modelData: modelData,
          fileBuffer: fileBuffer, // Store file buffer if provided
        };
        setCurrentCommitId(initialCommit.id);
        console.log("Created initial commit:", initialCommit.id, fileBuffer ? `with ${fileBuffer.byteLength} byte file buffer` : 'without file buffer');
        const updated = [initialCommit];
        // Save to localStorage
        if (currentModel) {
          saveCommitsToStorage(currentModel, updated);
          // Store file buffer in IndexedDB if available
          if (fileBuffer) {
            storeFileBuffer(initialCommit.id, currentModel, fileBuffer).catch(err => {
              console.warn('Failed to store file buffer in IndexedDB:', err);
            });
          }
        }
        return updated;
      }
      return prevCommits;
    });
  }, [currentModel, saveCommitsToStorage]);

  // Debug: Track hasUnsavedChanges state changes
  useEffect(() => {
    console.log('hasUnsavedChanges state changed to:', hasUnsavedChanges);
  }, [hasUnsavedChanges]);

  // File change detection - mark unsaved changes when file changes on disk
  useEffect(() => {
    if (!desktopAPI.isDesktop || !currentModel) return;

    const handleFileChange = (event: any) => {
      console.log('File changed detected in version control:', event);
      
      if (event.eventType === 'change' && event.filePath && event.filePath === currentModel) {
        console.log('Model file changed on disk - marking as having unsaved changes');
        console.log('Before setting hasUnsavedChanges:', hasUnsavedChanges);
        setHasUnsavedChanges(true);
        console.log('hasUnsavedChanges should now be true');
      }
    };

    // Set up file change listener
    desktopAPI.onFileChanged(handleFileChange);

    // Cleanup
    return () => {
      desktopAPI.removeAllListeners('file-changed');
    };
  }, [currentModel]); // Re-setup when current model changes

  const commitModelChanges = useCallback(async (message: string, currentModelData?: LoadedModel): Promise<void> => {
    if (!currentModel) {
      throw new Error("No model is currently open");
    }

    try {
      let s3VersionId: string | undefined;
      let supabaseCommitId: string | undefined;
      const parentCommitId = currentCommitId || null;
      let fileBuffer: ArrayBuffer | undefined;

      // Always read the exact file buffer from disk (if desktop) for exact file storage
      if (desktopAPI.isDesktop) {
        const buffer = await desktopAPI.readFileBuffer(currentModel);
        if (buffer) {
          fileBuffer = buffer;
          console.log('Read exact file buffer from disk for commit:', buffer.byteLength, 'bytes');
        } else {
          console.warn('Failed to read file buffer from disk, commit will not have exact file');
        }
      }

      // If cloud is enabled and user is authenticated, upload to S3 and create Supabase commit
      if (isCloudEnabled && user && session && currentProjectId) {
        try {
          // Use the file buffer we just read from disk
          if (!fileBuffer) {
            throw new Error("Failed to read file from disk for cloud upload");
          }

          // Generate S3 key
          const s3Key = awsS3API.generateS3Key(user.id, currentProjectId, modelName || 'model.3dm');

          // Get presigned upload URL
          const { url: uploadUrl } = await awsS3API.getPresignedUploadUrl(s3Key);

          // Upload file to S3
          const uploadResult = await awsS3API.uploadFile(uploadUrl, fileBuffer, 'application/octet-stream');
          s3VersionId = uploadResult.versionId;

          console.log('File uploaded to S3, version ID:', s3VersionId);

          // Create commit in Supabase
          const supabaseCommit = await supabaseAPI.createCommit(
            currentProjectId,
            parentCommitId,
            message,
            user.id,
            s3VersionId
          );

          supabaseCommitId = supabaseCommit.id;
          console.log('Commit created in Supabase:', supabaseCommit);

          toast.success('Commit saved to cloud storage');
        } catch (cloudError) {
          console.error('Failed to save commit to cloud:', cloudError);
          toast.warning('Commit saved locally, but cloud sync failed');
          // Continue with local commit
        }
      }

      // Create local commit (always, even if cloud sync succeeded)
      // Store both fileBuffer (exact file) and modelData (for UI display/restore)
      const newCommit: ModelCommit = {
        id: supabaseCommitId || Date.now().toString(),
        message,
        timestamp: Date.now(),
        modelData: currentModelData, // Store for UI display and in-memory restore
        fileBuffer: fileBuffer, // Store exact .3dm file buffer for exact file restoration
        s3VersionId,
        supabaseCommitId,
        parentCommitId: parentCommitId || undefined,
      };

      setCommits(prev => {
        const updated = [newCommit, ...prev];
        // Save to localStorage
        if (currentModel) {
          saveCommitsToStorage(currentModel, updated);
        }
        return updated;
      });
      
      // Store file buffer in IndexedDB if available
      if (fileBuffer && currentModel) {
        storeFileBuffer(newCommit.id, currentModel, fileBuffer).catch(err => {
          console.warn('Failed to store file buffer in IndexedDB:', err);
        });
      }
      
      setCurrentCommitId(newCommit.id);
      setHasUnsavedChanges(false);

      console.log("Model commit created with file buffer:", newCommit.id, fileBuffer ? `${fileBuffer.byteLength} bytes` : 'no buffer');
    } catch (error) {
      console.error("Failed to commit model changes:", error);
      throw error;
    }
  }, [currentModel, isCloudEnabled, user, session, currentProjectId, modelName, currentCommitId]);

  // Commit using AI to interpret the message and modify the model
  const commitWithAI = useCallback(async (message: string): Promise<{ success: boolean; error?: string }> => {
    if (!currentModel) {
      return { success: false, error: "No model is currently open" };
    }

    if (!onAICommit) {
      return { success: false, error: "AI commit handler not set up" };
    }

    setIsProcessingAICommit(true);

    try {
      // Call the AI commit handler which will interpret the message and execute commands
      const result = await onAICommit(message);

      if (!result.success) {
        setIsProcessingAICommit(false);
        return { success: false, error: result.error };
      }

      // Use commitModelChanges to handle both local and cloud commits
      await commitModelChanges(`🤖 ${message}`, result.modelData);
      setIsProcessingAICommit(false);

      console.log("AI-driven commit created");
      return { success: true };
    } catch (error) {
      console.error("Failed to create AI commit:", error);
      setIsProcessingAICommit(false);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }, [currentModel, onAICommit, commitModelChanges]);

  const restoreToCommit = useCallback(async (commitId: string): Promise<boolean> => {
    try {
      const commit = commits.find(c => c.id === commitId);
      if (!commit) {
        console.error("Commit not found:", commitId);
        return false;
      }

      let modelData: LoadedModel | undefined = commit.modelData;

      // If commit has S3 version ID, download from S3
      if (commit.s3VersionId && isCloudEnabled && user && session && currentProjectId && currentModel) {
        try {
          const s3Key = awsS3API.generateS3Key(user.id, currentProjectId, modelName || 'model.3dm');
          
          // Get presigned download URL
          const { url: downloadUrl } = await awsS3API.getPresignedDownloadUrl(s3Key, commit.s3VersionId);
          
          // Download file from S3
          const fileBuffer = await awsS3API.downloadFile(downloadUrl);
          
          // Convert ArrayBuffer to File
          const file = new File([fileBuffer], modelName || 'model.3dm', { type: 'application/octet-stream' });
          
          // Load the 3dm file
          const { load3dmFile } = await import('@/lib/rhino3dm-service');
          const loaded = await load3dmFile(file);
          
          modelData = {
            objects: loaded.objects,
            metadata: loaded.metadata,
          };
          
          console.log('Model downloaded from S3 and loaded');
        } catch (s3Error) {
          console.error('Failed to download from S3, falling back to local data:', s3Error);
          // Fall back to local modelData if available
        }
      }

      if (!modelData) {
        console.error("No model data found for commit:", commitId);
        return false;
      }

      // Restore the model by calling the callback provided by ModelContext
      if (onModelRestore) {
        onModelRestore(modelData);
        console.log("Model restored to commit:", commit);
      } else {
        console.error("Model restore callback not set");
        return false;
      }

      setCurrentCommitId(commitId);
      setHasUnsavedChanges(false);

      return true;
    } catch (error) {
      console.error("Failed to restore to commit:", error);
      return false;
    }
  }, [commits, onModelRestore, isCloudEnabled, user, session, currentProjectId, currentModel, modelName]);

  const pullFromCommit = useCallback(async (commitId: string): Promise<boolean> => {
    if (!currentModel || !desktopAPI.isDesktop) {
      toast.error("Pull only works in desktop mode with an open file");
      return false;
    }

    try {
      const commit = commits.find(c => c.id === commitId);
      if (!commit) {
        console.error("Commit not found:", commitId);
        toast.error("Commit not found");
        return false;
      }

      let fileBuffer: ArrayBuffer | undefined;

      // Priority 1: Use stored file buffer (exact file) - check both in-memory and IndexedDB
      if (commit.fileBuffer) {
        fileBuffer = commit.fileBuffer;
        console.log('Using in-memory file buffer from commit:', fileBuffer.byteLength, 'bytes');
      } else {
        // Try to load from IndexedDB
        const storedBuffer = await getFileBuffer(commitId, currentModel);
        if (storedBuffer) {
          fileBuffer = storedBuffer;
          console.log('Using file buffer from IndexedDB:', fileBuffer.byteLength, 'bytes');
        }
      }
      
      // Priority 2: Download from S3 if available (also exact file)
      if (!fileBuffer && commit.s3VersionId && isCloudEnabled && user && session && currentProjectId) {
        try {
          const s3Key = awsS3API.generateS3Key(user.id, currentProjectId, modelName || 'model.3dm');
          
          // Get presigned download URL
          const { url: downloadUrl } = await awsS3API.getPresignedDownloadUrl(s3Key, commit.s3VersionId);
          
          // Download file from S3
          fileBuffer = await awsS3API.downloadFile(downloadUrl);
          
          console.log('File buffer downloaded from S3:', fileBuffer.byteLength, 'bytes');
        } catch (s3Error) {
          console.error('Failed to download from S3:', s3Error);
          toast.error("Failed to download file from cloud storage");
          return false;
        }
      }
      
      // Priority 3: Fall back to exporting modelData (less ideal, loses polysurface data)
      if (!fileBuffer && commit.modelData) {
        try {
          fileBuffer = await exportModelToBuffer(commit.modelData);
          console.warn('Warning: Using exported model data (may not be exact file):', fileBuffer.byteLength, 'bytes');
          toast.warning("Note: Using converted model data - may differ from original file");
        } catch (exportError) {
          console.error('Failed to export model data to buffer:', exportError);
          toast.error("Failed to convert model data to file");
          return false;
        }
      }
      
      // If we still don't have a file buffer, we can't proceed
      if (!fileBuffer) {
        console.error('No file data available for commit:', commitId, {
          hasFileBuffer: !!commit.fileBuffer,
          hasS3VersionId: !!commit.s3VersionId,
          hasModelData: !!commit.modelData,
        });
        toast.error("No file data available for this commit. The commit may have been created before file buffer storage was implemented.");
        return false;
      }

      // Write the exact file buffer to disk
      await desktopAPI.writeFileBuffer(currentModel, fileBuffer);
      console.log('Exact file written to disk:', currentModel, fileBuffer.byteLength, 'bytes');

      // Touch the file to ensure Rhino detects the change
      // Read and immediately write to update file metadata
      await new Promise(resolve => setTimeout(resolve, 100));
      const verifyBuffer = await desktopAPI.readFileBuffer(currentModel);
      if (verifyBuffer && verifyBuffer.byteLength === fileBuffer.byteLength) {
        // File was written correctly, touch it again to trigger Rhino reload
        await desktopAPI.writeFileBuffer(currentModel, fileBuffer);
        console.log('File touched again to trigger Rhino reload');
      }

      // Wait for file system to settle
      await new Promise(resolve => setTimeout(resolve, 200));

      // Reload the model in the UI
      const file = new File([fileBuffer], modelName || 'model.3dm', { type: 'application/octet-stream' });
      const { load3dmFile } = await import('@/lib/rhino3dm-service');
      const loaded = await load3dmFile(file);
      
      if (onModelRestore) {
        onModelRestore(loaded);
      }

      setCurrentCommitId(commitId);
      setHasUnsavedChanges(false);
      
      toast.success("File updated to exact commit version - Rhino should auto-reload");
      return true;
    } catch (error) {
      console.error("Failed to pull from commit:", error);
      toast.error(error instanceof Error ? error.message : "Failed to pull from commit");
      return false;
    }
  }, [commits, currentModel, modelName, isCloudEnabled, user, session, currentProjectId, onModelRestore]);

  const markUnsavedChanges = useCallback(() => {
    setHasUnsavedChanges(true);
  }, []);

  const clearUnsavedChanges = useCallback(() => {
    setHasUnsavedChanges(false);
  }, []);

  const clearCurrentModel = useCallback(() => {
    setCurrentModelState(null);
    setModelName(null);
    setCommits([]);
    setCurrentCommitId(null);
    setHasUnsavedChanges(false);
    setCurrentProjectId(null);
    setIsCloudEnabled(false);
  }, []);

  // Pull commits from cloud storage
  const pullFromCloud = useCallback(async (): Promise<void> => {
    if (!isCloudEnabled || !user || !session || !currentProjectId) {
      throw new Error("Cloud sync is not enabled or user is not authenticated");
    }

    try {
      // Load commits from Supabase
      const supabaseCommits = await supabaseAPI.getCommits(currentProjectId);
      console.log('Pulled commits from cloud:', supabaseCommits);

      // Load starred commits from localStorage
      const storageKey = `starred_commits_${currentProjectId}`;
      const stored = localStorage.getItem(storageKey);
      const starredIds = stored ? new Set(JSON.parse(stored)) : new Set<string>();

      // Convert Supabase commits to ModelCommit format
      const cloudCommits: ModelCommit[] = supabaseCommits.map(commit => ({
        id: commit.id,
        message: commit.message || 'No message',
        timestamp: new Date(commit.created_at).getTime(),
        s3VersionId: commit.s3_version_id,
        supabaseCommitId: commit.id,
        parentCommitId: commit.parent_commit_id,
        starred: starredIds.has(commit.id),
      }));

      // Merge with local commits, prioritizing cloud commits
      setCommits(prevCommits => {
        const cloudCommitIds = new Set(cloudCommits.map(c => c.id));
        const localOnlyCommits = prevCommits.filter(c => !cloudCommitIds.has(c.id));
        const merged = [...cloudCommits, ...localOnlyCommits].sort((a, b) => b.timestamp - a.timestamp);
        // Save merged commits to localStorage
        if (currentModel) {
          saveCommitsToStorage(currentModel, merged);
        }
        return merged;
      });

      // Update current commit to latest
      if (supabaseCommits.length > 0) {
        const latestCommit = supabaseCommits[0];
        setCurrentCommitId(latestCommit.id);
      }

      toast.success('Successfully pulled commits from cloud storage');
    } catch (error) {
      console.error('Failed to pull from cloud:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to pull from cloud storage');
      throw error;
    }
  }, [isCloudEnabled, user, session, currentProjectId]);

  // Toggle star status of a commit
  const toggleStarCommit = useCallback((commitId: string) => {
    setCommits(prevCommits => {
      const updated = prevCommits.map(commit => 
        commit.id === commitId 
          ? { ...commit, starred: !commit.starred }
          : commit
      );
      
      // Persist starred status to localStorage (per project)
      if (currentProjectId || currentModel) {
        const storageKey = `starred_commits_${currentProjectId || currentModel}`;
        const starredIds = updated.filter(c => c.starred).map(c => c.id);
        localStorage.setItem(storageKey, JSON.stringify(starredIds));
      }
      
      // Save updated commits to localStorage
      if (currentModel) {
        saveCommitsToStorage(currentModel, updated);
      }
      
      return updated;
    });
  }, [currentProjectId, currentModel, saveCommitsToStorage]);

  // Get all starred commits
  const getStarredCommits = useCallback((): ModelCommit[] => {
    return commits.filter(commit => commit.starred);
  }, [commits]);

  // Gallery mode functions
  const toggleGalleryMode = useCallback(() => {
    setIsGalleryMode(prev => {
      const newValue = !prev;
      if (!newValue) {
        // Clear selections when exiting gallery mode
        setSelectedCommitIds(new Set());
      }
      return newValue;
    });
  }, []);

  const toggleCommitSelection = useCallback((commitId: string) => {
    setSelectedCommitIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(commitId)) {
        newSet.delete(commitId);
      } else {
        newSet.add(commitId);
      }
      return newSet;
    });
  }, []);

  const clearSelectedCommits = useCallback(() => {
    setSelectedCommitIds(new Set());
  }, []);

  // Load starred commits from localStorage when project/model changes
  useEffect(() => {
    if (!currentProjectId && !currentModel) return;
    
    const storageKey = `starred_commits_${currentProjectId || currentModel}`;
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        const starredIds = new Set(JSON.parse(stored));
        setCommits(prevCommits => {
          const updated = prevCommits.map(commit => ({
            ...commit,
            starred: starredIds.has(commit.id)
          }));
          // Save updated commits to localStorage
          if (currentModel) {
            saveCommitsToStorage(currentModel, updated);
          }
          return updated;
        });
      } catch (error) {
        console.error('Failed to load starred commits:', error);
      }
    }
  }, [currentProjectId, currentModel]);

  const value: VersionControlContextType = {
    currentModel,
    modelName,
    commits,
    currentCommitId,
    hasUnsavedChanges,
    isProcessingAICommit,
    currentProjectId,
    isCloudEnabled,
    setCurrentModel,
    commitModelChanges,
    commitWithAI,
    createInitialCommit,
    restoreToCommit,
    pullFromCommit,
    markUnsavedChanges,
    clearUnsavedChanges,
    clearCurrentModel,
    pullFromCloud,
    toggleStarCommit,
    getStarredCommits,
    isGalleryMode,
    selectedCommitIds,
    toggleGalleryMode,
    toggleCommitSelection,
    clearSelectedCommits,
    onModelRestore,
    setModelRestoreCallback,
    onAICommit,
    setAICommitCallback,
  };

  return (
    <VersionControlContext.Provider value={value}>
      {children}
    </VersionControlContext.Provider>
  );
};

export const useVersionControl = (): VersionControlContextType => {
  const context = useContext(VersionControlContext);
  if (!context) {
    throw new Error("useVersionControl must be used within a VersionControlProvider");
  }
  return context;
};

export type { ModelCommit };