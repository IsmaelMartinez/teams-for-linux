/**
 * ESM utility functions
 * Provides __dirname and __filename equivalents for ES Modules
 */

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

/**
 * Get the directory name of the current module
 * @param {string} importMetaUrl - The import.meta.url of the calling module
 * @returns {string} The directory path
 */
export function getDirname(importMetaUrl) {
	return dirname(fileURLToPath(importMetaUrl));
}

/**
 * Get the file name of the current module
 * @param {string} importMetaUrl - The import.meta.url of the calling module
 * @returns {string} The file path
 */
export function getFilename(importMetaUrl) {
	return fileURLToPath(importMetaUrl);
}

