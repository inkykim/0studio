import { join, dirname, basename, extname } from 'path';
import { existsSync, statSync, copyFileSync, mkdirSync } from 'fs';
import { GitService } from './git-service.js';

export interface ProjectInfo {
  filePath: string;
  fileName: string;
  projectDir: string;
  size: number;
  lastModified: Date;
  isGitRepo: boolean;
}

export class ProjectService {
  private gitService: GitService | null = null;

  /**
   * Open a .3dm file as a project
   */
  async openProject(filePath: string): Promise<ProjectInfo> {
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    if (extname(filePath).toLowerCase() !== '.3dm') {
      throw new Error(`Invalid file type. Expected .3dm file, got: ${extname(filePath)}`);
    }

    const stats = statSync(filePath);
    const projectDir = dirname(filePath);
    const fileName = basename(filePath);

    // Initialize git service for this project
    this.gitService = new GitService(projectDir);
    const isGitRepo = await this.gitService.isRepo();

    const projectInfo: ProjectInfo = {
      filePath,
      fileName,
      projectDir,
      size: stats.size,
      lastModified: stats.mtime,
      isGitRepo
    };

    console.log('Project opened:', projectInfo);
    return projectInfo;
  }

  /**
   * Initialize a new Git repository for the current project
   */
  async initializeRepository(projectPath?: string): Promise<void> {
    if (!this.gitService && projectPath) {
      this.gitService = new GitService(dirname(projectPath));
    }

    if (!this.gitService) {
      throw new Error('No project is currently open');
    }

    await this.gitService.init();
  }

  /**
   * Create a backup of the .3dm file before any operations
   */
  createBackup(filePath: string): string {
    const dir = dirname(filePath);
    const name = basename(filePath, '.3dm');
    const backupDir = join(dir, '.rhinostudio', 'backups');
    
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = join(backupDir, `${name}_${timestamp}.3dm`);
    
    copyFileSync(filePath, backupPath);
    console.log(`Backup created: ${backupPath}`);
    
    return backupPath;
  }

  /**
   * Get project statistics and metadata
   */
  getProjectStats(filePath: string): {
    size: string;
    lastModified: string;
    isGitTracked: boolean;
  } {
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const stats = statSync(filePath);
    const size = this.formatFileSize(stats.size);
    const lastModified = stats.mtime.toLocaleString();
    
    // Check if file is git tracked (simplified check)
    const isGitTracked = existsSync(join(dirname(filePath), '.git'));

    return {
      size,
      lastModified,
      isGitTracked
    };
  }

  /**
   * Format file size in human readable format
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get the git service instance
   */
  getGitService(): GitService | null {
    return this.gitService;
  }

  /**
   * Close the current project
   */
  closeProject(): void {
    this.gitService = null;
    console.log('Project closed');
  }

  /**
   * Validate that a file is a valid .3dm file
   */
  validateRhinoFile(filePath: string): boolean {
    if (!existsSync(filePath)) {
      return false;
    }

    // Basic validation - check extension and that file exists
    const ext = extname(filePath).toLowerCase();
    if (ext !== '.3dm') {
      return false;
    }

    // Additional validation could be added here
    // such as checking file headers or using rhino3dm to validate
    const stats = statSync(filePath);
    return stats.size > 0;
  }

  /**
   * Get list of recent projects
   */
  getRecentProjects(): string[] {
    // This would typically be stored in user preferences
    // For now, return an empty array
    return [];
  }

  /**
   * Add project to recent projects list
   */
  addToRecentProjects(filePath: string): void {
    // This would typically update user preferences
    // Implementation depends on how you want to store preferences
    console.log(`Added to recent projects: ${filePath}`);
  }
}