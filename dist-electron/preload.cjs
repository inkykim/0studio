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
    writeFileBuffer: (filePath, buffer) => electron_1.ipcRenderer.invoke('write-file-buffer', filePath, buffer),
    // File storage (0studio commit storage)
    saveCommitFile: (filePath, commitId, buffer) => electron_1.ipcRenderer.invoke('save-commit-file', filePath, commitId, buffer),
    readCommitFile: (filePath, commitId) => electron_1.ipcRenderer.invoke('read-commit-file', filePath, commitId),
    listCommitFiles: (filePath) => electron_1.ipcRenderer.invoke('list-commit-files', filePath),
    commitFileExists: (filePath, commitId) => electron_1.ipcRenderer.invoke('commit-file-exists', filePath, commitId),
    saveTreeFile: (filePath, treeData) => electron_1.ipcRenderer.invoke('save-tree-file', filePath, treeData),
    loadTreeFile: (filePath) => electron_1.ipcRenderer.invoke('load-tree-file', filePath),
    validateCommitFiles: (filePath, commitIds) => electron_1.ipcRenderer.invoke('validate-commit-files', filePath, commitIds),
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
