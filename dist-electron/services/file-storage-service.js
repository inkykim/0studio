import { join, dirname, basename, extname } from 'path';
import { existsSync, readdirSync } from 'fs';
import { readFile, writeFile, mkdir } from 'fs/promises';
/**
 * Service for managing 0studio commit storage folders
 * Creates a folder next to the .3dm file and stores commit versions there
 */
export class FileStorageService {
    /**
     * Get the 0studio folder path for a given file
     * @param filePath Path to the .3dm file
     * @returns Path to the 0studio folder (e.g., /path/to/0studio_filename)
     */
    getStorageFolderPath(filePath) {
        const dir = dirname(filePath);
        const fileName = basename(filePath, extname(filePath));
        return join(dir, `0studio_${fileName}`);
    }
    /**
     * Ensure the 0studio folder exists, create it if it doesn't
     * @param filePath Path to the .3dm file
     */
    async ensureStorageFolder(filePath) {
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
     * @returns Path to the commit file (e.g., /path/to/0studio_filename/commit-1234567890.3dm)
     */
    getCommitFilePath(filePath, commitId) {
        const folderPath = this.getStorageFolderPath(filePath);
        return join(folderPath, `commit-${commitId}.3dm`);
    }
    /**
     * Save a commit file to the 0studio folder
     * @param filePath Path to the .3dm file
     * @param commitId Commit ID
     * @param fileBuffer File buffer to save
     */
    async saveCommitFile(filePath, commitId, fileBuffer) {
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
    async readCommitFile(filePath, commitId) {
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
    async listCommitFiles(filePath) {
        const folderPath = this.getStorageFolderPath(filePath);
        if (!existsSync(folderPath)) {
            return [];
        }
        const files = readdirSync(folderPath);
        const commitIds = [];
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
    commitFileExists(filePath, commitId) {
        const commitFilePath = this.getCommitFilePath(filePath, commitId);
        return existsSync(commitFilePath);
    }
}
