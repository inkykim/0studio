/// <reference types="vite/client" />

export interface ProjectInfo {
  filePath: string;
  projectDir: string;
  fileName: string;
}

export interface FileChangeEvent {
  eventType: string;
  filename: string;
  filePath: string;
}

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
}

declare global {
  interface Window {
    electronAPI?: {
      openProjectDialog: () => Promise<string | null>;
      getCurrentProject: () => Promise<ProjectInfo | null>;
      closeProject: () => Promise<void>;
      
      gitInit: (projectPath: string) => Promise<void>;
      gitStatus: () => Promise<GitStatus>;
      gitCommit: (message: string, files: string[]) => Promise<void>;
      gitPush: () => Promise<void>;
      gitPull: () => Promise<void>;
      gitLog: () => Promise<GitCommit[]>;
      gitCheckout: (commitHash: string) => Promise<void>;
      
      startFileWatching: () => Promise<void>;
      stopFileWatching: () => Promise<void>;
      setCurrentFile: (filePath: string) => Promise<void>;
      readFileBuffer: (filePath: string) => Promise<ArrayBuffer>;
      
      onProjectOpened: (callback: (project: ProjectInfo) => void) => void;
      onProjectClosed: (callback: () => void) => void;
      onFileChanged: (callback: (event: FileChangeEvent) => void) => void;
      onShowCommitDialog: (callback: () => void) => void;
      onGitOperationComplete: (callback: (operation: string) => void) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}