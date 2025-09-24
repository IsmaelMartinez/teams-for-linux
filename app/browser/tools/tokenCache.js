// Teams Token Cache Bridge
// v2.5.9: Simplified secure storage implementation using Electron safeStorage API
// Addresses issue #1357 - Authentication refresh fails due to missing _tokenCache interface

const { safeStorage } = require('electron');

/**
 * TeamsTokenCache - Simplified localStorage-compatible token cache with secure storage
 * 
 * This class implements the Storage interface expected by Teams authentication provider
 * with optional secure storage using Electron's safeStorage API.
 * 
 * Key Features:
 * - Direct localStorage compatibility (getItem, setItem, removeItem, clear)
 * - Optional OS-level encryption using Electron safeStorage
 * - Natural transition: new tokens use secure storage, existing via fallback
 * - Graceful fallback to localStorage if secure storage unavailable
 * - Teams token pattern recognition and validation
 * - Simple error handling with memory fallback
 */

class TeamsTokenCache {
  constructor() {
    this._isAvailable = this._checkLocalStorageAvailability();
    this._memoryFallback = new Map();
    this._useMemoryFallback = false;
    
    // Secure storage setup
    this._useSecureStorage = false;
    this._securePrefix = 'secure_teams_';
    
    // Refresh scheduling setup
    this._refreshTimer = null;
    this._refreshInterval = 60 * 60 * 1000; // Default 1 hour
    this._refreshEnabled = false;
    
    this._initializeSecureStorage();
    
    console.debug('[TOKEN_CACHE] TokenCache initialized', {
      localStorage: this._isAvailable,
      secureStorage: this._useSecureStorage,
      refreshEnabled: this._refreshEnabled,
      refreshInterval: this._refreshInterval / 1000 / 60 + ' minutes'
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
  async getItem(key) {
    try {
      if (typeof key !== 'string') {
        console.warn('[TOKEN_CACHE] Invalid key type:', typeof key);
        return null;
      }

      // Try secure storage first if available
      if (this._useSecureStorage) {
        const secureValue = await this._getSecureItem(key);
        if (secureValue !== null) {
          return secureValue;
        }
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
  async setItem(key, value) {
    try {
      if (typeof key !== 'string' || typeof value !== 'string') {
        throw new TypeError('Key and value must be strings');
      }

      // Try secure storage first if available
      if (this._useSecureStorage) {
        const stored = await this._setSecureItem(key, value);
        if (stored) {
          return;
        }
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
  async removeItem(key) {
    try {
      if (typeof key !== 'string') {
        return;
      }

      // Remove from secure storage if available
      if (this._useSecureStorage) {
        await this._removeSecureItem(key);
      }
      
      // Also remove from localStorage/memory (cleanup)
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
  async clear() {
    try {
      const authKeys = this._getAuthRelatedKeys();
      
      for (const key of authKeys) {
        await this.removeItem(key);
      }
      
      console.debug(`[TOKEN_CACHE] Cleared ${authKeys.length} auth keys`);
    } catch (error) {
      console.error('[TOKEN_CACHE] clear failed:', error.message);
    }
  }

  //
  // Token Refresh Scheduling
  //

  /**
   * Start the token refresh scheduler
   * @param {Function} refreshCallback - Function to call for token refresh
   * @param {number} intervalHours - Refresh interval in hours (1-24)
   */
  startRefreshScheduler(refreshCallback, intervalHours = 1) {
    try {
      // Validate parameters
      if (typeof refreshCallback !== 'function') {
        throw new TypeError('refreshCallback must be a function');
      }

      if (typeof intervalHours !== 'number' || intervalHours < 1 || intervalHours > 24) {
        throw new RangeError('intervalHours must be between 1 and 24');
      }

      // Stop existing scheduler if running
      this.stopRefreshScheduler();

      // Calculate interval in milliseconds
      this._refreshInterval = intervalHours * 60 * 60 * 1000;
      this._refreshEnabled = true;

      console.debug(`[TOKEN_CACHE] Starting refresh scheduler (${intervalHours} hours)`);

      // Set up the interval timer
      this._refreshTimer = setInterval(async () => {
        try {
          console.debug('[TOKEN_CACHE] Scheduled token refresh triggered');
          await refreshCallback();
        } catch (error) {
          console.error('[TOKEN_CACHE] Scheduled token refresh failed:', error);
        }
      }, this._refreshInterval);

      return true;

    } catch (error) {
      console.error('[TOKEN_CACHE] Failed to start refresh scheduler:', error);
      this._refreshEnabled = false;
      return false;
    }
  }

  /**
   * Stop the token refresh scheduler and clean up timers
   */
  stopRefreshScheduler() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
      console.debug('[TOKEN_CACHE] Refresh scheduler stopped');
    }
    this._refreshEnabled = false;
  }

  /**
   * Get refresh scheduler status
   * @returns {object} Current scheduler status
   */
  getRefreshSchedulerStatus() {
    return {
      enabled: this._refreshEnabled,
      intervalMs: this._refreshInterval,
      intervalHours: this._refreshInterval / (60 * 60 * 1000),
      isRunning: this._refreshTimer !== null
    };
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
      
      return {
        totalKeys: authKeys.length,
        authKeysCount: authKeys.length,
        refreshTokenCount: refreshTokens.length,
        msalTokenCount: msalKeys.length,
        storageType: this._useSecureStorage ? 'secure' : (this._useMemoryFallback ? 'memory' : 'localStorage'),
        refreshScheduler: this.getRefreshSchedulerStatus()
      };
    } catch (error) {
      console.warn('[TOKEN_CACHE] Failed to get cache stats:', error.message);
      return {
        totalKeys: 0,
        authKeysCount: 0,
        refreshTokenCount: 0,
        msalTokenCount: 0,
        storageType: 'unknown',
        refreshScheduler: { enabled: false, isRunning: false },
        error: error.message
      };
    }
  }

  //
  // Private Implementation Methods
  //


  /**
   * Initialize secure storage
   * @private
   */
  _initializeSecureStorage() {
    try {
      this._useSecureStorage = safeStorage && safeStorage.isEncryptionAvailable();
      console.debug('[TOKEN_CACHE] Secure storage', this._useSecureStorage ? 'available' : 'not available');
      
    } catch (error) {
      console.warn('[TOKEN_CACHE] Secure storage initialization failed:', error.message);
      this._useSecureStorage = false;
    }
  }


  /**
   * Get item from secure storage
   * @private
   */
  async _getSecureItem(key) {
    try {
      const encryptedData = localStorage.getItem(this._securePrefix + key);
      if (!encryptedData) {
        return null;
      }
      
      const encryptedBuffer = Buffer.from(encryptedData, 'base64');
      return safeStorage.decryptString(encryptedBuffer);
    } catch (error) {
      console.warn(`[TOKEN_CACHE] Secure getItem failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Set item in secure storage
   * @private
   */
  async _setSecureItem(key, value) {
    try {
      const encrypted = safeStorage.encryptString(value);
      localStorage.setItem(this._securePrefix + key, encrypted.toString('base64'));
      return true;
    } catch (error) {
      console.warn(`[TOKEN_CACHE] Secure setItem failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Remove item from secure storage
   * @private
   */
  async _removeSecureItem(key) {
    try {
      localStorage.removeItem(this._securePrefix + key);
    } catch (error) {
      console.warn(`[TOKEN_CACHE] Secure removeItem failed: ${error.message}`);
    }
  }

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
      console.warn('[TOKEN_CACHE] Failed to get auth keys:', error.message);
    }
    
    return authKeys;
  }

  /**
   * Check if a key is authentication-related
   * @private
   */
  _isAuthRelatedKey(key) {
    if (typeof key !== 'string') return false;
    
    // Teams authentication patterns from research
    const authPatterns = [
      'tmp.auth.v1.',
      'refresh_token',
      'msal.token',
      'EncryptionKey',
      'authSessionId',
      'LogoutState',
      'accessToken',
      'idtoken',
      'Account',
      'Authority',
      'ClientInfo'
    ];
    
    return authPatterns.some(pattern => key.includes(pattern));
  }

  /**
   * Sanitize key for logging (remove PII)
   * @private
   */
  _sanitizeKey(key) {
    if (typeof key !== 'string') return '[INVALID_KEY]';
    
    // Hide UUIDs
    return key.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, 
      (match) => `${match.substr(0, 8)}...`);
  }
}

// Export singleton instance following established pattern
module.exports = new TeamsTokenCache();