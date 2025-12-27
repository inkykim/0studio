import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";

// Safe desktop API import
const isDesktopEnvironment = typeof window !== 'undefined' && window.electronAPI;

// Define types locally for browser compatibility
export interface GitStatus {
  files: Array<{
    path: string;
    status: string;
    staged: boolean;
  }>;
  branch: string;
  ahead: number;
  behind: number;
  hasRemote: boolean;
}

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
  files?: string[];
}

// Create safe desktop API wrapper
const safeDesktopAPI = {
  get isDesktop() { return isDesktopEnvironment; },
  onProjectOpened: isDesktopEnvironment ? (callback: any) => window.electronAPI?.onProjectOpened(callback) : () => {},
  onProjectClosed: isDesktopEnvironment ? (callback: any) => window.electronAPI?.onProjectClosed(callback) : () => {},
  onFileChanged: isDesktopEnvironment ? (callback: any) => window.electronAPI?.onFileChanged(callback) : () => {},
  onGitOperationComplete: isDesktopEnvironment ? (callback: any) => window.electronAPI?.onGitOperationComplete(callback) : () => {},
  removeAllListeners: isDesktopEnvironment ? (channel: string) => window.electronAPI?.removeAllListeners(channel) : () => {},
  getCurrentProject: isDesktopEnvironment ? () => window.electronAPI?.getCurrentProject() : () => Promise.resolve(null),
  openProjectDialog: isDesktopEnvironment ? () => window.electronAPI?.openProjectDialog() : () => Promise.resolve(null),
  closeProject: isDesktopEnvironment ? () => window.electronAPI?.closeProject() : () => Promise.resolve(),
  gitInit: isDesktopEnvironment ? (path: string) => window.electronAPI?.gitInit(path) : () => Promise.resolve(),
  gitStatus: isDesktopEnvironment ? () => window.electronAPI?.gitStatus() : () => Promise.resolve(null),
  gitCommit: isDesktopEnvironment ? (msg: string, files: string[]) => window.electronAPI?.gitCommit(msg, files) : () => Promise.resolve(),
  gitPush: isDesktopEnvironment ? () => window.electronAPI?.gitPush() : () => Promise.resolve(),
  gitPull: isDesktopEnvironment ? () => window.electronAPI?.gitPull() : () => Promise.resolve(),
  gitLog: isDesktopEnvironment ? () => window.electronAPI?.gitLog() : () => Promise.resolve([]),
  gitCheckout: isDesktopEnvironment ? (hash: string) => window.electronAPI?.gitCheckout(hash) : () => Promise.resolve(),
};

const desktopAPI = safeDesktopAPI;

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
  status: "added" | "modified" | "deleted" | "staged" | "untracked";
  path: string;
  staged?: boolean;
}

interface VersionControlContextType {
  // Desktop integration
  currentProject: string | null;
  projectName: string | null;
  isGitRepo: boolean;
  
  // Git status
  gitStatus: GitStatus | null;
  gitCommits: GitCommit[];
  currentBranch: string;
  
  // Local changes tracking
  stagedChanges: FileChange[];
  unstagedChanges: FileChange[];
  commits: Commit[];
  currentCommitId: string | null;
  
  // Actions
  openProject: () => Promise<void>;
  closeProject: () => Promise<void>;
  initRepository: () => Promise<void>;
  refreshGitStatus: () => Promise<void>;
  commitChanges: (message: string, sceneState?: SerializedObject[]) => Promise<void>;
  pushChanges: () => Promise<void>;
  pullChanges: () => Promise<void>;
  checkoutCommit: (commitHash: string) => Promise<void>;
  
  // Legacy methods for compatibility
  stageAllChanges: () => void;
  addChange: (change: FileChange) => void;
  removeChange: (name: string) => void;
  restoreCommit: (commitId: string) => SerializedObject[] | null;
  clearHistory: () => void;
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
  // Desktop integration state
  const [currentProject, setCurrentProject] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [isGitRepo, setIsGitRepo] = useState(false);
  
  // Git state
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [gitCommits, setGitCommits] = useState<GitCommit[]>([]);
  const [currentBranch, setCurrentBranch] = useState('main');
  
  // Legacy state for compatibility
  const [stagedChanges, setStagedChanges] = useState<FileChange[]>([]);
  const [unstagedChanges, setUnstagedChanges] = useState<FileChange[]>([]);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [currentCommitId, setCurrentCommitId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load legacy data if not in desktop mode
  useEffect(() => {
    if (!desktopAPI.isDesktop) {
      const stored = loadFromStorage();
      setStagedChanges(stored.stagedChanges);
      setUnstagedChanges(stored.unstagedChanges);
      setCommits(stored.commits);
    }
    setIsLoaded(true);
  }, []);

  // Save legacy data if not in desktop mode
  useEffect(() => {
    if (isLoaded && !desktopAPI.isDesktop) {
      saveToStorage({ commits, stagedChanges, unstagedChanges });
    }
  }, [commits, stagedChanges, unstagedChanges, isLoaded]);

  // Initialize desktop API listeners
  useEffect(() => {
    if (desktopAPI.isDesktop) {
      // Project events
      desktopAPI.onProjectOpened((project) => {
        setCurrentProject(project.filePath);
        setProjectName(project.fileName);
        refreshGitStatus();
      });

      desktopAPI.onProjectClosed(() => {
        setCurrentProject(null);
        setProjectName(null);
        setIsGitRepo(false);
        setGitStatus(null);
        setGitCommits([]);
        setStagedChanges([]);
        setUnstagedChanges([]);
      });

      // File change events
      desktopAPI.onFileChanged((event) => {
        console.log('File changed:', event);
        refreshGitStatus();
      });

      // Git operation events
      desktopAPI.onGitOperationComplete((operation) => {
        console.log(`Git ${operation} completed`);
        refreshGitStatus();
        refreshCommitHistory();
      });

      // Check if we already have a project open
      desktopAPI.getCurrentProject().then((project) => {
        if (project) {
          setCurrentProject(project.filePath);
          setProjectName(project.fileName);
          refreshGitStatus();
        }
      });
    }

    return () => {
      if (desktopAPI.isDesktop) {
        desktopAPI.removeAllListeners('project-opened');
        desktopAPI.removeAllListeners('project-closed');
        desktopAPI.removeAllListeners('file-changed');
        desktopAPI.removeAllListeners('git-operation-complete');
      }
    };
  }, []);

  // Update relative times periodically for legacy commits
  useEffect(() => {
    const interval = setInterval(() => {
      setCommits(prev => prev.map(c => ({
        ...c,
        time: getRelativeTime(c.timestamp),
      })));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Desktop API integration methods
  const openProject = useCallback(async () => {
    if (desktopAPI.isDesktop) {
      await desktopAPI.openProjectDialog();
    }
  }, []);

  const closeProject = useCallback(async () => {
    if (desktopAPI.isDesktop) {
      await desktopAPI.closeProject();
    }
  }, []);

  const initRepository = useCallback(async () => {
    if (desktopAPI.isDesktop && currentProject) {
      try {
        await desktopAPI.gitInit(currentProject);
        setIsGitRepo(true);
        await refreshGitStatus();
      } catch (error) {
        console.error('Failed to initialize repository:', error);
      }
    }
  }, [currentProject]);

  const refreshGitStatus = useCallback(async () => {
    if (desktopAPI.isDesktop) {
      try {
        const status = await desktopAPI.gitStatus();
        if (status) {
          setGitStatus(status);
          setCurrentBranch(status.branch);
          setIsGitRepo(true);
          
          // Update legacy state for compatibility
          const staged = status.files.filter(f => f.staged).map(f => ({
            name: f.path,
            status: 'staged' as const,
            path: f.path,
            staged: true
          }));
          
          const unstaged = status.files.filter(f => !f.staged).map(f => ({
            name: f.path,
            status: f.status as any,
            path: f.path,
            staged: false
          }));
          
          setStagedChanges(staged);
          setUnstagedChanges(unstaged);
        }
      } catch (error) {
        console.error('Failed to get git status:', error);
        setIsGitRepo(false);
      }
    }
  }, []);

  const refreshCommitHistory = useCallback(async () => {
    if (desktopAPI.isDesktop && isGitRepo) {
      try {
        const commits = await desktopAPI.gitLog();
        setGitCommits(commits);
        
        // Convert to legacy format for compatibility
        const legacyCommits = commits.map(commit => ({
          id: commit.hash,
          message: commit.message,
          author: commit.author,
          time: commit.date,
          timestamp: new Date(commit.date).getTime(),
          hash: commit.hash,
          files: commit.files?.map(f => ({
            name: f,
            status: 'modified' as const,
            path: f
          })) || [],
          sceneState: [] // Would need to be restored from commit data
        }));
        
        setCommits(legacyCommits);
        setCurrentCommitId(commits[0]?.hash || null);
      } catch (error) {
        console.error('Failed to get commit history:', error);
      }
    }
  }, [isGitRepo]);

  const commitChanges = useCallback(async (message: string, sceneState?: SerializedObject[]) => {
    if (desktopAPI.isDesktop && currentProject) {
      try {
        const filesToCommit = gitStatus?.files.filter(f => f.staged || !f.staged).map(f => f.path) || [projectName || ''];
        await desktopAPI.gitCommit(message, filesToCommit);
        await refreshGitStatus();
        await refreshCommitHistory();
      } catch (error) {
        console.error('Failed to commit changes:', error);
      }
    } else {
      // Legacy commit for web version
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
        sceneState: sceneState || [],
      };

      setCommits(prev => [newCommit, ...prev]);
      setStagedChanges([]);
      setCurrentCommitId(newCommit.id);
    }
  }, [currentProject, projectName, gitStatus, stagedChanges]);

  const pushChanges = useCallback(async () => {
    if (desktopAPI.isDesktop) {
      try {
        await desktopAPI.gitPush();
      } catch (error) {
        console.error('Failed to push changes:', error);
        throw error;
      }
    }
  }, []);

  const pullChanges = useCallback(async () => {
    if (desktopAPI.isDesktop) {
      try {
        await desktopAPI.gitPull();
        await refreshGitStatus();
        await refreshCommitHistory();
      } catch (error) {
        console.error('Failed to pull changes:', error);
        throw error;
      }
    }
  }, []);

  const checkoutCommit = useCallback(async (commitHash: string) => {
    if (desktopAPI.isDesktop) {
      try {
        await desktopAPI.gitCheckout(commitHash);
        await refreshGitStatus();
        setCurrentCommitId(commitHash);
      } catch (error) {
        console.error('Failed to checkout commit:', error);
        throw error;
      }
    }
  }, []);

  // Legacy methods for compatibility
  const stageAllChanges = useCallback(() => {
    if (unstagedChanges.length === 0) return;
    setStagedChanges(prev => [...prev, ...unstagedChanges]);
    setUnstagedChanges([]);
  }, [unstagedChanges]);

  const addChange = useCallback((change: FileChange) => {
    setUnstagedChanges(prev => {
      const existingIndex = prev.findIndex(c => c.name === change.name && c.path === change.path);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = change;
        return updated;
      }
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
    setStagedChanges([]);
    setUnstagedChanges([]);
    
    return commit.sceneState;
  }, [commits]);

  const clearHistory = useCallback(() => {
    setCommits([]);
    setStagedChanges([]);
    setUnstagedChanges([]);
    setCurrentCommitId(null);
  }, []);

  // Refresh git status periodically
  useEffect(() => {
    if (isGitRepo && desktopAPI.isDesktop) {
      refreshCommitHistory();
    }
  }, [isGitRepo, refreshCommitHistory]);

  const value: VersionControlContextType = {
    // Desktop integration
    currentProject,
    projectName,
    isGitRepo,
    gitStatus,
    gitCommits,
    currentBranch,
    
    // Desktop actions
    openProject,
    closeProject,
    initRepository,
    refreshGitStatus,
    commitChanges,
    pushChanges,
    pullChanges,
    checkoutCommit,
    
    // Legacy state
    stagedChanges,
    unstagedChanges,
    commits,
    currentCommitId,
    
    // Legacy actions
    stageAllChanges,
    addChange,
    removeChange,
    restoreCommit,
    clearHistory,
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
