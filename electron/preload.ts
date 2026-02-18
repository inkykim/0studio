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
  openProjectByPath: (filePath: string) => ipcRenderer.invoke('open-project-by-path', filePath),
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
      setCurrentFile: (filePath: string) => ipcRenderer.invoke('set-current-file', filePath),
      readFileBuffer: (filePath: string) => ipcRenderer.invoke('read-file-buffer', filePath),
      writeFileBuffer: (filePath: string, buffer: ArrayBuffer) => ipcRenderer.invoke('write-file-buffer', filePath, buffer),

      // File storage (0studio commit storage)
      saveCommitFile: (filePath: string, commitId: string, buffer: ArrayBuffer) => 
        ipcRenderer.invoke('save-commit-file', filePath, commitId, buffer),
      readCommitFile: (filePath: string, commitId: string) => 
        ipcRenderer.invoke('read-commit-file', filePath, commitId),
      listCommitFiles: (filePath: string) => 
        ipcRenderer.invoke('list-commit-files', filePath),
      commitFileExists: (filePath: string, commitId: string) => 
        ipcRenderer.invoke('commit-file-exists', filePath, commitId),
      saveTreeFile: (filePath: string, treeData: any) => 
        ipcRenderer.invoke('save-tree-file', filePath, treeData),
      loadTreeFile: (filePath: string) => 
        ipcRenderer.invoke('load-tree-file', filePath),
      validateCommitFiles: (filePath: string, commitIds: string[]) => 
        ipcRenderer.invoke('validate-commit-files', filePath, commitIds),

      // Save dialog
      showSaveDialog: (options: { defaultPath?: string, filters?: { name: string, extensions: string[] }[] }) =>
        ipcRenderer.invoke('show-save-dialog', options),

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
      openProjectByPath: (filePath: string) => Promise<void>;
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
      writeFileBuffer: (filePath: string, buffer: ArrayBuffer) => Promise<void>;
      
      // File storage (0studio commit storage)
      saveCommitFile: (filePath: string, commitId: string, buffer: ArrayBuffer) => Promise<void>;
      readCommitFile: (filePath: string, commitId: string) => Promise<ArrayBuffer | null>;
      listCommitFiles: (filePath: string) => Promise<string[]>;
      commitFileExists: (filePath: string, commitId: string) => Promise<boolean>;
      saveTreeFile: (filePath: string, treeData: any) => Promise<void>;
      loadTreeFile: (filePath: string) => Promise<any>;
      validateCommitFiles: (filePath: string, commitIds: string[]) => Promise<string[]>;
      showSaveDialog: (options: { defaultPath?: string, filters?: { name: string, extensions: string[] }[] }) => Promise<string | null>;
      
      onProjectOpened: (callback: (project: ProjectInfo) => void) => void;
      onProjectClosed: (callback: () => void) => void;
      onFileChanged: (callback: (event: FileChangeEvent) => void) => void;
      onShowCommitDialog: (callback: () => void) => void;
      onGitOperationComplete: (callback: (operation: string) => void) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}