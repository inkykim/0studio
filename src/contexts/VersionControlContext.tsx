import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";

interface ModelCommit {
  id: string;
  message: string;
  timestamp: number;
  modelData?: any; // Will store serialized model data
}

interface VersionControlContextType {
  // Model tracking
  currentModel: string | null;
  modelName: string | null;
  commits: ModelCommit[];
  currentCommitId: string | null;
  hasUnsavedChanges: boolean;
  
  // Actions
  setCurrentModel: (path: string) => void;
  commitModelChanges: (message: string) => Promise<void>;
  restoreToCommit: (commitId: string) => Promise<boolean>;
  markUnsavedChanges: () => void;
  clearUnsavedChanges: () => void;
  clearCurrentModel: () => void;
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

  const setCurrentModel = useCallback((path: string) => {
    setCurrentModelState(path);
    
    // Extract filename from path
    const fileName = path.split('/').pop() || path;
    setModelName(fileName);
    
    // Initialize with first commit if no commits exist
    if (commits.length === 0) {
      const initialCommit: ModelCommit = {
        id: Date.now().toString(),
        message: "Initial model import",
        timestamp: Date.now(),
      };
      setCommits([initialCommit]);
      setCurrentCommitId(initialCommit.id);
    }
    
    // Clear unsaved changes when switching models
    setHasUnsavedChanges(false);
  }, [commits.length]);

  const commitModelChanges = useCallback(async (message: string): Promise<void> => {
    if (!currentModel) {
      throw new Error("No model is currently open");
    }

    try {
      // TODO: Implement actual model data capture and storage
      const newCommit: ModelCommit = {
        id: Date.now().toString(),
        message,
        timestamp: Date.now(),
        // modelData: await captureCurrentModelState(), // TODO: Implement
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

  const restoreToCommit = useCallback(async (commitId: string): Promise<boolean> => {
    try {
      const commit = commits.find(c => c.id === commitId);
      if (!commit) {
        console.error("Commit not found:", commitId);
        return false;
      }

      // TODO: Implement actual model restoration
      // This would involve:
      // 1. Loading the stored model data from the commit
      // 2. Overwriting the current model file
      // 3. Triggering a reload in the model viewer

      setCurrentCommitId(commitId);
      setHasUnsavedChanges(false);

      console.log("Model restored to commit:", commit);
      return true;
    } catch (error) {
      console.error("Failed to restore to commit:", error);
      return false;
    }
  }, [commits]);

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
    setCurrentModel,
    commitModelChanges,
    restoreToCommit,
    markUnsavedChanges,
    clearUnsavedChanges,
    clearCurrentModel,
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