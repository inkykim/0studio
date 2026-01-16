import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { desktopAPI } from "@/lib/desktop-api";
import { LoadedModel } from "./ModelContext";
import { exportModelToBuffer } from "@/lib/rhino3dm-service";
import { getFileBuffer } from "@/lib/commit-storage";
import { toast } from "sonner";

interface ModelCommit {
  id: string;
  message: string;
  timestamp: number;
  modelData?: LoadedModel; // Store the actual model data (for display/restore in UI)
  fileBuffer?: ArrayBuffer; // Store the exact .3dm file buffer (for exact file restoration)
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
  
  // Actions
  setCurrentModel: (path: string) => void;
  commitModelChanges: (message: string, currentModelData?: LoadedModel) => Promise<void>;
  commitWithAI: (message: string) => Promise<{ success: boolean; error?: string }>;
  createInitialCommit: (modelData: LoadedModel, fileBuffer?: ArrayBuffer, filePath?: string) => void | Promise<void>;
  restoreToCommit: (commitId: string) => Promise<boolean>;
  pullFromCommit: (commitId: string) => Promise<boolean>; // Pull commit to local file (updates file on disk)
  markUnsavedChanges: () => void;
  clearUnsavedChanges: () => void;
  clearCurrentModel: () => void;
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
  const [currentModel, setCurrentModelState] = useState<string | null>(null);
  const [modelName, setModelName] = useState<string | null>(null);
  const [commits, setCommits] = useState<ModelCommit[]>([]);
  const [currentCommitId, setCurrentCommitId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isProcessingAICommit, setIsProcessingAICommit] = useState(false);
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
        // Only update if we don't already have commits (to avoid overwriting initial commit)
        setCommits(prevCommits => {
          // If we already have commits (e.g., from createInitialCommit), merge them
          if (prevCommits.length > 0) {
            // Merge: keep existing commits, add new ones that don't exist
            const existingIds = new Set(prevCommits.map(c => c.id));
            const newCommits = persistedCommits.filter(c => !existingIds.has(c.id));
            const merged = [...prevCommits, ...newCommits].sort((a, b) => b.timestamp - a.timestamp);
            console.log(`Merged commits: ${prevCommits.length} existing + ${newCommits.length} new = ${merged.length} total`);
            return merged;
          }
          return persistedCommits;
        });
        
        // Set current commit to the latest one
        setCommits(prevCommits => {
          if (prevCommits.length > 0) {
            const latestCommit = prevCommits[0];
            setCurrentCommitId(latestCommit.id);
          }
          return prevCommits;
        });
      } else {
        // No persisted commits, but don't clear if we already have commits from createInitialCommit
        setCommits(prevCommits => {
          if (prevCommits.length === 0) {
            setCurrentCommitId(null);
          }
          return prevCommits;
        });
      }
    });
  }, [loadCommitsFromStorage]);

  const createInitialCommit = useCallback(async (modelData: LoadedModel, fileBuffer?: ArrayBuffer, filePath?: string) => {
    // Only create initial commit if no commits exist
    const targetPath = filePath || currentModel;
    
    if (!targetPath) {
      console.warn('createInitialCommit called without filePath and currentModel is not set');
      return;
    }

    setCommits(prevCommits => {
      if (prevCommits.length === 0) {
        // Generate a unique commit ID with timestamp and random component
        const commitId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        const initialCommit: ModelCommit = {
          id: commitId,
          message: "Initial model import",
          timestamp: Date.now(),
          modelData: modelData,
          fileBuffer: fileBuffer, // Store file buffer if provided
        };
        setCurrentCommitId(initialCommit.id);
        console.log("Created initial commit:", initialCommit.id, fileBuffer ? `with ${fileBuffer.byteLength} byte file buffer` : 'without file buffer');
        const updated = [initialCommit];
        
        // Save to localStorage
        saveCommitsToStorage(targetPath, updated);
        
        // Save file to 0studio folder (file system storage) - await this properly
        if (fileBuffer && desktopAPI.isDesktop) {
          desktopAPI.saveCommitFile(targetPath, initialCommit.id, fileBuffer)
            .then(() => {
              console.log(`Successfully saved initial commit file: commit-${initialCommit.id}.3dm`);
            })
            .catch(err => {
              console.error('Failed to save commit file to 0studio folder:', err);
            });
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

      // Create local commit
      // Store both fileBuffer (exact file) and modelData (for UI display/restore)
      // Generate a unique commit ID with timestamp and random component to avoid collisions
      const commitId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newCommit: ModelCommit = {
        id: commitId,
        message,
        timestamp: Date.now(),
        modelData: currentModelData, // Store for UI display and in-memory restore
        fileBuffer: fileBuffer, // Store exact .3dm file buffer for exact file restoration
      };

      setCommits(prev => {
        const updated = [newCommit, ...prev];
        // Save to localStorage
        if (currentModel) {
          saveCommitsToStorage(currentModel, updated);
        }
        return updated;
      });
      
      // Save file to 0studio folder (file system storage)
      if (fileBuffer && currentModel && desktopAPI.isDesktop) {
        try {
          await desktopAPI.saveCommitFile(currentModel, newCommit.id, fileBuffer);
          console.log("Saved commit file to 0studio folder:", newCommit.id);
        } catch (error) {
          console.error("Failed to save commit file to 0studio folder:", error);
          toast.error("Failed to save commit file. Please check console for details.");
          throw error;
        }
      }
      
      setCurrentCommitId(newCommit.id);
      setHasUnsavedChanges(false);

      console.log("Model commit created with file buffer:", newCommit.id, fileBuffer ? `${fileBuffer.byteLength} bytes` : 'no buffer');
      toast.success("Commit saved successfully");
    } catch (error) {
      console.error("Failed to commit model changes:", error);
      throw error;
    }
  }, [currentModel, currentCommitId, saveCommitsToStorage]);

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

      // Priority 1: Load from 0studio folder (file system storage) - PRIMARY METHOD
      let fileBuffer: ArrayBuffer | undefined;
      if (desktopAPI.isDesktop && currentModel) {
        const storedFile = await desktopAPI.readCommitFile(currentModel, commitId);
        if (storedFile) {
          fileBuffer = storedFile;
          console.log('Using file buffer from 0studio folder for restore:', fileBuffer.byteLength, 'bytes');
        }
      }

      // Priority 2: Fall back to in-memory file buffer
      if (!fileBuffer && commit.fileBuffer) {
        fileBuffer = commit.fileBuffer;
        console.log('Using in-memory file buffer from commit for restore:', fileBuffer.byteLength, 'bytes');
      }

      // Priority 3: Fall back to IndexedDB
      if (!fileBuffer && currentModel) {
        const storedBuffer = await getFileBuffer(commitId, currentModel);
        if (storedBuffer) {
          fileBuffer = storedBuffer;
          console.log('Using file buffer from IndexedDB for restore:', fileBuffer.byteLength, 'bytes');
        }
      }

      // Priority 4: Fall back to exporting modelData (less ideal)
      let modelData: LoadedModel | undefined = commit.modelData;
      if (!fileBuffer && modelData) {
        try {
          const { exportModelToBuffer } = await import('@/lib/rhino3dm-service');
          fileBuffer = await exportModelToBuffer(modelData);
          console.warn('Warning: Using exported model data for restore (may not be exact file)');
        } catch (exportError) {
          console.error('Failed to export model data to buffer:', exportError);
        }
      }

      // Load the model from file buffer if available
      if (fileBuffer) {
        const file = new File([fileBuffer], modelName || 'model.3dm', { type: 'application/octet-stream' });
        const { load3dmFile } = await import('@/lib/rhino3dm-service');
        const loaded = await load3dmFile(file);
        modelData = loaded;
        console.log('Loaded model from commit file for restore');
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
  }, [commits, onModelRestore, currentModel, modelName]);

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

      // Priority 1: Read from 0studio folder (file system storage) - PRIMARY METHOD
      if (desktopAPI.isDesktop) {
        const storedFile = await desktopAPI.readCommitFile(currentModel, commitId);
        if (storedFile) {
          fileBuffer = storedFile;
          console.log('Using file buffer from 0studio folder:', fileBuffer.byteLength, 'bytes');
        }
      }

      // Priority 2: Fall back to in-memory file buffer (for backwards compatibility)
      if (!fileBuffer && commit.fileBuffer) {
        fileBuffer = commit.fileBuffer;
        console.log('Using in-memory file buffer from commit:', fileBuffer.byteLength, 'bytes');
      }

      // Priority 3: Fall back to IndexedDB (for backwards compatibility)
      if (!fileBuffer) {
        const storedBuffer = await getFileBuffer(commitId, currentModel);
        if (storedBuffer) {
          fileBuffer = storedBuffer;
          console.log('Using file buffer from IndexedDB:', fileBuffer.byteLength, 'bytes');
        }
      }
      
      // Priority 4: Fall back to exporting modelData (less ideal, loses polysurface data)
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
  }, [commits, currentModel, modelName, onModelRestore]);

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
    // Reset gallery mode when closing project
    setIsGalleryMode(false);
    setSelectedCommitIds(new Set());
  }, []);

  // Handle project-closed event from Electron
  useEffect(() => {
    if (!desktopAPI.isDesktop) return;

    const handleProjectClosed = () => {
      console.log('Project closed event received, clearing model and resetting gallery mode');
      clearCurrentModel();
    };

    // Set up project closed listener
    desktopAPI.onProjectClosed(handleProjectClosed);

    // Cleanup
    return () => {
      desktopAPI.removeAllListeners('project-closed');
    };
  }, [clearCurrentModel]);


  // Toggle star status of a commit
  const toggleStarCommit = useCallback((commitId: string) => {
    setCommits(prevCommits => {
      const updated = prevCommits.map(commit => 
        commit.id === commitId 
          ? { ...commit, starred: !commit.starred }
          : commit
      );
      
      // Persist starred status to localStorage (per file)
      if (currentModel) {
        const storageKey = `starred_commits_${currentModel}`;
        const starredIds = updated.filter(c => c.starred).map(c => c.id);
        localStorage.setItem(storageKey, JSON.stringify(starredIds));
      }
      
      // Save updated commits to localStorage
      if (currentModel) {
        saveCommitsToStorage(currentModel, updated);
      }
      
      return updated;
    });
  }, [currentModel, saveCommitsToStorage]);

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
        // Allow deselecting even if at max
        newSet.delete(commitId);
      } else {
        // Only allow adding if under the limit of 4
        if (newSet.size < 4) {
          newSet.add(commitId);
        }
      }
      return newSet;
    });
  }, []);

  const clearSelectedCommits = useCallback(() => {
    setSelectedCommitIds(new Set());
  }, []);

  // Load starred commits from localStorage when project/model changes
  useEffect(() => {
    if (!currentModel) return;
    
    const storageKey = `starred_commits_${currentModel}`;
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
  }, [currentModel, saveCommitsToStorage]);

  const value: VersionControlContextType = {
    currentModel,
    modelName,
    commits,
    currentCommitId,
    hasUnsavedChanges,
    isProcessingAICommit,
    setCurrentModel,
    commitModelChanges,
    commitWithAI,
    createInitialCommit,
    restoreToCommit,
    pullFromCommit,
    markUnsavedChanges,
    clearUnsavedChanges,
    clearCurrentModel,
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