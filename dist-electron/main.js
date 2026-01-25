import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import { join, dirname, basename } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { FileWatcherService } from './services/file-watcher.js';
import { FileStorageService } from './services/file-storage-service.js';
// Note: GitService removed - uses simple-git which requires bundling node_modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
class RhinoStudio {
    constructor() {
        this.mainWindow = null;
        this.currentProjectFile = null;
        this.fileWatcher = null;
        this.fileStorage = new FileStorageService();
        this.setupApp();
        this.setupIPC();
        this.createMenu();
    }
    setupApp() {
        // Handle creating/removing shortcuts on Windows when installing/uninstalling.
        // Note: electron-squirrel-startup is not needed for macOS
        // if (require('electron-squirrel-startup')) {
        //   app.quit();
        // }
        app.whenReady().then(() => {
            this.createWindow();
            app.on('activate', () => {
                if (BrowserWindow.getAllWindows().length === 0) {
                    this.createWindow();
                }
            });
            // Handle file associations on macOS
            app.on('open-file', async (event, filePath) => {
                event.preventDefault();
                if (filePath.endsWith('.3dm')) {
                    await this.openProject(filePath);
                }
            });
        });
        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') {
                app.quit();
            }
        });
        // Handle command line arguments for file opening
        if (process.argv.length >= 2) {
            const filePath = process.argv[process.argv.length - 1];
            if (filePath && filePath.endsWith('.3dm') && existsSync(filePath)) {
                app.whenReady().then(() => {
                    this.openProject(filePath);
                });
            }
        }
    }
    createWindow() {
        this.mainWindow = new BrowserWindow({
            width: 1400,
            height: 900,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: join(__dirname, 'preload.cjs'),
            },
            titleBarStyle: 'hiddenInset',
            trafficLightPosition: { x: 20, y: 20 },
            minWidth: 800,
            minHeight: 600,
            show: false,
        });
        // Load the app
        const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
        if (isDev) {
            // In development, wait for Vite server and then load
            this.mainWindow.loadURL('http://localhost:5173');
            this.mainWindow.webContents.openDevTools();
        }
        else {
            this.mainWindow.loadFile(join(__dirname, '../dist/index.html'));
        }
        this.mainWindow.once('ready-to-show', () => {
            this.mainWindow?.show();
        });
        this.mainWindow.on('closed', () => {
            this.mainWindow = null;
            this.fileWatcher?.stop();
        });
    }
    createMenu() {
        const template = [
            {
                label: app.getName(),
                submenu: [
                    { role: 'about' },
                    { type: 'separator' },
                    { role: 'services' },
                    { type: 'separator' },
                    { role: 'hide' },
                    { role: 'hideothers' },
                    { role: 'unhide' },
                    { type: 'separator' },
                    { role: 'quit' }
                ]
            },
            {
                label: 'File',
                submenu: [
                    {
                        label: 'Open .3dm Model...',
                        accelerator: 'CmdOrCtrl+O',
                        click: () => this.openProjectDialog()
                    },
                    {
                        label: 'Close Model',
                        accelerator: 'CmdOrCtrl+W',
                        click: () => this.closeProject()
                    },
                    { type: 'separator' },
                    {
                        label: 'Export Model...',
                        accelerator: 'CmdOrCtrl+E',
                        click: () => this.exportModel()
                    }
                ]
            },
            {
                label: 'Model',
                submenu: [
                    {
                        label: 'Save Version...',
                        accelerator: 'CmdOrCtrl+Shift+S',
                        click: () => this.saveModelVersion()
                    },
                    { type: 'separator' },
                    {
                        label: 'Show Version History',
                        accelerator: 'CmdOrCtrl+Shift+H',
                        click: () => this.showVersionHistory()
                    },
                    {
                        label: 'Simulate Changes',
                        accelerator: 'CmdOrCtrl+Shift+T',
                        click: () => this.simulateChanges()
                    }
                ]
            },
            {
                label: 'View',
                submenu: [
                    { role: 'reload' },
                    { role: 'forceReload' },
                    { role: 'toggleDevTools' },
                    { type: 'separator' },
                    { role: 'resetZoom' },
                    { role: 'zoomIn' },
                    { role: 'zoomOut' },
                    { type: 'separator' },
                    { role: 'togglefullscreen' }
                ]
            },
            {
                label: 'Window',
                submenu: [
                    { role: 'minimize' },
                    { role: 'close' }
                ]
            }
        ];
        const menu = Menu.buildFromTemplate(template);
        Menu.setApplicationMenu(menu);
    }
    setupIPC() {
        // Model management
        ipcMain.handle('open-project-dialog', () => this.openProjectDialog());
        ipcMain.handle('get-current-project', () => this.getCurrentProject());
        ipcMain.handle('close-project', () => this.closeProject());
        // Model version control
        ipcMain.handle('save-model-version', () => this.saveModelVersion());
        ipcMain.handle('show-version-history', () => this.showVersionHistory());
        ipcMain.handle('simulate-changes', () => this.simulateChanges());
        ipcMain.handle('export-model', () => this.exportModel());
        // File watching
        ipcMain.handle('start-file-watching', () => this.startFileWatching());
        ipcMain.handle('stop-file-watching', () => this.stopFileWatching());
        ipcMain.handle('set-current-file', (_, filePath) => this.setCurrentFile(filePath));
        ipcMain.handle('read-file-buffer', (_, filePath) => this.readFileBuffer(filePath));
        ipcMain.handle('write-file-buffer', (_, filePath, buffer) => this.writeFileBuffer(filePath, buffer));
        // File storage (0studio commit storage)
        ipcMain.handle('save-commit-file', (_, filePath, commitId, buffer) => this.saveCommitFile(filePath, commitId, buffer));
        ipcMain.handle('read-commit-file', (_, filePath, commitId) => this.readCommitFile(filePath, commitId));
        ipcMain.handle('list-commit-files', (_, filePath) => this.listCommitFiles(filePath));
        ipcMain.handle('commit-file-exists', (_, filePath, commitId) => this.commitFileExists(filePath, commitId));
        ipcMain.handle('save-tree-file', (_, filePath, treeData) => this.saveTreeFile(filePath, treeData));
        ipcMain.handle('load-tree-file', (_, filePath) => this.loadTreeFile(filePath));
        ipcMain.handle('validate-commit-files', (_, filePath, commitIds) => this.validateCommitFiles(filePath, commitIds));
    }
    async openProjectDialog() {
        const result = await dialog.showOpenDialog(this.mainWindow, {
            title: 'Open .3dm Model',
            filters: [
                { name: 'Rhino 3D Models', extensions: ['3dm'] },
                { name: 'All Files', extensions: ['*'] }
            ],
            properties: ['openFile']
        });
        if (!result.canceled && result.filePaths.length > 0) {
            const filePath = result.filePaths[0];
            await this.openProject(filePath);
            return filePath;
        }
        return null;
    }
    async openProject(filePath) {
        if (!existsSync(filePath)) {
            dialog.showErrorBox('Error', 'File not found: ' + filePath);
            return;
        }
        this.currentProjectFile = filePath;
        // Start file watching
        await this.startFileWatching();
        // Update window title
        if (this.mainWindow) {
            this.mainWindow.setTitle(`0studio - ${basename(filePath)}`);
        }
        // Notify renderer process
        this.mainWindow?.webContents.send('project-opened', {
            filePath,
            fileName: basename(filePath)
        });
    }
    async closeProject() {
        this.currentProjectFile = null;
        await this.stopFileWatching();
        if (this.mainWindow) {
            this.mainWindow.setTitle('0studio');
        }
        this.mainWindow?.webContents.send('project-closed');
    }
    getCurrentProject() {
        return this.currentProjectFile ? {
            filePath: this.currentProjectFile,
            fileName: basename(this.currentProjectFile)
        } : null;
    }
    async startFileWatching() {
        if (this.currentProjectFile && !this.fileWatcher) {
            this.fileWatcher = new FileWatcherService();
            this.fileWatcher.watch(this.currentProjectFile, (eventType, filename) => {
                this.mainWindow?.webContents.send('file-changed', {
                    eventType,
                    filename,
                    filePath: this.currentProjectFile
                });
            });
        }
    }
    async stopFileWatching() {
        if (this.fileWatcher) {
            this.fileWatcher.stop();
            this.fileWatcher = null;
        }
    }
    setCurrentFile(filePath) {
        this.currentProjectFile = filePath;
    }
    async readFileBuffer(filePath) {
        const fs = await import('fs/promises');
        const buffer = await fs.readFile(filePath);
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    }
    async writeFileBuffer(filePath, buffer) {
        const fsPromises = await import('fs/promises');
        const nodeBuffer = Buffer.from(buffer);
        await fsPromises.writeFile(filePath, nodeBuffer);
        console.log(`File written to: ${filePath}`);
    }
    // File storage methods for 0studio commit storage
    async saveCommitFile(filePath, commitId, buffer) {
        await this.fileStorage.saveCommitFile(filePath, commitId, buffer);
    }
    async readCommitFile(filePath, commitId) {
        return await this.fileStorage.readCommitFile(filePath, commitId);
    }
    async listCommitFiles(filePath) {
        return await this.fileStorage.listCommitFiles(filePath);
    }
    commitFileExists(filePath, commitId) {
        return this.fileStorage.commitFileExists(filePath, commitId);
    }
    // Tree file methods
    async saveTreeFile(filePath, treeData) {
        await this.fileStorage.saveTreeFile(filePath, treeData);
    }
    async loadTreeFile(filePath) {
        return await this.fileStorage.loadTreeFile(filePath);
    }
    validateCommitFiles(filePath, commitIds) {
        return this.fileStorage.validateCommitFiles(filePath, commitIds);
    }
    async saveModelVersion() {
        if (!this.currentProjectFile) {
            dialog.showErrorBox('Error', 'No model is currently open.');
            return;
        }
        this.mainWindow?.webContents.send('show-save-version-dialog');
    }
    async showVersionHistory() {
        if (!this.currentProjectFile) {
            dialog.showErrorBox('Error', 'No model is currently open.');
            return;
        }
        this.mainWindow?.webContents.send('show-version-history');
    }
    async simulateChanges() {
        if (!this.currentProjectFile) {
            dialog.showErrorBox('Error', 'No model is currently open.');
            return;
        }
        this.mainWindow?.webContents.send('simulate-model-changes');
    }
    async exportModel() {
        if (!this.currentProjectFile) {
            dialog.showErrorBox('Error', 'No model is currently open.');
            return;
        }
        this.mainWindow?.webContents.send('export-model');
    }
}
// Create the app instance
new RhinoStudio();
