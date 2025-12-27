import { contextBridge, ipcRenderer } from 'electron';
// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Project management
    openProjectDialog: () => ipcRenderer.invoke('open-project-dialog'),
    getCurrentProject: () => ipcRenderer.invoke('get-current-project'),
    closeProject: () => ipcRenderer.invoke('close-project'),
    // Version control
    gitInit: (projectPath) => ipcRenderer.invoke('git-init', projectPath),
    gitStatus: () => ipcRenderer.invoke('git-status'),
    gitCommit: (message, files) => ipcRenderer.invoke('git-commit', message, files),
    gitPush: () => ipcRenderer.invoke('git-push'),
    gitPull: () => ipcRenderer.invoke('git-pull'),
    gitLog: () => ipcRenderer.invoke('git-log'),
    gitCheckout: (commitHash) => ipcRenderer.invoke('git-checkout', commitHash),
    // File watching
    startFileWatching: () => ipcRenderer.invoke('start-file-watching'),
    stopFileWatching: () => ipcRenderer.invoke('stop-file-watching'),
    // Event listeners
    onProjectOpened: (callback) => {
        ipcRenderer.on('project-opened', (_, project) => callback(project));
    },
    onProjectClosed: (callback) => {
        ipcRenderer.on('project-closed', callback);
    },
    onFileChanged: (callback) => {
        ipcRenderer.on('file-changed', (_, event) => callback(event));
    },
    onShowCommitDialog: (callback) => {
        ipcRenderer.on('show-commit-dialog', callback);
    },
    onGitOperationComplete: (callback) => {
        ipcRenderer.on('git-operation-complete', (_, operation) => callback(operation));
    },
    // Remove listeners
    removeAllListeners: (channel) => {
        ipcRenderer.removeAllListeners(channel);
    }
});
