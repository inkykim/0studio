import simpleGit, { SimpleGit, StatusResult, LogResult, PullResult, PushResult } from 'simple-git';
import { join, basename } from 'path';
import { existsSync, writeFileSync } from 'fs';

export interface GitFileStatus {
  path: string;
  status: string;
  staged: boolean;
}

export interface GitCommitInfo {
  hash: string;
  message: string;
  author: string;
  date: string;
  files: string[];
}

export interface GitRepositoryStatus {
  files: GitFileStatus[];
  branch: string;
  ahead: number;
  behind: number;
  hasRemote: boolean;
}

export class GitService {
  private git: SimpleGit;
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.git = simpleGit(projectPath);
  }

  /**
   * Initialize a new Git repository in the project directory
   */
  async init(projectPath?: string): Promise<void> {
    const repoPath = projectPath || this.projectPath;
    
    if (!existsSync(join(repoPath, '.git'))) {
      await this.git.init();
      
      // Create initial .gitignore for Rhino projects
      const gitignorePath = join(repoPath, '.gitignore');
      const gitignoreContent = `
# Rhino backup files
*.3dmbak
*~$*.3dm

# macOS files
.DS_Store
.AppleDouble
.LSOverride

# Thumbnails
._*

# Files that might appear in the root of a volume
.DocumentRevisions-V100
.fseventsd
.Spotlight-V100
.TemporaryItems
.Trashes
.VolumeIcon.icns
.com.apple.timemachine.donotpresent

# Directories potentially created on remote AFP share
.AppleDB
.AppleDesktop
Network Trash Folder
Temporary Items
.apdisk

# Application specific
.rhinostudio/
node_modules/
dist/
`;
      writeFileSync(gitignorePath, gitignoreContent.trim());
      
      // Add initial files
      await this.git.add(['*.3dm', '.gitignore']);
      
      console.log(`Git repository initialized at: ${repoPath}`);
    }
  }

  /**
   * Get the current status of the repository
   */
  async getStatus(): Promise<GitRepositoryStatus> {
    try {
      const status: StatusResult = await this.git.status();
      const branch = status.current || 'main';
      
      // Check if there's a remote
      const remotes = await this.git.getRemotes(true);
      const hasRemote = remotes.length > 0;

      const files: GitFileStatus[] = [
        // Modified files
        ...status.modified.map(file => ({
          path: file,
          status: 'modified',
          staged: false
        })),
        // New files
        ...status.not_added.map(file => ({
          path: file,
          status: 'untracked',
          staged: false
        })),
        // Deleted files
        ...status.deleted.map(file => ({
          path: file,
          status: 'deleted',
          staged: false
        })),
        // Staged files
        ...status.staged.map(file => ({
          path: file,
          status: 'staged',
          staged: true
        }))
      ];

      return {
        files,
        branch,
        ahead: status.ahead,
        behind: status.behind,
        hasRemote
      };
    } catch (error) {
      console.error('Error getting git status:', error);
      throw error;
    }
  }

  /**
   * Stage files for commit
   */
  async addFiles(files: string[]): Promise<void> {
    try {
      await this.git.add(files);
    } catch (error) {
      console.error('Error staging files:', error);
      throw error;
    }
  }

  /**
   * Commit staged changes
   */
  async commit(message: string, files?: string[]): Promise<GitCommitInfo> {
    try {
      // Stage files if provided
      if (files && files.length > 0) {
        await this.git.add(files);
      }

      const result = await this.git.commit(message);
      
      // Get commit info
      const log = await this.git.log({ maxCount: 1 });
      const latestCommit = log.latest;
      
      if (!latestCommit) {
        throw new Error('Failed to retrieve commit information');
      }

      return {
        hash: latestCommit.hash,
        message: latestCommit.message,
        author: latestCommit.author_name,
        date: latestCommit.date,
        files: files || []
      };
    } catch (error) {
      console.error('Error committing changes:', error);
      throw error;
    }
  }

  /**
   * Get commit history
   */
  async getLog(maxCount = 50): Promise<GitCommitInfo[]> {
    try {
      const log: LogResult = await this.git.log({ maxCount });
      
      return log.all.map(commit => ({
        hash: commit.hash,
        message: commit.message,
        author: commit.author_name,
        date: commit.date,
        files: [] // Would need additional calls to get file list per commit
      }));
    } catch (error) {
      console.error('Error getting git log:', error);
      throw error;
    }
  }

  /**
   * Checkout a specific commit
   */
  async checkout(commitHash: string): Promise<void> {
    try {
      await this.git.checkout(commitHash);
    } catch (error) {
      console.error('Error checking out commit:', error);
      throw error;
    }
  }

  /**
   * Reset to a specific commit
   */
  async reset(commitHash: string, hard = false): Promise<void> {
    try {
      if (hard) {
        await this.git.reset(['--hard', commitHash]);
      } else {
        await this.git.reset([commitHash]);
      }
    } catch (error) {
      console.error('Error resetting to commit:', error);
      throw error;
    }
  }

  /**
   * Pull changes from remote
   */
  async pull(): Promise<PullResult> {
    try {
      return await this.git.pull();
    } catch (error) {
      console.error('Error pulling changes:', error);
      throw error;
    }
  }

  /**
   * Push changes to remote
   */
  async push(): Promise<PushResult> {
    try {
      return await this.git.push();
    } catch (error) {
      console.error('Error pushing changes:', error);
      throw error;
    }
  }

  /**
   * Add a remote repository
   */
  async addRemote(name: string, url: string): Promise<void> {
    try {
      await this.git.addRemote(name, url);
    } catch (error) {
      console.error('Error adding remote:', error);
      throw error;
    }
  }

  /**
   * Get list of remotes
   */
  async getRemotes(): Promise<Array<{ name: string; refs: { fetch: string; push: string } }>> {
    try {
      return await this.git.getRemotes(true);
    } catch (error) {
      console.error('Error getting remotes:', error);
      throw error;
    }
  }

  /**
   * Check if directory is a git repository
   */
  async isRepo(): Promise<boolean> {
    try {
      await this.git.status();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(): Promise<string> {
    try {
      return await this.git.revparse(['--abbrev-ref', 'HEAD']);
    } catch (error) {
      console.error('Error getting current branch:', error);
      return 'main';
    }
  }

  /**
   * Create and switch to a new branch
   */
  async createBranch(branchName: string, checkout = true): Promise<void> {
    try {
      if (checkout) {
        await this.git.checkoutLocalBranch(branchName);
      } else {
        await this.git.branch([branchName]);
      }
    } catch (error) {
      console.error('Error creating branch:', error);
      throw error;
    }
  }

  /**
   * Switch to an existing branch
   */
  async switchBranch(branchName: string): Promise<void> {
    try {
      await this.git.checkout(branchName);
    } catch (error) {
      console.error('Error switching branch:', error);
      throw error;
    }
  }

  /**
   * Get list of branches
   */
  async getBranches(): Promise<{ local: string[]; remote: string[] }> {
    try {
      const result = await this.git.branch(['-a']);
      const local = result.all.filter(branch => !branch.startsWith('remotes/'));
      const remote = result.all.filter(branch => branch.startsWith('remotes/'));
      
      return { local, remote };
    } catch (error) {
      console.error('Error getting branches:', error);
      throw error;
    }
  }
}