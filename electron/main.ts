import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron';
import { join, dirname, basename } from 'path';
import { existsSync, mkdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { FileWatcherService } from './services/file-watcher.js';
import { GitService } from './services/git-service.js';
import { FileStorageService } from './services/file-storage-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class RhinoStudio {
  private mainWindow: BrowserWindow | null = null;
  private currentProjectFile: string | null = null;
  private fileWatcher: FileWatcherService | null = null;
  private gitService: GitService | null = null;
  private fileStorage: FileStorageService = new FileStorageService();

  constructor() {
    this.setupApp();
    this.setupIPC();
    this.createMenu();
  }

  private setupApp() {
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

  private createWindow() {
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
    } else {
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

  private createMenu() {
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
    ] as any;

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  private setupIPC() {
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
    ipcMain.handle('set-current-file', (_, filePath: string) => this.setCurrentFile(filePath));
    ipcMain.handle('read-file-buffer', (_, filePath: string) => this.readFileBuffer(filePath));
    ipcMain.handle('write-file-buffer', (_, filePath: string, buffer: ArrayBuffer) => this.writeFileBuffer(filePath, buffer));

    // File storage (0studio commit storage)
    ipcMain.handle('save-commit-file', (_, filePath: string, commitId: string, buffer: ArrayBuffer) => 
      this.saveCommitFile(filePath, commitId, buffer));
    ipcMain.handle('read-commit-file', (_, filePath: string, commitId: string) => 
      this.readCommitFile(filePath, commitId));
    ipcMain.handle('list-commit-files', (_, filePath: string) => 
      this.listCommitFiles(filePath));
    ipcMain.handle('commit-file-exists', (_, filePath: string, commitId: string) => 
      this.commitFileExists(filePath, commitId));
  }

  private async openProjectDialog(): Promise<string | null> {
    const result = await dialog.showOpenDialog(this.mainWindow!, {
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

  private async openProject(filePath: string): Promise<void> {
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

  private async closeProject(): Promise<void> {
    this.currentProjectFile = null;
    await this.stopFileWatching();
    
    if (this.mainWindow) {
      this.mainWindow.setTitle('0studio');
    }

    this.mainWindow?.webContents.send('project-closed');
  }

  private getCurrentProject() {
    return this.currentProjectFile ? {
      filePath: this.currentProjectFile,
      fileName: basename(this.currentProjectFile)
    } : null;
  }

  private async startFileWatching(): Promise<void> {
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

  private async stopFileWatching(): Promise<void> {
    if (this.fileWatcher) {
      this.fileWatcher.stop();
      this.fileWatcher = null;
    }
  }

  private setCurrentFile(filePath: string): void {
    this.currentProjectFile = filePath;
  }

  private async readFileBuffer(filePath: string): Promise<ArrayBuffer> {
    const fs = await import('fs/promises');
    const buffer = await fs.readFile(filePath);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  }

  private async writeFileBuffer(filePath: string, buffer: ArrayBuffer): Promise<void> {
    const fsPromises = await import('fs/promises');
    const nodeBuffer = Buffer.from(buffer);
    await fsPromises.writeFile(filePath, nodeBuffer);
    console.log(`File written to: ${filePath}`);
  }

  // File storage methods for 0studio commit storage
  private async saveCommitFile(filePath: string, commitId: string, buffer: ArrayBuffer): Promise<void> {
    await this.fileStorage.saveCommitFile(filePath, commitId, buffer);
  }

  private async readCommitFile(filePath: string, commitId: string): Promise<ArrayBuffer | null> {
    return await this.fileStorage.readCommitFile(filePath, commitId);
  }

  private async listCommitFiles(filePath: string): Promise<string[]> {
    return await this.fileStorage.listCommitFiles(filePath);
  }

  private commitFileExists(filePath: string, commitId: string): boolean {
    return this.fileStorage.commitFileExists(filePath, commitId);
  }

  private async saveModelVersion(): Promise<void> {
    if (!this.currentProjectFile) {
      dialog.showErrorBox('Error', 'No model is currently open.');
      return;
    }

    this.mainWindow?.webContents.send('show-save-version-dialog');
  }

  private async showVersionHistory(): Promise<void> {
    if (!this.currentProjectFile) {
      dialog.showErrorBox('Error', 'No model is currently open.');
      return;
    }

    this.mainWindow?.webContents.send('show-version-history');
  }

  private async simulateChanges(): Promise<void> {
    if (!this.currentProjectFile) {
      dialog.showErrorBox('Error', 'No model is currently open.');
      return;
    }

    this.mainWindow?.webContents.send('simulate-model-changes');
  }

  private async exportModel(): Promise<void> {
    if (!this.currentProjectFile) {
      dialog.showErrorBox('Error', 'No model is currently open.');
      return;
    }

    this.mainWindow?.webContents.send('export-model');
  }
}

// Create the app instance
new RhinoStudio();