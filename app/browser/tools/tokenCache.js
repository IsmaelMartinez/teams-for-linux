// Teams Token Cache Bridge
// v2.5.6: Enhanced with secure storage backend using Electron safeStorage API
// Addresses issue #1357 - Authentication refresh fails due to missing _tokenCache interface
// Phase 2: OS-backed secure token storage with localStorage fallback

/**
 * TeamsTokenCache - localStorage-compatible token cache bridge for Teams authentication
 * 
 * This class implements the Storage interface expected by Teams authentication provider
 * while providing Teams-specific token management and validation capabilities.
 * 
 * Key Features:
 * - Direct localStorage compatibility (getItem, setItem, removeItem, clear)
 * - Teams token pattern recognition (tmp.auth.v1.*, UUID-based tokens)
 * - MSAL token support (msal.* keys)
 * - PII-safe logging with sanitization
 * - Token validation and expiry checking
 * - Graceful error handling with memory fallback
 */

class TeamsTokenCache {
  constructor() {
    this._isAvailable = this._checkLocalStorageAvailability();
    this._memoryFallback = new Map();
    this._useMemoryFallback = false;
    this._auditLog = [];
    
    // Initialize secure storage components
    this._secureStorage = null;
    this._tokenMigration = null;
    this._useSecureStorage = false;
    this._migrationCompleted = false;
    
    // Initialize storage backend (async)
    this._initializeStorageBackend().catch(error => {
      console.error('[TOKEN_CACHE] Storage backend initialization failed:', error.message);
    });
    
    console.debug('[TOKEN_CACHE] TokenCache initialized', {
      available: this._isAvailable,
      memoryFallback: this._useMemoryFallback,
      secureStorage: this._useSecureStorage,
      migrationCompleted: this._migrationCompleted,
      initialStats: this._getCacheStats()
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
        this._logOperation('GET_ERROR', '[INVALID_KEY_TYPE]', null, { error: 'Non-string key' });
        return null;
      }

      let value;
      
      // Try secure storage first if available
      if (this._useSecureStorage && this._secureStorage) {
        try {
          value = await this._secureStorage.getItem(key);
          if (value) {
            this._logOperation('GET_SECURE', key, value);
            return value;
          }
        } catch (secureError) {
          console.warn(`[TOKEN_CACHE] Secure storage getItem failed: ${secureError.message}`);
        }
      }
      
      // Fallback to localStorage or memory
      if (this._useMemoryFallback) {
        value = this._memoryFallback.get(key) || null;
      } else {
        value = localStorage.getItem(key);
      }

      this._logOperation('GET_FALLBACK', key, value);
      return value;
    } catch (error) {
      this._handleStorageError(error, 'getItem', key);
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
        const error = new TypeError('Key and value must be strings');
        this._logError(error, 'setItem', key);
        throw error;
      }

      let storedSecurely = false;
      
      // Try secure storage first if available
      if (this._useSecureStorage && this._secureStorage) {
        try {
          await this._secureStorage.setItem(key, value);
          storedSecurely = true;
          this._logOperation('SET_SECURE', key, value);
        } catch (secureError) {
          console.warn(`[TOKEN_CACHE] Secure storage setItem failed: ${secureError.message}`);
        }
      }
      
      // Fallback to localStorage/memory if secure storage failed or unavailable
      if (!storedSecurely) {
        if (this._useMemoryFallback) {
          this._memoryFallback.set(key, value);
        } else {
          localStorage.setItem(key, value);
        }
        this._logOperation('SET_FALLBACK', key, value);
      }

    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        this._handleQuotaError(key, value);
      } else {
        this._handleStorageError(error, 'setItem', key);
      }
      throw error;
    }
  }

  /**
   * Remove item from cache
   * @param {string} key - The cache key to remove
   */
  async removeItem(key) {
    try {
      if (typeof key !== 'string') {
        this._logOperation('REMOVE_ERROR', '[INVALID_KEY_TYPE]');
        return;
      }

      // Remove from secure storage if available
      if (this._useSecureStorage && this._secureStorage) {
        try {
          await this._secureStorage.removeItem(key);
          this._logOperation('REMOVE_SECURE', key);
        } catch (secureError) {
          console.warn(`[TOKEN_CACHE] Secure storage removeItem failed: ${secureError.message}`);
        }
      }
      
      // Also remove from localStorage/memory (migration cleanup)
      if (this._useMemoryFallback) {
        this._memoryFallback.delete(key);
      } else {
        localStorage.removeItem(key);
      }

      this._logOperation('REMOVE_FALLBACK', key);
    } catch (error) {
      this._handleStorageError(error, 'removeItem', key);
    }
  }

  /**
   * Clear authentication-related cache entries (selective clearing)
   * NOTE: Only clears auth-related keys, not entire localStorage
   */
  async clear() {
    try {
      const authKeys = await this._getAuthRelatedKeys();
      this._logOperation('CLEAR_START', `${authKeys.length} keys`);

      for (const key of authKeys) {
        try {
          await this.removeItem(key);
        } catch (error) {
          console.warn(`[TOKEN_CACHE] Failed to remove key during clear: ${this._sanitizeKey(key)}`, error.message);
        }
      }

      this._logOperation('CLEAR_COMPLETE', `${authKeys.length} keys`);
    } catch (error) {
      this._handleStorageError(error, 'clear');
    }
  }

  //
  // Storage Interface Compatibility Properties
  //

  /**
   * Get number of items in storage (localStorage compatibility)
   */
  get length() {
    try {
      if (this._useMemoryFallback) {
        return this._memoryFallback.size;
      }
      return localStorage.length;
    } catch (error) {
      this._handleStorageError(error, 'length');
      return 0;
    }
  }

  /**
   * Get key at index (localStorage compatibility)
   * @param {number} index - The index
   * @returns {string|null} The key at index or null
   */
  key(index) {
    try {
      if (this._useMemoryFallback) {
        const keys = Array.from(this._memoryFallback.keys());
        return keys[index] || null;
      }
      return localStorage.key(index);
    } catch (error) {
      this._handleStorageError(error, 'key');
      return null;
    }
  }

  //
  // Teams-Specific Token Management
  //

  /**
   * Check if a token is valid (not expired)
   * @param {string} key - The token key
   * @returns {boolean} True if token is valid
   */
  async isTokenValid(key) {
    try {
      const value = await this.getItem(key);
      if (!value) return false;

      // Try to parse token data for expiry
      try {
        const tokenData = JSON.parse(value);
        const expiryTime = tokenData.expiresOn || tokenData.expires_on || tokenData.exp;
        
        if (expiryTime) {
          const now = Date.now() / 1000; // Convert to seconds for comparison
          const expiry = typeof expiryTime === 'string' ? parseInt(expiryTime) : expiryTime;
          return expiry > now;
        }
        
        // If no expiry data, consider valid (some tokens don't have expiry)
        return true;
      } catch (parseError) {
        // If not JSON or unparseable, assume valid (could be non-JSON token)
        console.debug(`[TOKEN_CACHE] Token parse error for key ${this._sanitizeKey(key)}: ${parseError.message}`);
        return true;
      }
    } catch (error) {
      this._logError(error, 'isTokenValid', key);
      return false;
    }
  }

  /**
   * Get token expiry timestamp
   * @param {string} key - The token key
   * @returns {number|null} Expiry timestamp or null if not available
   */
  async getTokenExpiry(key) {
    try {
      const value = await this.getItem(key);
      if (!value) return null;

      try {
        const tokenData = JSON.parse(value);
        return tokenData.expiresOn || tokenData.expires_on || tokenData.exp || null;
      } catch {
        return null;
      }
    } catch (error) {
      this._logError(error, 'getTokenExpiry', key);
      return null;
    }
  }

  /**
   * Get all tokens for a specific user UUID
   * @param {string} uuid - The user UUID
   * @returns {string[]} Array of token keys for the user
   */
  async getUserTokens(uuid) {
    try {
      const allKeys = await this._getAllKeys();
      return allKeys.filter(key => 
        key.startsWith(`tmp.auth.v1.${uuid}.`) || 
        key.startsWith(`${uuid}.`)
      );
    } catch (error) {
      this._logError(error, 'getUserTokens');
      return [];
    }
  }

  /**
   * Get all global authentication tokens
   * @returns {string[]} Array of global token keys
   */
  async getGlobalTokens() {
    try {
      const allKeys = await this._getAllKeys();
      return allKeys.filter(key => key.startsWith('tmp.auth.v1.GLOBAL.'));
    } catch (error) {
      this._logError(error, 'getGlobalTokens');
      return [];
    }
  }

  /**
   * Get all refresh tokens
   * @returns {string[]} Array of refresh token keys
   */
  async getRefreshTokens() {
    try {
      const allKeys = await this._getAllKeys();
      return allKeys.filter(key => key.includes('.refresh_token'));
    } catch (error) {
      this._logError(error, 'getRefreshTokens');
      return [];
    }
  }

  /**
   * Validate cache integrity and health
   * @returns {boolean} True if cache is healthy
   */
  async validateCache() {
    try {
      const stats = await this._getCacheStats();
      const hasAuthTokens = stats.authKeysCount > 0;
      const hasRefreshTokens = stats.refreshTokenCount > 0;
      const storageAccessible = (this._useSecureStorage && this._secureStorage) || 
                                (this._isAvailable && !this._useMemoryFallback);

      this._logOperation('VALIDATE', 'cache health', null, {
        healthy: hasAuthTokens && storageAccessible,
        authTokens: hasAuthTokens,
        refreshTokens: hasRefreshTokens,
        storageAccessible,
        secureStorage: this._useSecureStorage
      });

      return hasAuthTokens && storageAccessible;
    } catch (error) {
      this._logError(error, 'validateCache');
      return false;
    }
  }

  /**
   * Get cache statistics for monitoring and debugging
   * @returns {Object} Cache statistics
   */
  async getCacheStats() {
    return await this._getCacheStats();
  }

  /**
   * Get storage backend information
   * @returns {Object} Storage backend details
   */
  getStorageInfo() {
    const info = {
      localStorage: this._isAvailable,
      memoryFallback: this._useMemoryFallback,
      secureStorage: this._useSecureStorage,
      migrationCompleted: this._migrationCompleted
    };
    
    if (this._secureStorage) {
      Object.assign(info, this._secureStorage.getStorageInfo());
    }
    
    return info;
  }

  /**
   * Trigger migration to secure storage if needed
   * @returns {Object} Migration results
   */
  async triggerMigration() {
    try {
      if (!this._tokenMigration) {
        throw new Error('Migration module not available');
      }
      
      const migrationNeeded = await this._tokenMigration.isMigrationNeeded();
      if (!migrationNeeded) {
        return { status: 'not_needed', message: 'Migration not required' };
      }
      
      const results = await this._tokenMigration.performMigration();
      
      // Update our state after successful migration
      if (results.status === 'completed') {
        this._migrationCompleted = true;
        this._useSecureStorage = true;
      }
      
      return results;
    } catch (error) {
      this._logError(error, 'triggerMigration');
      throw error;
    }
  }

  //
  // Private Implementation Methods
  //

  /**
   * Initialize storage backend (secure storage + migration)
   * @private
   */
  async _initializeStorageBackend() {
    try {
      // Initialize secure storage
      this._secureStorage = require('./secureTokenStorage');
      this._tokenMigration = require('./tokenMigration');
      
      // Check if secure storage is available
      this._useSecureStorage = this._secureStorage.isSecureStorageAvailable();
      
      // Check migration status
      this._migrationCompleted = this._tokenMigration.isMigrationComplete();
      
      // Perform migration if needed
      if (this._useSecureStorage && !this._migrationCompleted) {
        const migrationNeeded = await this._tokenMigration.isMigrationNeeded();
        if (migrationNeeded) {
          console.log('[TOKEN_CACHE] Performing automatic migration to secure storage...');
          try {
            const migrationResults = await this._tokenMigration.performMigration();
            if (migrationResults.status === 'completed') {
              this._migrationCompleted = true;
              console.log('[TOKEN_CACHE] Migration completed successfully');
            }
          } catch (migrationError) {
            console.error('[TOKEN_CACHE] Migration failed:', migrationError.message);
            // Continue with localStorage fallback
          }
        }
      }
      
      console.debug('[TOKEN_CACHE] Storage backend initialized', {
        secureStorage: this._useSecureStorage,
        migrationCompleted: this._migrationCompleted
      });
      
    } catch (error) {
      console.warn('[TOKEN_CACHE] Failed to initialize secure storage:', error.message);
      this._useSecureStorage = false;
    }
    
    // Initialize with current localStorage state validation
    this._validateInitialState();
  }

  /**
   * Check localStorage availability
   * @returns {boolean} True if localStorage is available
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
   * Validate initial cache state
   * @private
   */
  _validateInitialState() {
    if (!this._isAvailable) {
      console.warn('[TOKEN_CACHE] localStorage unavailable, using memory fallback');
      this._useMemoryFallback = true;
      return;
    }

    // Check for existing tokens
    const stats = this._getCacheStats();
    console.debug('[TOKEN_CACHE] Initial state:', stats);

    // If no auth tokens found, warn but continue
    if (stats.authKeysCount === 0) {
      console.warn('[TOKEN_CACHE] No authentication tokens found in initial state');
    }
  }

  /**
   * Get all authentication-related keys
   * @returns {string[]} Array of auth-related keys
   * @private
   */
  async _getAuthRelatedKeys() {
    const allKeys = await this._getAllKeys();
    const authPatterns = [
      /^tmp\.auth\.v1\./,              // Teams auth v1
      /^[0-9a-f-]{36}\..*\.refresh_token/, // Refresh tokens
      /^[0-9a-f-]{36}\..*\.idtoken/,   // ID tokens  
      /^msal\./                        // MSAL tokens
    ];

    return allKeys.filter(key => 
      authPatterns.some(pattern => pattern.test(key))
    );
  }

  /**
   * Get all available keys from current storage
   * @returns {string[]} Array of all keys
   * @private
   */
  async _getAllKeys() {
    let allKeys = [];
    
    // Get keys from secure storage if available
    if (this._useSecureStorage && this._secureStorage) {
      // Note: For now, secure storage doesn't expose all keys directly
      // This is a limitation we'll address in future versions
      // For now, we'll combine localStorage keys (for migration scenarios)
    }
    
    // Get keys from localStorage or memory fallback
    if (this._useMemoryFallback) {
      allKeys = Array.from(this._memoryFallback.keys());
    } else {
      allKeys = Object.keys(localStorage);
    }
    
    return allKeys;
  }

  /**
   * Get comprehensive cache statistics
   * @returns {Object} Detailed cache statistics
   * @private
   */
  async _getCacheStats() {
    const stats = {
      timestamp: new Date().toISOString(),
      storageType: this._useSecureStorage ? 'secure' : (this._useMemoryFallback ? 'memory' : 'localStorage'),
      available: this._isAvailable,
      secureStorageAvailable: this._useSecureStorage,
      migrationCompleted: this._migrationCompleted,
      totalKeys: 0,
      authKeysCount: 0,
      refreshTokenCount: 0,
      msalKeysCount: 0,
      userSpecificCount: 0,
      globalKeysCount: 0,
      averageKeyLength: 0,
      operationHistory: this._auditLog.length
    };

    try {
      const allKeys = await this._getAllKeys();
      stats.totalKeys = allKeys.length;

      let totalKeyLength = 0;

      allKeys.forEach(key => {
        totalKeyLength += key.length;

        if (key.startsWith('tmp.auth.v1.')) {
          stats.authKeysCount++;
          if (key.startsWith('tmp.auth.v1.GLOBAL.')) {
            stats.globalKeysCount++;
          } else {
            stats.userSpecificCount++;
          }
        } else if (key.includes('.refresh_token')) {
          stats.refreshTokenCount++;
        } else if (key.startsWith('msal.')) {
          stats.msalKeysCount++;
        } else if (/^[0-9a-f-]{36}/.test(key)) {
          stats.userSpecificCount++;
        }
      });

      stats.averageKeyLength = allKeys.length > 0 ? Math.round(totalKeyLength / allKeys.length) : 0;
      
      // Add secure storage specific stats if available
      if (this._secureStorage) {
        const secureInfo = this._secureStorage.getStorageInfo();
        stats.secureBackend = secureInfo.backend;
        stats.encryptionQuality = secureInfo.encryptionQuality;
      }
      
    } catch (error) {
      console.warn('[TOKEN_CACHE] Error calculating stats:', error.message);
    }

    return stats;
  }

  /**
   * Handle storage quota exceeded error
   * @param {string} key - The key being stored
   * @param {string} value - The value being stored
   * @private
   */
  async _handleQuotaError(key, value) {
    console.warn('[TOKEN_CACHE] Storage quota exceeded, attempting cleanup');
    
    try {
      // Clean expired tokens first
      await this._cleanExpiredTokens();
      
      // If using secure storage, try that first
      if (this._useSecureStorage && this._secureStorage) {
        try {
          await this._secureStorage.setItem(key, value);
          this._logOperation('QUOTA_RETRY_SECURE_SUCCESS', key, value);
          return;
        } catch (secureError) {
          console.warn('[TOKEN_CACHE] Secure storage also failed during quota retry');
        }
      }
      
      // Retry localStorage operation once
      localStorage.setItem(key, value);
      this._logOperation('QUOTA_RETRY_SUCCESS', key, value);
    } catch (retryError) {
      this._logError(retryError, 'quota retry failed', key);
      console.error('[TOKEN_CACHE] Quota error persists after cleanup');
      
      // Consider falling back to memory storage for this session
      console.warn('[TOKEN_CACHE] Switching to memory fallback due to quota issues');
      this._useMemoryFallback = true;
      this._memoryFallback.set(key, value);
    }
  }

  /**
   * Clean expired tokens to free storage space
   * @private
   */
  async _cleanExpiredTokens() {
    const authKeys = await this._getAuthRelatedKeys();
    let cleanedCount = 0;

    for (const key of authKeys) {
      try {
        const isValid = await this.isTokenValid(key);
        if (!isValid) {
          await this.removeItem(key);
          cleanedCount++;
        }
      } catch (error) {
        console.warn(`[TOKEN_CACHE] Failed to clean expired token: ${this._sanitizeKey(key)}`, error.message);
      }
    }

    console.debug(`[TOKEN_CACHE] Cleaned ${cleanedCount} expired tokens`);
  }

  /**
   * Handle storage errors gracefully
   * @param {Error} error - The error object
   * @param {string} operation - The operation that failed
   * @param {string} [key] - The key involved (optional)
   * @private
   */
  _handleStorageError(error, operation, key = null) {
    this._logError(error, operation, key);

    // Handle specific error types
    if (error.name === 'SecurityError') {
      console.warn('[TOKEN_CACHE] Security error (private browsing?), switching to memory fallback');
      this._useMemoryFallback = true;
    } else if (error.name === 'QuotaExceededError') {
      // Already handled in _handleQuotaError
      console.warn('[TOKEN_CACHE] Quota exceeded error');
    } else {
      console.warn(`[TOKEN_CACHE] Storage error in ${operation}:`, error.message);
    }
  }

  /**
   * Log cache operations with PII sanitization
   * @param {string} operation - The operation type
   * @param {string} key - The cache key
   * @param {string} [value] - The cache value (optional)
   * @param {Object} [metadata] - Additional metadata
   * @private
   */
  _logOperation(operation, key, value = null, metadata = {}) {
    const sanitizedKey = this._sanitizeKey(key);
    const sanitizedValue = value ? this._sanitizeValue(value) : null;

    const logEntry = {
      timestamp: new Date().toISOString(),
      operation,
      key: sanitizedKey,
      ...(sanitizedValue && { value: sanitizedValue }),
      ...metadata
    };

    const valueText = sanitizedValue ? ` => ${sanitizedValue}` : '';
    console.debug(`[TOKEN_CACHE] ${operation}: ${sanitizedKey}${valueText}`);

    // Add to audit log with size limit
    this._addToAuditLog(logEntry);
  }

  /**
   * Log errors with sanitized context
   * @param {Error} error - The error object
   * @param {string} context - The operation context
   * @param {string} [key] - The related key (optional)
   * @private
   */
  _logError(error, context, key = null) {
    const sanitizedKey = key ? this._sanitizeKey(key) : null;

    console.error(`[TOKEN_CACHE] ERROR in ${context}:`, {
      message: error.message,
      name: error.name,
      ...(sanitizedKey && { key: sanitizedKey }),
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Add entry to audit log with size management
   * @param {Object} logEntry - The log entry
   * @private
   */
  _addToAuditLog(logEntry) {
    // Keep last 1000 entries only
    if (this._auditLog.length >= 1000) {
      this._auditLog.shift();
    }
    this._auditLog.push(logEntry);
  }

  /**
   * Sanitize key for logging (remove PII)
   * @param {string} key - The key to sanitize
   * @returns {string} Sanitized key
   * @private
   */
  _sanitizeKey(key) {
    if (typeof key !== 'string') return '[INVALID_KEY_TYPE]';

    // Handle UUID patterns - show first 8 chars only
    let sanitized = key.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, 
      (match) => `${match.substr(0, 8)}...`);

    // Truncate very long keys
    if (sanitized.length > 200) {
      sanitized = `${sanitized.substr(0, 197)}...`;
    }

    return sanitized;
  }

  /**
   * Sanitize value for logging (never log actual content)
   * @param {string} value - The value to sanitize
   * @returns {string} Sanitized value metadata
   * @private
   */
  _sanitizeValue(value) {
    if (typeof value !== 'string') return '[INVALID_VALUE_TYPE]';
    if (!value) return '[EMPTY_VALUE]';

    const length = value.length;
    const type = this._detectTokenType(value);
    const hasExpiry = this._hasExpiryData(value);

    return `[${type}_TOKEN:${length}chars${hasExpiry ? ':HAS_EXPIRY' : ''}]`;
  }

  /**
   * Detect token type from value structure
   * @param {string} value - The token value
   * @returns {string} Token type identifier
   * @private
   */
  _detectTokenType(value) {
    if (value.startsWith('eyJ')) return 'JWT';
    if (value.startsWith('0.A')) return 'REFRESH';
    if (value.startsWith('{') && value.endsWith('}')) {
      try {
        const parsed = JSON.parse(value);
        if (parsed.accessToken) return 'TOKEN_BUNDLE';
        if (parsed.homeAccountId) return 'ACCOUNT';
        if (parsed.credentialType) return 'CREDENTIAL';
        return 'JSON';
      } catch {
        return 'MALFORMED_JSON';
      }
    }
    return 'UNKNOWN';
  }

  /**
   * Check if token value contains expiry information
   * @param {string} value - The token value
   * @returns {boolean} True if expiry data detected
   * @private
   */
  _hasExpiryData(value) {
    try {
      if (value.startsWith('{')) {
        const parsed = JSON.parse(value);
        return !!(parsed.expiresOn || parsed.expires_on || parsed.exp);
      }
      return false;
    } catch {
      return false;
    }
  }
}

// Export singleton instance following established pattern
module.exports = new TeamsTokenCache();