import { join, dirname, basename, extname } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { readFile, writeFile, mkdir } from 'fs/promises';

/**
 * Service for managing 0studio commit storage folders
 * Creates a 0studio folder in the same directory as the .3dm file
 * with a subfolder for each file to store commit versions
 */
export class FileStorageService {
  /**
   * Get the 0studio folder path for a given file
   * @param filePath Path to the .3dm file
   * @returns Path to the file's commit folder (e.g., /path/to/0studio/filename)
   */
  getStorageFolderPath(filePath: string): string {
    const dir = dirname(filePath);
    const fileName = basename(filePath, extname(filePath));
    // Create structure: /path/to/0studio/filename/
    return join(dir, '0studio', fileName);
  }

  /**
   * Ensure the 0studio folder exists, create it if it doesn't
   * @param filePath Path to the .3dm file
   */
  async ensureStorageFolder(filePath: string): Promise<void> {
    const folderPath = this.getStorageFolderPath(filePath);
    if (!existsSync(folderPath)) {
      await mkdir(folderPath, { recursive: true });
      console.log(`Created 0studio storage folder: ${folderPath}`);
    }
  }

  /**
   * Get the commit file path for a given commit ID
   * @param filePath Path to the .3dm file
   * @param commitId Commit ID
   * @returns Path to the commit file (e.g., /path/to/0studio/filename/commit-1234567890.3dm)
   */
  getCommitFilePath(filePath: string, commitId: string): string {
    const folderPath = this.getStorageFolderPath(filePath);
    return join(folderPath, `commit-${commitId}.3dm`);
  }

  /**
   * Save a commit file to the 0studio folder
   * @param filePath Path to the .3dm file
   * @param commitId Commit ID
   * @param fileBuffer File buffer to save
   */
  async saveCommitFile(filePath: string, commitId: string, fileBuffer: ArrayBuffer): Promise<void> {
    await this.ensureStorageFolder(filePath);
    const commitFilePath = this.getCommitFilePath(filePath, commitId);
    const nodeBuffer = Buffer.from(fileBuffer);
    await writeFile(commitFilePath, nodeBuffer);
    console.log(`Saved commit file: ${commitFilePath} (${fileBuffer.byteLength} bytes)`);
  }

  /**
   * Read a commit file from the 0studio folder
   * @param filePath Path to the .3dm file
   * @param commitId Commit ID
   * @returns File buffer or null if not found
   */
  async readCommitFile(filePath: string, commitId: string): Promise<ArrayBuffer | null> {
    const commitFilePath = this.getCommitFilePath(filePath, commitId);
    
    if (!existsSync(commitFilePath)) {
      console.log(`Commit file not found: ${commitFilePath}`);
      return null;
    }

    const buffer = await readFile(commitFilePath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    console.log(`Read commit file: ${commitFilePath} (${arrayBuffer.byteLength} bytes)`);
    return arrayBuffer;
  }

  /**
   * List all commit files in the 0studio folder
   * @param filePath Path to the .3dm file
   * @returns Array of commit IDs found in the folder
   */
  async listCommitFiles(filePath: string): Promise<string[]> {
    const folderPath = this.getStorageFolderPath(filePath);
    
    if (!existsSync(folderPath)) {
      return [];
    }

    const files = readdirSync(folderPath);
    const commitIds: string[] = [];
    
    for (const file of files) {
      if (file.startsWith('commit-') && file.endsWith('.3dm')) {
        // Extract commit ID from filename: commit-1234567890.3dm -> 1234567890
        const commitId = file.slice(7, -5); // Remove 'commit-' prefix and '.3dm' suffix
        commitIds.push(commitId);
      }
    }

    return commitIds;
  }

  /**
   * Check if a commit file exists
   * @param filePath Path to the .3dm file
   * @param commitId Commit ID
   * @returns True if the commit file exists
   */
  commitFileExists(filePath: string, commitId: string): boolean {
    const commitFilePath = this.getCommitFilePath(filePath, commitId);
    return existsSync(commitFilePath);
  }
}
