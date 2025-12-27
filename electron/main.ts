import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron';
import { join, dirname, basename } from 'path';
import { existsSync, mkdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { FileWatcherService } from './services/file-watcher.js';
import { GitService } from './services/git-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class RhinoStudio {
  private mainWindow: BrowserWindow | null = null;
  private currentProjectFile: string | null = null;
  private fileWatcher: FileWatcherService | null = null;
  private gitService: GitService | null = null;

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
        preload: join(__dirname, 'preload.js'),
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
            label: 'Open .3dm Project...',
            accelerator: 'CmdOrCtrl+O',
            click: () => this.openProjectDialog()
          },
          {
            label: 'Close Project',
            accelerator: 'CmdOrCtrl+W',
            click: () => this.closeProject()
          },
          { type: 'separator' },
          {
            label: 'Commit Changes...',
            accelerator: 'CmdOrCtrl+Shift+C',
            click: () => this.commitChanges()
          }
        ]
      },
      {
        label: 'Version Control',
        submenu: [
          {
            label: 'Initialize Repository',
            click: () => this.initializeRepository()
          },
          { type: 'separator' },
          {
            label: 'Pull Changes',
            accelerator: 'CmdOrCtrl+Shift+P',
            click: () => this.pullChanges()
          },
          {
            label: 'Push Changes',
            accelerator: 'CmdOrCtrl+Shift+U',
            click: () => this.pushChanges()
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
    // Project management
    ipcMain.handle('open-project-dialog', () => this.openProjectDialog());
    ipcMain.handle('get-current-project', () => this.getCurrentProject());
    ipcMain.handle('close-project', () => this.closeProject());

    // Version control
    ipcMain.handle('git-init', (_, projectPath: string) => this.gitService?.init(projectPath));
    ipcMain.handle('git-status', () => this.gitService?.getStatus());
    ipcMain.handle('git-commit', (_, message: string, files: string[]) => this.gitService?.commit(message, files));
    ipcMain.handle('git-push', () => this.gitService?.push());
    ipcMain.handle('git-pull', () => this.gitService?.pull());
    ipcMain.handle('git-log', () => this.gitService?.getLog());
    ipcMain.handle('git-checkout', (_, commitHash: string) => this.gitService?.checkout(commitHash));

    // File watching
    ipcMain.handle('start-file-watching', () => this.startFileWatching());
    ipcMain.handle('stop-file-watching', () => this.stopFileWatching());
  }

  private async openProjectDialog(): Promise<string | null> {
    const result = await dialog.showOpenDialog(this.mainWindow!, {
      title: 'Open .3dm Project',
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
    const projectDir = dirname(filePath);
    
    // Initialize Git service for this project
    this.gitService = new GitService(projectDir);
    
    // Start file watching
    await this.startFileWatching();
    
    // Update window title
    if (this.mainWindow) {
      this.mainWindow.setTitle(`0studio - ${basename(filePath)}`);
    }

    // Notify renderer process
    this.mainWindow?.webContents.send('project-opened', {
      filePath,
      projectDir,
      fileName: basename(filePath)
    });
  }

  private async closeProject(): Promise<void> {
    this.currentProjectFile = null;
    this.gitService = null;
    await this.stopFileWatching();
    
    if (this.mainWindow) {
      this.mainWindow.setTitle('0studio');
    }

    this.mainWindow?.webContents.send('project-closed');
  }

  private getCurrentProject() {
    return this.currentProjectFile ? {
      filePath: this.currentProjectFile,
      projectDir: dirname(this.currentProjectFile),
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

  private async initializeRepository(): Promise<void> {
    if (!this.currentProjectFile) {
      dialog.showErrorBox('Error', 'No project is currently open.');
      return;
    }

    const projectDir = dirname(this.currentProjectFile);
    try {
      await this.gitService?.init(projectDir);
      dialog.showMessageBox(this.mainWindow!, {
        type: 'info',
        title: 'Repository Initialized',
        message: 'Git repository has been initialized for this project.'
      });
    } catch (error) {
      dialog.showErrorBox('Error', `Failed to initialize repository: ${error}`);
    }
  }

  private async commitChanges(): Promise<void> {
    if (!this.gitService) {
      dialog.showErrorBox('Error', 'No project is currently open.');
      return;
    }

    this.mainWindow?.webContents.send('show-commit-dialog');
  }

  private async pullChanges(): Promise<void> {
    if (!this.gitService) {
      dialog.showErrorBox('Error', 'No project is currently open.');
      return;
    }

    try {
      await this.gitService.pull();
      this.mainWindow?.webContents.send('git-operation-complete', 'pull');
    } catch (error) {
      dialog.showErrorBox('Error', `Failed to pull changes: ${error}`);
    }
  }

  private async pushChanges(): Promise<void> {
    if (!this.gitService) {
      dialog.showErrorBox('Error', 'No project is currently open.');
      return;
    }

    try {
      await this.gitService.push();
      this.mainWindow?.webContents.send('git-operation-complete', 'push');
    } catch (error) {
      dialog.showErrorBox('Error', `Failed to push changes: ${error}`);
    }
  }
}

// Create the app instance
new RhinoStudio();