// Teams Token Cache Bridge
// Simplified secure storage implementation
// Addresses issue #1357 - Authentication refresh fails due to missing _tokenCache interface

// Note: safeStorage is only available in main process, not renderer/preload
// We use localStorage with optional fallback in renderer context

/**
 * TeamsTokenCache - Simplified localStorage-compatible token cache
 * 
 * This class implements the Storage interface expected by Teams authentication provider.
 * 
 * Key Features:
 * - Direct localStorage compatibility (getItem, setItem, removeItem, clear)
 * - Graceful fallback to memory if localStorage unavailable
 * - Teams token pattern recognition and validation
 * - Simple error handling with memory fallback
 */

class TeamsTokenCache {
	constructor() {
		this._isAvailable = this._checkLocalStorageAvailability();
		this._memoryFallback = new Map();
		this._useMemoryFallback = false;
		
		console.debug('[TOKEN_CACHE] TokenCache initialized', {
			localStorage: this._isAvailable
		});
	}

	//
	// Core Storage Interface (localStorage compatible)
	//

	/**
	 * Retrieve item from cache
	 * @param {string} key - The cache key
	 * @returns {string|null} The cached value or null if not found
	 */
	getItem(key) {
		try {
			if (typeof key !== 'string') {
				console.warn('[TOKEN_CACHE] Invalid key type:', typeof key);
				return null;
			}
			
			// Fallback to localStorage or memory
			if (this._useMemoryFallback) {
				return this._memoryFallback.get(key) || null;
			} else {
				return localStorage.getItem(key);
			}
		} catch (error) {
			console.warn(`[TOKEN_CACHE] getItem failed for key: ${this._sanitizeKey(key)}`, error.message);
			return null;
		}
	}

	/**
	 * Store item in cache
	 * @param {string} key - The cache key
	 * @param {string} value - The value to store
	 */
	setItem(key, value) {
		try {
			if (typeof key !== 'string' || typeof value !== 'string') {
				throw new TypeError('Key and value must be strings');
			}
			
			// Fallback to localStorage or memory
			if (this._useMemoryFallback) {
				this._memoryFallback.set(key, value);
			} else {
				localStorage.setItem(key, value);
			}
		} catch (error) {
			if (error.name === 'QuotaExceededError') {
				console.warn('[TOKEN_CACHE] Storage quota exceeded, switching to memory fallback');
				this._useMemoryFallback = true;
				this._memoryFallback.set(key, value);
			} else {
				console.error(`[TOKEN_CACHE] setItem failed: ${error.message}`);
				throw error;
			}
		}
	}

	/**
	 * Remove item from cache
	 * @param {string} key - The cache key to remove
	 */
	removeItem(key) {
		try {
			if (typeof key !== 'string') {
				return;
			}
			
			// Remove from localStorage/memory
			if (this._useMemoryFallback) {
				this._memoryFallback.delete(key);
			} else {
				localStorage.removeItem(key);
			}
		} catch (error) {
			console.warn(`[TOKEN_CACHE] removeItem failed: ${error.message}`);
		}
	}

	/**
	 * Clear authentication-related cache entries
	 */
	clear() {
		try {
			const authKeys = this._getAuthRelatedKeys();
			
			for (const key of authKeys) {
				this.removeItem(key);
			}
			
			console.debug(`[TOKEN_CACHE] Cleared ${authKeys.length} auth keys`);
		} catch (error) {
			console.error('[TOKEN_CACHE] clear failed:', error.message);
		}
	}

	//
	// Teams-Specific Token Management
	//

	/**
	 * Get cache statistics for diagnostics and injection validation
	 */
	getCacheStats() {
		try {
			const authKeys = this._getAuthRelatedKeys();
			const refreshTokens = authKeys.filter(key => key.includes('refresh_token'));
			const msalKeys = authKeys.filter(key => key.includes('msal.token'));
			
			let storageType;
			if (this._useMemoryFallback) {
				storageType = 'memory';
			} else {
				storageType = 'localStorage';
			}

			return {
				totalKeys: authKeys.length,
				authKeysCount: authKeys.length,
				refreshTokenCount: refreshTokens.length,
				msalTokenCount: msalKeys.length,
				storageType: storageType,
				storageInfo: {
					localStorage: this._isAvailable,
					memoryFallback: this._useMemoryFallback
				}
			};
		} catch (error) {
			console.warn('[TOKEN_CACHE] Failed to get cache stats:', error.message);
			return {
				totalKeys: 0,
				authKeysCount: 0,
				refreshTokenCount: 0,
				msalTokenCount: 0,
				storageType: 'unknown',
				error: error.message
			};
		}
	}

	//
	// Private Implementation Methods
	//

	/**
	 * Check localStorage availability
	 * @private
	 */
	_checkLocalStorageAvailability() {
		try {
			const testKey = '__token_cache_test__';
			localStorage.setItem(testKey, 'test');
			localStorage.removeItem(testKey);
			return true;
		} catch (error) {
			console.warn('[TOKEN_CACHE] localStorage unavailable:', error.message);
			return false;
		}
	}

	/**
	 * Sanitize key for logging
	 * @private
	 */
	_sanitizeKey(key) {
		if (typeof key !== 'string') return '[invalid]';
		return key.substring(0, 20) + (key.length > 20 ? '...' : '');
	}

	/**
	 * Check if key is authentication-related
	 * @private
	 */
	_isAuthRelatedKey(key) {
		const authPatterns = [
			'token', 'auth', 'msal', 'refresh', 'access',
			'id_token', 'credential', 'session'
		];
		const lowerKey = key.toLowerCase();
		return authPatterns.some(pattern => lowerKey.includes(pattern));
	}

	/**
	 * Get authentication-related keys from storage
	 * @private
	 */
	_getAuthRelatedKeys() {
		const authKeys = [];
		
		try {
			if (this._useMemoryFallback) {
				// Memory fallback: iterate through memory cache
				for (const key of this._memoryFallback.keys()) {
					if (this._isAuthRelatedKey(key)) {
						authKeys.push(key);
					}
				}
			} else {
				// localStorage: iterate through all keys
				for (let i = 0; i < localStorage.length; i++) {
					const key = localStorage.key(i);
					if (key && this._isAuthRelatedKey(key)) {
						authKeys.push(key);
					}
				}
			}
		} catch (error) {
			console.warn('[TOKEN_CACHE] Error getting auth keys:', error.message);
		}
		
		return authKeys;
	}
}

const tokenCache = new TeamsTokenCache();
export default tokenCache;
export { TeamsTokenCache };
