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

export interface GitStatus {
  files: Array<{
    path: string;
    status: string;
    staged: boolean;
  }>;
  branch: string;
  ahead: number;
  behind: number;
  hasRemote: boolean;
}

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
  files?: string[];
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
    if (!this.isElectron) return null;
    return window.electronAPI.openProjectDialog();
  }

  async getCurrentProject(): Promise<ProjectInfo | null> {
    if (!this.isElectron) return null;
    return window.electronAPI.getCurrentProject();
  }

  async closeProject(): Promise<void> {
    if (!this.isElectron) return;
    return window.electronAPI.closeProject();
  }

  // Version Control
  async gitInit(projectPath: string): Promise<void> {
    if (!this.isElectron) return;
    return window.electronAPI.gitInit(projectPath);
  }

  async gitStatus(): Promise<GitStatus | null> {
    if (!this.isElectron) return null;
    try {
      return await window.electronAPI.gitStatus();
    } catch (error) {
      console.error('Git status error:', error);
      return null;
    }
  }

  async gitCommit(message: string, files: string[]): Promise<void> {
    if (!this.isElectron) return;
    return window.electronAPI.gitCommit(message, files);
  }

  async gitPush(): Promise<void> {
    if (!this.isElectron) return;
    return window.electronAPI.gitPush();
  }

  async gitPull(): Promise<void> {
    if (!this.isElectron) return;
    return window.electronAPI.gitPull();
  }

  async gitLog(): Promise<GitCommit[]> {
    if (!this.isElectron) return [];
    try {
      return await window.electronAPI.gitLog();
    } catch (error) {
      console.error('Git log error:', error);
      return [];
    }
  }

  async gitCheckout(commitHash: string): Promise<void> {
    if (!this.isElectron) return;
    return window.electronAPI.gitCheckout(commitHash);
  }

  // File Watching
  async startFileWatching(): Promise<void> {
    if (!this.isElectron) return;
    return window.electronAPI.startFileWatching();
  }

  async stopFileWatching(): Promise<void> {
    if (!this.isElectron) return;
    return window.electronAPI.stopFileWatching();
  }

  // Event Listeners
  onProjectOpened(callback: (project: ProjectInfo) => void): void {
    if (!this.isElectron) return;
    window.electronAPI.onProjectOpened(callback);
  }

  onProjectClosed(callback: () => void): void {
    if (!this.isElectron) return;
    window.electronAPI.onProjectClosed(callback);
  }

  onFileChanged(callback: (event: FileChangeEvent) => void): void {
    if (!this.isElectron) return;
    window.electronAPI.onFileChanged(callback);
  }

  onShowCommitDialog(callback: () => void): void {
    if (!this.isElectron) return;
    window.electronAPI.onShowCommitDialog(callback);
  }

  onGitOperationComplete(callback: (operation: string) => void): void {
    if (!this.isElectron) return;
    window.electronAPI.onGitOperationComplete(callback);
  }

  removeAllListeners(channel: string): void {
    if (!this.isElectron) return;
    window.electronAPI.removeAllListeners(channel);
  }
}

// Create singleton instance
export const desktopAPI = new DesktopAPIService();

// Hook for React components
export const useDesktopAPI = () => {
  return desktopAPI;
};