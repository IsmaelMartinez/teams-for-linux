// Teams Token Cache Bridge
// v2.5.6: Simplified secure storage implementation using Electron safeStorage API
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
 * - Automatic one-time migration from localStorage to secure storage
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
    this._migrationComplete = false;
    this._securePrefix = 'secure_teams_';
    this._migrationKey = 'teams_secure_migration_v1';
    
    this._initializeSecureStorage();
    
    console.debug('[TOKEN_CACHE] TokenCache initialized', {
      localStorage: this._isAvailable,
      secureStorage: this._useSecureStorage,
      migrated: this._migrationComplete
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
  // Storage Interface Compatibility Properties
  //

  get length() {
    try {
      if (this._useMemoryFallback) {
        return this._memoryFallback.size;
      }
      return localStorage.length;
    } catch (error) {
      console.warn('[TOKEN_CACHE] Failed to get storage length:', error.message);
      return 0;
    }
  }

  key(index) {
    try {
      if (this._useMemoryFallback) {
        const keys = Array.from(this._memoryFallback.keys());
        return keys[index] || null;
      }
      return localStorage.key(index);
    } catch (error) {
      console.warn('[TOKEN_CACHE] Failed to get key at index', index, ':', error.message);
      return null;
    }
  }

  //
  // Teams-Specific Token Management
  //

  /**
   * Check if a token is valid (not expired)
   */
  async isTokenValid(key) {
    try {
      const value = await this.getItem(key);
      if (!value) return false;

      try {
        const tokenData = JSON.parse(value);
        const expiryTime = tokenData.expiresOn || tokenData.expires_on || tokenData.exp;
        
        if (expiryTime) {
          const now = Date.now() / 1000;
          const expiry = typeof expiryTime === 'string' ? parseInt(expiryTime) : expiryTime;
          return expiry > now;
        }
        
        return true; // No expiry data, assume valid
      } catch {
        return true; // Non-JSON token, assume valid
      }
    } catch (error) {
      console.warn('[TOKEN_CACHE] Failed to validate token:', error.message);
      return false;
    }
  }

  /**
   * Get storage information for diagnostics
   */
  getStorageInfo() {
    return {
      localStorage: this._isAvailable,
      memoryFallback: this._useMemoryFallback,
      secureStorage: this._useSecureStorage,
      migrationComplete: this._migrationComplete,
      platform: process.platform,
      secureBackend: this._useSecureStorage ? 'electron-safeStorage' : 'none'
    };
  }

  //
  // Private Implementation Methods
  //

  /**
   * Initialize secure storage and perform migration if needed
   * @private
   */
  _initializeSecureStorage() {
    try {
      // Check if secure storage is available
      this._useSecureStorage = safeStorage && safeStorage.isEncryptionAvailable();
      
      if (!this._useSecureStorage) {
        console.debug('[TOKEN_CACHE] Secure storage not available');
        return;
      }

      // Check migration status
      this._migrationComplete = localStorage.getItem(this._migrationKey) === 'true';
      
      // Perform one-time migration if needed
      if (!this._migrationComplete) {
        this._performMigration();
      }
      
    } catch (error) {
      console.warn('[TOKEN_CACHE] Secure storage initialization failed:', error.message);
      this._useSecureStorage = false;
    }
  }

  /**
   * Perform simple one-time migration
   * @private
   */
  _performMigration() {
    try {
      const authKeys = this._getAuthRelatedKeys();
      if (authKeys.length === 0) {
        // No tokens to migrate
        localStorage.setItem(this._migrationKey, 'true');
        this._migrationComplete = true;
        return;
      }

      console.log(`[TOKEN_CACHE] Migrating ${authKeys.length} tokens to secure storage...`);
      let migratedCount = 0;

      authKeys.forEach(key => {
        try {
          const value = localStorage.getItem(key);
          if (value) {
            // Store in secure storage
            const encrypted = safeStorage.encryptString(value);
            localStorage.setItem(this._securePrefix + key, encrypted.toString('base64'));
            
            // Remove from localStorage
            localStorage.removeItem(key);
            migratedCount++;
          }
        } catch (error) {
          console.warn(`[TOKEN_CACHE] Failed to migrate key ${this._sanitizeKey(key)}: ${error.message}`);
        }
      });

      localStorage.setItem(this._migrationKey, 'true');
      this._migrationComplete = true;
      
      console.log(`[TOKEN_CACHE] Migration complete: ${migratedCount}/${authKeys.length} tokens migrated`);
      
    } catch (error) {
      console.error('[TOKEN_CACHE] Migration failed:', error.message);
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