import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { desktopAPI } from "@/lib/desktop-api";
import { LoadedModel } from "./ModelContext";
import { useAuth } from "./AuthContext";
import { supabaseAPI } from "@/lib/supabase-api";
import { awsS3API } from "@/lib/aws-api";
import { toast } from "sonner";

interface ModelCommit {
  id: string;
  message: string;
  timestamp: number;
  modelData?: LoadedModel; // Store the actual model data (for local commits)
  s3VersionId?: string; // S3 version ID for cloud commits
  supabaseCommitId?: string; // Supabase commit ID
  parentCommitId?: string; // Parent commit ID for cloud commits
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
  createInitialCommit: (modelData: LoadedModel) => void;
  restoreToCommit: (commitId: string) => Promise<boolean>;
  markUnsavedChanges: () => void;
  clearUnsavedChanges: () => void;
  clearCurrentModel: () => void;
  pullFromCloud: () => Promise<void>; // Pull commits from cloud
  
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

  const setModelRestoreCallback = useCallback((callback: (modelData: LoadedModel) => void) => {
    setOnModelRestore(() => callback);
  }, []);

  const setAICommitCallback = useCallback((callback: (message: string) => Promise<{ success: boolean; modelData?: LoadedModel; error?: string }>) => {
    setOnAICommit(() => callback);
  }, []);

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

      // Convert Supabase commits to ModelCommit format
      const cloudCommits: ModelCommit[] = supabaseCommits.map(commit => ({
        id: commit.id,
        message: commit.message || 'No message',
        timestamp: new Date(commit.created_at).getTime(),
        s3VersionId: commit.s3_version_id,
        supabaseCommitId: commit.id,
        parentCommitId: commit.parent_commit_id,
      }));

      // Merge with local commits (local commits take precedence if they have the same ID)
      setCommits(prevCommits => {
        const localCommitIds = new Set(prevCommits.map(c => c.id));
        const newCommits = cloudCommits.filter(c => !localCommitIds.has(c.id));
        return [...prevCommits, ...newCommits].sort((a, b) => b.timestamp - a.timestamp);
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
  }, [user, session]);

  const setCurrentModel = useCallback((path: string) => {
    setCurrentModelState(path);
    
    // Extract filename from path
    const fileName = path.split('/').pop() || path;
    setModelName(fileName);
    
    // Clear unsaved changes only when switching to a different model
    console.log('Model switched, clearing unsaved changes for new model:', path);
    setHasUnsavedChanges(false);

    // Initialize cloud project if user is authenticated
    if (user && session) {
      initializeProject(path, fileName);
    } else {
      setIsCloudEnabled(false);
      setCurrentProjectId(null);
    }
  }, [user, session, initializeProject]);

  const createInitialCommit = useCallback((modelData: LoadedModel) => {
    // Only create initial commit if no commits exist
    setCommits(prevCommits => {
      if (prevCommits.length === 0) {
        const initialCommit: ModelCommit = {
          id: Date.now().toString(),
          message: "Initial model import",
          timestamp: Date.now(),
          modelData: modelData,
        };
        setCurrentCommitId(initialCommit.id);
        console.log("Created initial commit with model data:", initialCommit);
        return [initialCommit];
      }
      return prevCommits;
    });
  }, []);

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

      // If cloud is enabled and user is authenticated, upload to S3 and create Supabase commit
      if (isCloudEnabled && user && session && currentProjectId) {
        try {
          // Get the file buffer (from disk if desktop, or serialize if needed)
          let fileBuffer: ArrayBuffer;
          if (desktopAPI.isDesktop) {
            const buffer = await desktopAPI.readFileBuffer(currentModel);
            if (!buffer) {
              throw new Error("Failed to read file from disk");
            }
            fileBuffer = buffer;
          } else if (currentModelData) {
            // For web, we'd need to serialize the model
            // For now, skip cloud upload if not desktop
            throw new Error("Cloud upload requires desktop mode");
          } else {
            throw new Error("No model data available");
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
      const newCommit: ModelCommit = {
        id: supabaseCommitId || Date.now().toString(),
        message,
        timestamp: Date.now(),
        modelData: currentModelData, // Store the current model state for local restoration
        s3VersionId,
        supabaseCommitId,
        parentCommitId: parentCommitId || undefined,
      };

      setCommits(prev => [newCommit, ...prev]);
      setCurrentCommitId(newCommit.id);
      setHasUnsavedChanges(false);

      console.log("Model commit created:", newCommit);
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

      // Convert Supabase commits to ModelCommit format
      const cloudCommits: ModelCommit[] = supabaseCommits.map(commit => ({
        id: commit.id,
        message: commit.message || 'No message',
        timestamp: new Date(commit.created_at).getTime(),
        s3VersionId: commit.s3_version_id,
        supabaseCommitId: commit.id,
        parentCommitId: commit.parent_commit_id,
      }));

      // Merge with local commits, prioritizing cloud commits
      setCommits(prevCommits => {
        const cloudCommitIds = new Set(cloudCommits.map(c => c.id));
        const localOnlyCommits = prevCommits.filter(c => !cloudCommitIds.has(c.id));
        const merged = [...cloudCommits, ...localOnlyCommits].sort((a, b) => b.timestamp - a.timestamp);
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
    markUnsavedChanges,
    clearUnsavedChanges,
    clearCurrentModel,
    pullFromCloud,
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