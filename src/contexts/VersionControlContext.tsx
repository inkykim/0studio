import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { desktopAPI } from "@/lib/desktop-api";
import { LoadedModel } from "./ModelContext";

interface ModelCommit {
  id: string;
  message: string;
  timestamp: number;
  modelData?: LoadedModel; // Store the actual model data
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
  createInitialCommit: (modelData: LoadedModel) => void;
  restoreToCommit: (commitId: string) => Promise<boolean>;
  markUnsavedChanges: () => void;
  clearUnsavedChanges: () => void;
  clearCurrentModel: () => void;
  
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

  const setModelRestoreCallback = useCallback((callback: (modelData: LoadedModel) => void) => {
    setOnModelRestore(() => callback);
  }, []);

  const setAICommitCallback = useCallback((callback: (message: string) => Promise<{ success: boolean; modelData?: LoadedModel; error?: string }>) => {
    setOnAICommit(() => callback);
  }, []);

  const setCurrentModel = useCallback((path: string) => {
    setCurrentModelState(path);
    
    // Extract filename from path
    const fileName = path.split('/').pop() || path;
    setModelName(fileName);
    
    // Clear unsaved changes only when switching to a different model
    console.log('Model switched, clearing unsaved changes for new model:', path);
    setHasUnsavedChanges(false);
  }, []); // Removed initial commit creation - will be done when model loads

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
      const newCommit: ModelCommit = {
        id: Date.now().toString(),
        message,
        timestamp: Date.now(),
        modelData: currentModelData, // Store the current model state
      };

      setCommits(prev => [newCommit, ...prev]);
      setCurrentCommitId(newCommit.id);
      setHasUnsavedChanges(false);

      console.log("Model commit created:", newCommit);
    } catch (error) {
      console.error("Failed to commit model changes:", error);
      throw error;
    }
  }, [currentModel]);

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

      // Create the commit with the updated model data
      const newCommit: ModelCommit = {
        id: Date.now().toString(),
        message: `🤖 ${message}`, // Prefix with robot emoji to indicate AI-generated changes
        timestamp: Date.now(),
        modelData: result.modelData,
      };

      setCommits(prev => [newCommit, ...prev]);
      setCurrentCommitId(newCommit.id);
      setHasUnsavedChanges(false);
      setIsProcessingAICommit(false);

      console.log("AI-driven commit created:", newCommit);
      return { success: true };
    } catch (error) {
      console.error("Failed to create AI commit:", error);
      setIsProcessingAICommit(false);
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  }, [currentModel, onAICommit]);

  const restoreToCommit = useCallback(async (commitId: string): Promise<boolean> => {
    try {
      const commit = commits.find(c => c.id === commitId);
      if (!commit) {
        console.error("Commit not found:", commitId);
        return false;
      }

      if (!commit.modelData) {
        console.error("No model data found for commit:", commitId);
        return false;
      }

      // Restore the model by calling the callback provided by ModelContext
      if (onModelRestore) {
        onModelRestore(commit.modelData);
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
  }, [commits, onModelRestore]);

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
  }, []);

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
    markUnsavedChanges,
    clearUnsavedChanges,
    clearCurrentModel,
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