import { contextBridge, ipcRenderer } from 'electron';

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
  }>;
  branch: string;
  ahead: number;
  behind: number;
}

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Project management
  openProjectDialog: () => ipcRenderer.invoke('open-project-dialog'),
  getCurrentProject: () => ipcRenderer.invoke('get-current-project'),
  closeProject: () => ipcRenderer.invoke('close-project'),

  // Version control
  gitInit: (projectPath: string) => ipcRenderer.invoke('git-init', projectPath),
  gitStatus: () => ipcRenderer.invoke('git-status'),
  gitCommit: (message: string, files: string[]) => ipcRenderer.invoke('git-commit', message, files),
  gitPush: () => ipcRenderer.invoke('git-push'),
  gitPull: () => ipcRenderer.invoke('git-pull'),
  gitLog: () => ipcRenderer.invoke('git-log'),
  gitCheckout: (commitHash: string) => ipcRenderer.invoke('git-checkout', commitHash),

  // File watching
  startFileWatching: () => ipcRenderer.invoke('start-file-watching'),
  stopFileWatching: () => ipcRenderer.invoke('stop-file-watching'),

  // Event listeners
  onProjectOpened: (callback: (project: ProjectInfo) => void) => {
    ipcRenderer.on('project-opened', (_, project) => callback(project));
  },
  
  onProjectClosed: (callback: () => void) => {
    ipcRenderer.on('project-closed', callback);
  },
  
  onFileChanged: (callback: (event: FileChangeEvent) => void) => {
    ipcRenderer.on('file-changed', (_, event) => callback(event));
  },
  
  onShowCommitDialog: (callback: () => void) => {
    ipcRenderer.on('show-commit-dialog', callback);
  },
  
  onGitOperationComplete: (callback: (operation: string) => void) => {
    ipcRenderer.on('git-operation-complete', (_, operation) => callback(operation));
  },

  // Remove listeners
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

// Type definitions for TypeScript
declare global {
  interface Window {
    electronAPI: {
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
      
      onProjectOpened: (callback: (project: ProjectInfo) => void) => void;
      onProjectClosed: (callback: () => void) => void;
      onFileChanged: (callback: (event: FileChangeEvent) => void) => void;
      onShowCommitDialog: (callback: () => void) => void;
      onGitOperationComplete: (callback: (operation: string) => void) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}