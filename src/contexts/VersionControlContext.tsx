import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";

// Serializable representation of a 3D object for storage
export interface SerializedObject {
  id: string;
  type: 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'plane';
  name: string;
  color: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  params?: {
    size?: number;
    width?: number;
    height?: number;
    depth?: number;
    radius?: number;
  };
}

export interface Commit {
  id: string;
  message: string;
  author: string;
  time: string;
  timestamp: number;
  hash: string;
  files: FileChange[];
  sceneState: SerializedObject[];
}

export interface FileChange {
  name: string;
  status: "added" | "modified" | "deleted";
  path: string;
}

interface VersionControlContextType {
  stagedChanges: FileChange[];
  unstagedChanges: FileChange[];
  commits: Commit[];
  currentCommitId: string | null;
  stageAllChanges: () => void;
  commitChanges: (message: string, sceneState: SerializedObject[]) => void;
  addChange: (change: FileChange) => void;
  removeChange: (name: string) => void;
  restoreCommit: (commitId: string) => SerializedObject[] | null;
  hasUnstagedChanges: boolean;
  hasStagedChanges: boolean;
}

const VersionControlContext = createContext<VersionControlContextType | null>(null);

const INSTANCE_KEY = "0studio-instance-id";
const STORAGE_KEY_PREFIX = "0studio-version-control";

// Get or create a unique instance ID for this browser
const getInstanceId = (): string => {
  let instanceId = localStorage.getItem(INSTANCE_KEY);
  if (!instanceId) {
    instanceId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    localStorage.setItem(INSTANCE_KEY, instanceId);
  }
  return instanceId;
};

// Each user gets their own storage key based on their unique instance ID
const getStorageKey = (): string => {
  return `${STORAGE_KEY_PREFIX}-${getInstanceId()}`;
};

// Generate a random 7-character alphanumeric hash
const generateHash = (): string => {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let hash = "";
  for (let i = 0; i < 7; i++) {
    hash += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return hash;
};

// Format relative time from timestamp
const getRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
};

// Load from localStorage
const loadFromStorage = (): { commits: Commit[]; stagedChanges: FileChange[]; unstagedChanges: FileChange[] } => {
  try {
    const stored = localStorage.getItem(getStorageKey());
    if (stored) {
      const data = JSON.parse(stored);
      // Update relative times for commits
      const commits = (data.commits || []).map((c: Commit) => ({
        ...c,
        time: getRelativeTime(c.timestamp),
      }));
      return {
        commits,
        stagedChanges: data.stagedChanges || [],
        unstagedChanges: data.unstagedChanges || [],
      };
    }
  } catch (e) {
    console.error("Failed to load version control from storage:", e);
  }
  return { commits: [], stagedChanges: [], unstagedChanges: [] };
};

// Save to localStorage
const saveToStorage = (data: { commits: Commit[]; stagedChanges: FileChange[]; unstagedChanges: FileChange[] }) => {
  try {
    localStorage.setItem(getStorageKey(), JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save version control to storage:", e);
  }
};

export const VersionControlProvider = ({ children }: { children: ReactNode }) => {
  const [stagedChanges, setStagedChanges] = useState<FileChange[]>([]);
  const [unstagedChanges, setUnstagedChanges] = useState<FileChange[]>([]);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [currentCommitId, setCurrentCommitId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = loadFromStorage();
    setStagedChanges(stored.stagedChanges);
    setUnstagedChanges(stored.unstagedChanges);
    setCommits(stored.commits);
    setIsLoaded(true);
  }, []);

  // Save to localStorage when state changes
  useEffect(() => {
    if (isLoaded) {
      saveToStorage({ commits, stagedChanges, unstagedChanges });
    }
  }, [commits, stagedChanges, unstagedChanges, isLoaded]);

  // Update relative times periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setCommits(prev => prev.map(c => ({
        ...c,
        time: getRelativeTime(c.timestamp),
      })));
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const stageAllChanges = useCallback(() => {
    if (unstagedChanges.length === 0) return;
    
    setStagedChanges(prev => [...prev, ...unstagedChanges]);
    setUnstagedChanges([]);
  }, [unstagedChanges]);

  const commitChanges = useCallback((message: string, sceneState: SerializedObject[]) => {
    if (stagedChanges.length === 0 || !message.trim()) return;
    
    const timestamp = Date.now();
    const newCommit: Commit = {
      id: timestamp.toString(),
      message: message.trim(),
      author: "you",
      time: "just now",
      timestamp,
      hash: generateHash(),
      files: [...stagedChanges],
      sceneState,
    };

    setCommits(prev => [newCommit, ...prev]);
    setStagedChanges([]);
    setCurrentCommitId(newCommit.id);
  }, [stagedChanges]);

  const addChange = useCallback((change: FileChange) => {
    setUnstagedChanges(prev => {
      // Check if file already exists in unstaged changes
      const existingIndex = prev.findIndex(c => c.name === change.name && c.path === change.path);
      if (existingIndex >= 0) {
        // Update existing change
        const updated = [...prev];
        updated[existingIndex] = change;
        return updated;
      }
      // Add new change
      return [...prev, change];
    });
  }, []);

  const removeChange = useCallback((name: string) => {
    setUnstagedChanges(prev => prev.filter(c => c.name !== name));
    setStagedChanges(prev => prev.filter(c => c.name !== name));
  }, []);

  const restoreCommit = useCallback((commitId: string): SerializedObject[] | null => {
    const commit = commits.find(c => c.id === commitId);
    if (!commit) return null;
    
    setCurrentCommitId(commitId);
    // Clear any pending changes when restoring
    setStagedChanges([]);
    setUnstagedChanges([]);
    
    return commit.sceneState;
  }, [commits]);

  const value: VersionControlContextType = {
    stagedChanges,
    unstagedChanges,
    commits,
    currentCommitId,
    stageAllChanges,
    commitChanges,
    addChange,
    removeChange,
    restoreCommit,
    hasUnstagedChanges: unstagedChanges.length > 0,
    hasStagedChanges: stagedChanges.length > 0,
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
