"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    // Project management
    openProjectDialog: () => electron_1.ipcRenderer.invoke('open-project-dialog'),
    getCurrentProject: () => electron_1.ipcRenderer.invoke('get-current-project'),
    closeProject: () => electron_1.ipcRenderer.invoke('close-project'),
    // Version control
    gitInit: (projectPath) => electron_1.ipcRenderer.invoke('git-init', projectPath),
    gitStatus: () => electron_1.ipcRenderer.invoke('git-status'),
    gitCommit: (message, files) => electron_1.ipcRenderer.invoke('git-commit', message, files),
    gitPush: () => electron_1.ipcRenderer.invoke('git-push'),
    gitPull: () => electron_1.ipcRenderer.invoke('git-pull'),
    gitLog: () => electron_1.ipcRenderer.invoke('git-log'),
    gitCheckout: (commitHash) => electron_1.ipcRenderer.invoke('git-checkout', commitHash),
    // File watching
    startFileWatching: () => electron_1.ipcRenderer.invoke('start-file-watching'),
    stopFileWatching: () => electron_1.ipcRenderer.invoke('stop-file-watching'),
    setCurrentFile: (filePath) => electron_1.ipcRenderer.invoke('set-current-file', filePath),
    readFileBuffer: (filePath) => electron_1.ipcRenderer.invoke('read-file-buffer', filePath),
    // Event listeners
    onProjectOpened: (callback) => {
        electron_1.ipcRenderer.on('project-opened', (_, project) => callback(project));
    },
    onProjectClosed: (callback) => {
        electron_1.ipcRenderer.on('project-closed', callback);
    },
    onFileChanged: (callback) => {
        electron_1.ipcRenderer.on('file-changed', (_, event) => callback(event));
    },
    onShowCommitDialog: (callback) => {
        electron_1.ipcRenderer.on('show-commit-dialog', callback);
    },
    onGitOperationComplete: (callback) => {
        electron_1.ipcRenderer.on('git-operation-complete', (_, operation) => callback(operation));
    },
    // Remove listeners
    removeAllListeners: (channel) => {
        electron_1.ipcRenderer.removeAllListeners(channel);
    }
});
