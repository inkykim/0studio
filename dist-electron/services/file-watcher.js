import { watch, existsSync, statSync } from 'fs';
import { dirname, basename } from 'path';
export class FileWatcherService {
    constructor() {
        this.watcher = null;
        this.isWatching = false;
        this.watchedPath = null;
        this.debounceTimer = null;
        this.lastModified = 0;
    }
    /**
     * Watch a .3dm file for changes
     * Uses Node.js native fs.watch (no external dependencies)
     * @param filePath Path to the .3dm file to watch
     * @param callback Callback function to call when file changes
     */
    watch(filePath, callback) {
        if (this.isWatching) {
            this.stop();
        }
        if (!existsSync(filePath)) {
            callback('error', 'File does not exist');
            return;
        }
        this.watchedPath = filePath;
        // Get initial modification time
        try {
            this.lastModified = statSync(filePath).mtimeMs;
        }
        catch (e) {
            this.lastModified = 0;
        }
        try {
            // Watch the directory containing the file (more reliable on macOS)
            const dir = dirname(filePath);
            const filename = basename(filePath);
            this.watcher = watch(dir, { persistent: true }, (eventType, changedFile) => {
                // Only process events for our specific file
                if (changedFile !== filename) {
                    return;
                }
                // Debounce rapid events (wait for file write to complete)
                if (this.debounceTimer) {
                    clearTimeout(this.debounceTimer);
                }
                this.debounceTimer = setTimeout(() => {
                    // Check if file still exists
                    if (!existsSync(filePath)) {
                        callback('unlink', filePath);
                        return;
                    }
                    // Check if file was actually modified (avoid duplicate events)
                    try {
                        const currentModified = statSync(filePath).mtimeMs;
                        if (currentModified > this.lastModified) {
                            this.lastModified = currentModified;
                            callback('change', filePath);
                        }
                    }
                    catch {
                        // File might have been deleted during check
                        callback('error', 'File access error');
                    }
                }, 500); // 500ms debounce for file write completion
            });
            this.watcher.on('error', (error) => {
                callback('error', error instanceof Error ? error.message : String(error));
            });
            this.isWatching = true;
        }
        catch (error) {
            callback('error', error instanceof Error ? error.message : String(error));
        }
    }
    /**
     * Stop watching the current file
     */
    stop() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
            this.isWatching = false;
            this.watchedPath = null;
        }
    }
    /**
     * Check if currently watching a file
     */
    get watching() {
        return this.isWatching;
    }
    /**
     * Get list of watched paths
     */
    getWatchedPaths() {
        if (!this.watchedPath) {
            return [];
        }
        return [this.watchedPath];
    }
}
