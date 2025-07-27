const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const electron = require("electron");

/**
 * Cache Management Module for Teams for Linux
 * Addresses issue #1756: Daily logout due to cache overflow
 *
 * This module provides automatic cache cleanup to prevent OAuth token corruption
 * caused by Electron/Chromium cache growing too large (typically >500MB).
 */

class CacheManager {
  constructor(config) {
    this.config = config;
    this.userDataPath = electron.app.getPath("userData");
    this.maxCacheSize = config.maxCacheSizeMB || 300; // MB
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

  /**
   * Start the cache management monitoring
   */
  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    console.info("🧹 Cache Manager started", {
      maxSize: `${this.maxCacheSize}MB`,
      checkInterval: `${this.checkIntervalMs / 1000}s`,
    });

    // Initial check
    this.checkAndCleanCache();

    // Set up periodic checks
    this.intervalId = setInterval(() => {
      this.checkAndCleanCache();
    }, this.checkIntervalMs);
  }

  /**
   * Stop the cache management monitoring
   */
  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.info("🧹 Cache Manager stopped");
  }

  /**
   * Get the total size of the Teams for Linux cache directory
   */
  async getCacheSize() {
    try {
      const size = await this.getDirSize(this.userDataPath);
      return Math.round(size / (1024 * 1024)); // Convert to MB
    } catch (error) {
      console.error("Error calculating cache size:", error);
      return 0;
    }
  }

  /**
   * Check cache size and clean if necessary
   */
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
   * Clean the cache by removing non-essential files
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
      path.join(
        this.userDataPath,
        "Partitions",
        this.partitionName,
        "IndexedDB"
      ),
      path.join(
        this.userDataPath,
        "Partitions",
        this.partitionName,
        "WebStorage"
      ),

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

  /**
   * Clean a directory recursively
   */
  async cleanDirectory(dirPath) {
    try {
      const files = await fsp.readdir(dirPath);

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = await fsp.stat(filePath);

        if (stat.isDirectory()) {
          await this.cleanDirectory(filePath);
          // Try to remove empty directory
          try {
            await fsp.rmdir(filePath);
          } catch (error) {
            if (error.code === 'ENOTEMPTY') {
              console.debug("Directory not empty, skipping rmdir:", filePath);
            } else {
              console.warn("Failed to remove directory:", {
                path: filePath,
                error: error.message,
              });
            }
          }
        } else {
          await fsp.unlink(filePath);
        }
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
   * Get directory size recursively
   */
  async getDirSize(dirPath) {
    let totalSize = 0;
    try {
      const stat = await fsp.stat(dirPath);
      if (stat.isFile()) {
        return stat.size;
      }

      if (stat.isDirectory()) {
        const files = await fsp.readdir(dirPath);

        for (const file of files) {
          const filePath = path.join(dirPath, file);
          try {
            totalSize += await this.getDirSize(filePath);
          } catch (error) {
            // Skip files that can't be accessed (e.g., permission errors, broken symlinks)
            console.debug("Skipping inaccessible file:", {
              path: filePath,
              error: error.message,
            });
          }
        }
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        return 0; // Path does not exist, size is 0
      } else {
        console.debug("Error accessing path:", {
          path: dirPath,
          error: error.message,
        });
      }
    }

    return totalSize;
  }

  /**
   * Get cache statistics for debugging
   */
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
