import chokidar from 'chokidar';
import { FSWatcher } from 'chokidar';

export class FileWatcherService {
  private watcher: FSWatcher | null = null;
  private isWatching = false;

  /**
   * Watch a .3dm file for changes
   * @param filePath Path to the .3dm file to watch
   * @param callback Callback function to call when file changes
   */
  watch(filePath: string, callback: (eventType: string, filename?: string) => void): void {
    if (this.isWatching) {
      this.stop();
    }

    console.log(`Starting to watch file: ${filePath}`);

    this.watcher = chokidar.watch(filePath, {
      // Options for watching
      persistent: true,
      usePolling: false, // Use native fs events when possible
      ignoreInitial: true, // Don't emit events for existing files
      awaitWriteFinish: {
        stabilityThreshold: 1000, // Wait 1 second after last change
        pollInterval: 100 // Check every 100ms
      }
    });

    this.watcher
      .on('change', (path) => {
        console.log(`File changed: ${path}`);
        callback('change', path);
      })
      .on('unlink', (path) => {
        console.log(`File deleted: ${path}`);
        callback('unlink', path);
      })
      .on('add', (path) => {
        console.log(`File added: ${path}`);
        callback('add', path);
      })
      .on('error', (error) => {
        console.error(`Watcher error: ${error}`);
        callback('error', error instanceof Error ? error.message : String(error));
      })
      .on('ready', () => {
        console.log(`File watcher ready for: ${filePath}`);
        this.isWatching = true;
      });
  }

  /**
   * Stop watching the current file
   */
  stop(): void {
    if (this.watcher) {
      console.log('Stopping file watcher');
      this.watcher.close();
      this.watcher = null;
      this.isWatching = false;
    }
  }

  /**
   * Check if currently watching a file
   */
  get watching(): boolean {
    return this.isWatching;
  }

  /**
   * Get list of watched paths
   */
  getWatchedPaths(): string[] {
    if (!this.watcher) {
      return [];
    }
    
    const watched = this.watcher.getWatched();
    const paths: string[] = [];
    
    for (const [dir, files] of Object.entries(watched)) {
      for (const file of files) {
        paths.push(`${dir}/${file}`);
      }
    }
    
    return paths;
  }
}