// Desktop API service for interacting with Electron main process
// This provides a clean interface between React and Electron

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

class DesktopAPIService {
  private isElectron: boolean;

  constructor() {
    this.isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;
  }

  get isDesktop(): boolean {
    return this.isElectron;
  }

  // Project Management
  async openProjectDialog(): Promise<string | null> {
    if (!this.isElectron || !window.electronAPI) return null;
    return window.electronAPI.openProjectDialog();
  }

  async openProjectByPath(filePath: string): Promise<void> {
    if (!this.isElectron || !window.electronAPI) return;
    return window.electronAPI.openProjectByPath(filePath);
  }

  async getCurrentProject(): Promise<ProjectInfo | null> {
    if (!this.isElectron || !window.electronAPI) return null;
    return window.electronAPI.getCurrentProject();
  }

  async closeProject(): Promise<void> {
    if (!this.isElectron || !window.electronAPI) return;
    return window.electronAPI.closeProject();
  }

  // File Watching
  async startFileWatching(): Promise<void> {
    if (!this.isElectron || !window.electronAPI) return;
    return window.electronAPI.startFileWatching();
  }

  async stopFileWatching(): Promise<void> {
    if (!this.isElectron || !window.electronAPI) return;
    return window.electronAPI.stopFileWatching();
  }

  async setCurrentFile(filePath: string): Promise<void> {
    if (!this.isElectron || !window.electronAPI) return;
    return window.electronAPI.setCurrentFile(filePath);
  }

  async readFileBuffer(filePath: string): Promise<ArrayBuffer | null> {
    if (!this.isElectron || !window.electronAPI) return null;
    return window.electronAPI.readFileBuffer(filePath);
  }

  async writeFileBuffer(filePath: string, buffer: ArrayBuffer): Promise<void> {
    if (!this.isElectron || !window.electronAPI) return;
    return (window.electronAPI as any).writeFileBuffer(filePath, buffer);
  }

  // File storage (0studio commit storage)
  async saveCommitFile(filePath: string, commitId: string, buffer: ArrayBuffer): Promise<void> {
    if (!this.isElectron || !window.electronAPI) return;
    return (window.electronAPI as any).saveCommitFile(filePath, commitId, buffer);
  }

  async readCommitFile(filePath: string, commitId: string): Promise<ArrayBuffer | null> {
    if (!this.isElectron || !window.electronAPI) return null;
    return (window.electronAPI as any).readCommitFile(filePath, commitId);
  }

  async listCommitFiles(filePath: string): Promise<string[]> {
    if (!this.isElectron || !window.electronAPI) return [];
    return (window.electronAPI as any).listCommitFiles(filePath);
  }

  async commitFileExists(filePath: string, commitId: string): Promise<boolean> {
    if (!this.isElectron || !window.electronAPI) return false;
    return (window.electronAPI as any).commitFileExists(filePath, commitId);
  }

  // Tree file operations
  async saveTreeFile(filePath: string, treeData: any): Promise<void> {
    if (!this.isElectron || !window.electronAPI) return;
    return (window.electronAPI as any).saveTreeFile(filePath, treeData);
  }

  async loadTreeFile(filePath: string): Promise<any> {
    if (!this.isElectron || !window.electronAPI) return null;
    return (window.electronAPI as any).loadTreeFile(filePath);
  }

  async validateCommitFiles(filePath: string, commitIds: string[]): Promise<string[]> {
    if (!this.isElectron || !window.electronAPI) return [];
    return (window.electronAPI as any).validateCommitFiles(filePath, commitIds);
  }

  // Save file dialog
  async showSaveDialog(options?: { defaultPath?: string, filters?: { name: string, extensions: string[] }[] }): Promise<string | null> {
    if (!this.isElectron || !window.electronAPI) return null;
    return window.electronAPI.showSaveDialog(options || {});
  }

  // Event Listeners
  onProjectOpened(callback: (project: ProjectInfo) => void): (() => void) | undefined {
    if (!this.isElectron || !window.electronAPI) return undefined;
    return window.electronAPI.onProjectOpened(callback);
  }

  onProjectClosed(callback: () => void): (() => void) | undefined {
    if (!this.isElectron || !window.electronAPI) return undefined;
    return window.electronAPI.onProjectClosed(callback);
  }

  onFileChanged(callback: (event: FileChangeEvent) => void): (() => void) | undefined {
    if (!this.isElectron || !window.electronAPI) return undefined;
    return window.electronAPI.onFileChanged(callback);
  }

  onShowCommitDialog(callback: () => void): (() => void) | undefined {
    if (!this.isElectron || !window.electronAPI) return undefined;
    return window.electronAPI.onShowCommitDialog(callback);
  }

  onGitOperationComplete(callback: (operation: string) => void): (() => void) | undefined {
    if (!this.isElectron || !window.electronAPI) return undefined;
    return window.electronAPI.onGitOperationComplete(callback);
  }
}

// Create singleton instance
export const desktopAPI = new DesktopAPIService();

// Hook for React components
export const useDesktopAPI = () => {
  return desktopAPI;
};