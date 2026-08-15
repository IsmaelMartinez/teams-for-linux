const fs = require("node:fs");
const fsp = require("node:fs").promises;
const path = require("node:path");
const electron = require("electron");

/**
 * Cache Management Module for Teams for Linux
 * Addresses issue #1756: Daily logout due to cache overflow
 *
 * This module provides automatic cache cleanup to prevent OAuth token corruption
 * caused by Electron/Chromium cache growing too large (typically >500MB).
 * 
 * IMPORTANT: Preserves IndexedDB and WebStorage to maintain Teams authentication
 * tokens and prevent 24-hour forced re-authentication cycles.
 */

// Directory scans and cleans process entries in fixed-size chunks rather than
// fanning out over a whole directory at once (libuv threadpool starvation).
// The chunk bounds concurrency per directory, not across the recursion: each
// subdirectory worker opens its own chunk, so the worst case is exponential in
// tree depth. Chromium cache trees are wide and shallow (the volume is files at
// the leaves, which is exactly what chunking parallelises), so in practice
// in-flight operations stay near the chunk size. Revisit with a shared
// semaphore if this ever runs over a deep tree.
const SCAN_CHUNK_SIZE = 32;

class CacheManager {
  constructor(config) {
    this.config = config;
    this.userDataPath = electron.app.getPath("userData");
    this.maxCacheSize = config.maxCacheSizeMB || 600; // MB
    this.checkIntervalMs = config.cacheCheckIntervalMs || 60 * 60 * 1000; // 1 hour
    this.isRunning = false;

    // Extract partition name from config (e.g., "persist:teams-4-linux" -> "teams-4-linux")
    this.partitionName = this.extractPartitionName(
      config.partition || "persist:teams-4-linux"
    );
  }

  /**
   * Extract the partition directory name from the partition string
   * @param {string} partition - The partition string like "persist:teams-4-linux"
   * @returns {string} - The directory name like "teams-4-linux"
   */
  extractPartitionName(partition) {
    // Remove "persist:" prefix if present
    return partition.replace(/^persist:/, "");
  }

  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    console.info("🧹 Cache Manager started", {
      maxSize: `${this.maxCacheSize}MB`,
      checkInterval: `${this.checkIntervalMs / 1000}s`,
    });

    this.checkAndCleanCache();

    this.intervalId = setInterval(() => {
      this.checkAndCleanCache();
    }, this.checkIntervalMs);
  }

  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.info("🧹 Cache Manager stopped");
  }

  async getCacheSize() {
    try {
      const size = await this.getDirSize(this.userDataPath);
      return Math.round(size / (1024 * 1024)); // Convert to MB
    } catch (error) {
      console.error("Error calculating cache size:", error);
      return 0;
    }
  }

  async checkAndCleanCache() {
    try {
      const currentSizeMB = await this.getCacheSize();

      console.debug("Cache size check", {
        currentSize: `${currentSizeMB}MB`,
        maxSize: `${this.maxCacheSize}MB`,
      });

      if (currentSizeMB > this.maxCacheSize) {
        console.warn("Cache size exceeded limit", {
          currentSize: `${currentSizeMB}MB`,
          maxSize: `${this.maxCacheSize}MB`,
        });

        await this.cleanCache();

        const newSizeMB = await this.getCacheSize();
        console.info("Cache cleanup completed", {
          oldSize: `${currentSizeMB}MB`,
          newSize: `${newSizeMB}MB`,
          freed: `${currentSizeMB - newSizeMB}MB`,
        });
      }
    } catch (error) {
      console.error("Error during cache check:", error);
    }
  }

  /**
   * Clean the cache by removing non-essential files while preserving authentication data
   */
  async cleanCache() {
    const cleanupPaths = [
      // Main cache directories
      path.join(this.userDataPath, "Cache"),
      path.join(this.userDataPath, "GPUCache"),
      path.join(this.userDataPath, "Code Cache"),

      // Partition-specific caches (using actual partition name from config)
      path.join(this.userDataPath, "Partitions", this.partitionName, "Cache"),
      path.join(
        this.userDataPath,
        "Partitions",
        this.partitionName,
        "GPUCache"
      ),
      path.join(
        this.userDataPath,
        "Partitions",
        this.partitionName,
        "Code Cache"
      ),
      // ✅ EXCLUDED: IndexedDB and WebStorage preserve Teams authentication tokens
      // Removing these directories was causing 24-hour re-authentication cycles
      // path.join(this.userDataPath, "Partitions", this.partitionName, "IndexedDB"),
      // path.join(this.userDataPath, "Partitions", this.partitionName, "WebStorage"),

      // Temporary files that can cause token corruption
      path.join(this.userDataPath, "DIPS-wal"),
      path.join(this.userDataPath, "SharedStorage-wal"),
      path.join(this.userDataPath, "Cookies-journal"),
    ];

    for (const cleanupPath of cleanupPaths) {
      try {
        const stat = await fsp.stat(cleanupPath);
        if (stat.isDirectory()) {
          await this.cleanDirectory(cleanupPath);
        } else {
          await fsp.unlink(cleanupPath);
          console.debug("Removed file:", cleanupPath);
        }
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.debug("Path does not exist, skipping:", cleanupPath);
        } else {
          console.warn("Failed to clean path:", {
            path: cleanupPath,
            error: error.message,
          });
        }
      }
    }
  }

  async cleanDirectory(dirPath) {
    try {
      const entries = await fsp.readdir(dirPath, { withFileTypes: true });

      const failureCodes = [];
      await this.#mapInChunks(entries, async (entry) => {
        try {
          await this.#cleanEntry(path.join(dirPath, entry.name), entry);
        } catch (error) {
          // ENOENT means the entry vanished mid-clean; routine cache churn
          if (error.code !== 'ENOENT') {
            failureCodes.push(error.code || 'UNKNOWN');
          }
        }
      });

      if (failureCodes.length > 0) {
        console.warn(`Failed to clean ${failureCodes.length} of ${entries.length} entries:`, {
          path: dirPath,
          errorCodes: [...new Set(failureCodes)],
        });
      }

      console.debug("Cleaned directory:", dirPath);
    } catch (error) {
      console.warn("Failed to clean directory:", {
        path: dirPath,
        error: error.message,
      });
    }
  }

  /**
   * Delete a single directory entry. Dirents report symlinks as
   * isSymbolicLink() without following them; fsp.stat (which follows links)
   * preserves the previous behaviour of traversing symlinked directories.
   */
  async #cleanEntry(filePath, entry) {
    let isDirectory = entry.isDirectory();
    if (entry.isSymbolicLink()) {
      isDirectory = (await fsp.stat(filePath)).isDirectory();
    }

    if (!isDirectory) {
      await fsp.unlink(filePath);
      return;
    }

    await this.cleanDirectory(filePath);
    try {
      await fsp.rmdir(filePath);
    } catch (error) {
      // A directory left non-empty (entries failed to delete or reappeared)
      // and rmdir refusing a symlinked directory path (ENOTDIR) are routine;
      // anything else counts toward the aggregate failure log.
      if (error.code !== 'ENOTEMPTY' && error.code !== 'ENOTDIR') {
        throw error;
      }
    }
  }

  /**
   * Run worker over items in fixed-size chunks: chunks run sequentially and
   * items within a chunk run concurrently via Promise.allSettled, so the
   * returned promise settles only after every worker has finished.
   */
  async #mapInChunks(items, worker) {
    const results = [];
    for (let index = 0; index < items.length; index += SCAN_CHUNK_SIZE) {
      const chunk = items.slice(index, index + SCAN_CHUNK_SIZE);
      results.push(...(await Promise.allSettled(chunk.map(worker))));
    }
    return results;
  }

  async getDirSize(dirPath) {
    let totalSize = 0;
    try {
      const stat = await fsp.stat(dirPath);
      if (stat.isFile()) {
        return stat.size;
      }

      if (stat.isDirectory()) {
        const entries = await fsp.readdir(dirPath, { withFileTypes: true });
        const results = await this.#mapInChunks(entries, (entry) =>
          this.#entrySize(path.join(dirPath, entry.name), entry)
        );
        for (const result of results) {
          if (result.status === 'fulfilled') {
            totalSize += result.value;
          }
        }
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        return 0; // Path does not exist, size is 0
      }
      console.debug("Error accessing path:", {
        path: dirPath,
        error: error.message,
      });
    }

    return totalSize;
  }

  /**
   * Size contribution of one directory entry. Directories and symlinks
   * recurse through getDirSize, whose top-level fsp.stat follows links,
   * matching the previous stat-per-entry behaviour (broken links resolve
   * to 0). ENOENT is silent: entries evicted mid-scan are routine churn.
   */
  async #entrySize(entryPath, entry) {
    if (entry.isDirectory() || entry.isSymbolicLink()) {
      return this.getDirSize(entryPath);
    }

    if (!entry.isFile()) {
      return 0; // sockets, FIFOs, etc. contributed no size before either
    }

    try {
      return (await fsp.stat(entryPath)).size;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.debug("Skipping inaccessible file:", {
          path: entryPath,
          error: error.message,
        });
      }
      return 0;
    }
  }

  async getCacheStats() {
    const stats = {
      totalSizeMB: await this.getCacheSize(),
      partitionName: this.partitionName,
      paths: {},
    };

    const checkPaths = [
      "Cache",
      "GPUCache",
      "Code Cache",
      "Partitions",
      "IndexedDB",
      "Local Storage",
      "Session Storage",
    ];

    for (const pathName of checkPaths) {
      const fullPath = path.join(this.userDataPath, pathName);
      if (fs.existsSync(fullPath)) {
        const sizeMB = Math.round(
          (await this.getDirSize(fullPath)) / (1024 * 1024)
        );
        stats.paths[pathName] = `${sizeMB}MB`;
      }
    }

    // Also check the specific partition directory
    const partitionPath = path.join(
      this.userDataPath,
      "Partitions",
      this.partitionName
    );
    if (fs.existsSync(partitionPath)) {
      const sizeMB = Math.round(
        (await this.getDirSize(partitionPath)) / (1024 * 1024)
      );
      stats.paths[`Partitions/${this.partitionName}`] = `${sizeMB}MB`;
    }

    return stats;
  }
}

module.exports = CacheManager;
