import { app, session } from "electron";
import fs from "node:fs";
import path from "node:path";

/**
 * CacheManager handles automatic cache cleanup to prevent storage issues.
 * This helps avoid daily logout issues caused by excessive cache size.
 */
class CacheManager {
	/**
	 * @param {Object} options - Configuration options
	 * @param {number} options.maxCacheSizeMB - Maximum cache size in MB
	 * @param {number} options.cacheCheckIntervalMs - Check interval in milliseconds
	 * @param {string} options.partition - Session partition name
	 */
	constructor(options) {
		this.maxCacheSizeMB = options.maxCacheSizeMB || 600;
		this.cacheCheckIntervalMs = options.cacheCheckIntervalMs || 3600000;
		this.partition = options.partition || "persist:teams-4-linux";
		this.intervalId = null;
	}

	/**
	 * Start the cache manager
	 */
	start() {
		console.debug(`[CACHE] Starting cache manager with max size ${this.maxCacheSizeMB}MB`);
		
		// Run initial check
		this.checkCache();
		
		// Schedule periodic checks
		this.intervalId = setInterval(() => {
			this.checkCache();
		}, this.cacheCheckIntervalMs);
	}

	/**
	 * Stop the cache manager
	 */
	stop() {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
		console.debug("[CACHE] Cache manager stopped");
	}

	/**
	 * Check cache size and clean if necessary
	 */
	async checkCache() {
		try {
			const cachePath = this.getCachePath();
			const cacheSize = await this.getDirectorySize(cachePath);
			const cacheSizeMB = cacheSize / (1024 * 1024);

			console.debug(`[CACHE] Current cache size: ${cacheSizeMB.toFixed(2)}MB`);

			if (cacheSizeMB > this.maxCacheSizeMB) {
				console.info(`[CACHE] Cache size (${cacheSizeMB.toFixed(2)}MB) exceeds max (${this.maxCacheSizeMB}MB), clearing...`);
				await this.clearCache();
			}
		} catch (error) {
			console.error("[CACHE] Error checking cache:", error);
		}
	}

	/**
	 * Get the cache directory path
	 * @returns {string} Cache directory path
	 */
	getCachePath() {
		return path.join(app.getPath("userData"), "Cache");
	}

	/**
	 * Get the size of a directory recursively
	 * @param {string} dirPath - Directory path
	 * @returns {Promise<number>} Size in bytes
	 */
	async getDirectorySize(dirPath) {
		if (!fs.existsSync(dirPath)) {
			return 0;
		}

		let totalSize = 0;
		const files = fs.readdirSync(dirPath);

		for (const file of files) {
			const filePath = path.join(dirPath, file);
			const stats = fs.statSync(filePath);

			if (stats.isDirectory()) {
				totalSize += await this.getDirectorySize(filePath);
			} else {
				totalSize += stats.size;
			}
		}

		return totalSize;
	}

	/**
	 * Clear the session cache
	 */
	async clearCache() {
		try {
			const ses = session.fromPartition(this.partition);
			await ses.clearCache();
			console.info("[CACHE] Cache cleared successfully");
		} catch (error) {
			console.error("[CACHE] Error clearing cache:", error);
		}
	}
}

export default CacheManager;
