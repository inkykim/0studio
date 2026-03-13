"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    // Project management
    openProjectDialog: () => electron_1.ipcRenderer.invoke('open-project-dialog'),
    openProjectByPath: (filePath) => electron_1.ipcRenderer.invoke('open-project-by-path', filePath),
    getCurrentProject: () => electron_1.ipcRenderer.invoke('get-current-project'),
    closeProject: () => electron_1.ipcRenderer.invoke('close-project'),
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
    // Save dialog
    showSaveDialog: (options) => electron_1.ipcRenderer.invoke('show-save-dialog', options),
    // Event listeners
    onProjectOpened: (callback) => {
        const handler = (_, project) => callback(project);
        electron_1.ipcRenderer.on('project-opened', handler);
        return () => electron_1.ipcRenderer.removeListener('project-opened', handler);
    },
    onProjectClosed: (callback) => {
        const handler = () => callback();
        electron_1.ipcRenderer.on('project-closed', handler);
        return () => electron_1.ipcRenderer.removeListener('project-closed', handler);
    },
    onFileChanged: (callback) => {
        const handler = (_, event) => callback(event);
        electron_1.ipcRenderer.on('file-changed', handler);
        return () => electron_1.ipcRenderer.removeListener('file-changed', handler);
    },
    onShowCommitDialog: (callback) => {
        const handler = () => callback();
        electron_1.ipcRenderer.on('show-commit-dialog', handler);
        return () => electron_1.ipcRenderer.removeListener('show-commit-dialog', handler);
    },
    onGitOperationComplete: (callback) => {
        const handler = (_, operation) => callback(operation);
        electron_1.ipcRenderer.on('git-operation-complete', handler);
        return () => electron_1.ipcRenderer.removeListener('git-operation-complete', handler);
    },
});
