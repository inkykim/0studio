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

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Project management
  openProjectDialog: () => ipcRenderer.invoke('open-project-dialog'),
  openProjectByPath: (filePath: string) => ipcRenderer.invoke('open-project-by-path', filePath),
  getCurrentProject: () => ipcRenderer.invoke('get-current-project'),
  closeProject: () => ipcRenderer.invoke('close-project'),

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
    const handler = (_: any, project: ProjectInfo) => callback(project);
    ipcRenderer.on('project-opened', handler);
    return () => ipcRenderer.removeListener('project-opened', handler);
  },

  onProjectClosed: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('project-closed', handler);
    return () => ipcRenderer.removeListener('project-closed', handler);
  },

  onFileChanged: (callback: (event: FileChangeEvent) => void) => {
    const handler = (_: any, event: FileChangeEvent) => callback(event);
    ipcRenderer.on('file-changed', handler);
    return () => ipcRenderer.removeListener('file-changed', handler);
  },

  onShowCommitDialog: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('show-commit-dialog', handler);
    return () => ipcRenderer.removeListener('show-commit-dialog', handler);
  },

  onGitOperationComplete: (callback: (operation: string) => void) => {
    const handler = (_: any, operation: string) => callback(operation);
    ipcRenderer.on('git-operation-complete', handler);
    return () => ipcRenderer.removeListener('git-operation-complete', handler);
  },
});

// Type definitions for TypeScript
declare global {
  interface Window {
    electronAPI: {
      openProjectDialog: () => Promise<string | null>;
      openProjectByPath: (filePath: string) => Promise<void>;
      getCurrentProject: () => Promise<ProjectInfo | null>;
      closeProject: () => Promise<void>;

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
      
      onProjectOpened: (callback: (project: ProjectInfo) => void) => () => void;
      onProjectClosed: (callback: () => void) => () => void;
      onFileChanged: (callback: (event: FileChangeEvent) => void) => () => void;
      onShowCommitDialog: (callback: () => void) => () => void;
      onGitOperationComplete: (callback: (operation: string) => void) => () => void;
    };
  }
}