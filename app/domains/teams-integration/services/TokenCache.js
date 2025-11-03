// Teams Token Cache - ADR-002: localStorage-compatible interface with Electron safeStorage
// CRITICAL: Preserves exact encryption, storage, and retrieval logic from v2.x

const { safeStorage } = require('electron');

/**
 * TokenCache - localStorage-compatible interface with OS-level encryption
 * Implements Storage interface for Teams authentication provider
 */
class TokenCache {
  constructor(config, eventBus) {
    this._config = config;
    this._eventBus = eventBus;
    this._isAvailable = this._checkLocalStorageAvailability();
    this._memoryFallback = new Map();
    this._useMemoryFallback = false;
    this._useSecureStorage = false;
    this._securePrefix = 'secure_teams_';
    this._initializeSecureStorage();
    console.debug('[TOKEN_CACHE] TokenCache initialized', {
      localStorage: this._isAvailable,
      secureStorage: this._useSecureStorage
    });
  }

  async getItem(key) {
    try {
      if (typeof key !== 'string') {
        console.warn('[TOKEN_CACHE] Invalid key type:', typeof key);
        return null;
      }
      if (this._useSecureStorage) {
        const secureValue = await this._getSecureItem(key);
        if (secureValue !== null) return secureValue;
      }
      return this._useMemoryFallback ? this._memoryFallback.get(key) || null : localStorage.getItem(key);
    } catch (error) {
      console.warn(`[TOKEN_CACHE] getItem failed for key: ${this._sanitizeKey(key)}`, error.message);
      return null;
    }
  }

  async setItem(key, value) {
    try {
      if (typeof key !== 'string' || typeof value !== 'string') {
        throw new TypeError('Key and value must be strings');
      }
      if (this._useSecureStorage) {
        const stored = await this._setSecureItem(key, value);
        if (stored) return;
      }
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

  async removeItem(key) {
    try {
      if (typeof key !== 'string') return;
      if (this._useSecureStorage) await this._removeSecureItem(key);
      if (this._useMemoryFallback) {
        this._memoryFallback.delete(key);
      } else {
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.warn(`[TOKEN_CACHE] removeItem failed: ${error.message}`);
    }
  }

  async clear() {
    try {
      const authKeys = this._getAuthRelatedKeys();
      for (const key of authKeys) await this.removeItem(key);
      console.debug(`[TOKEN_CACHE] Cleared ${authKeys.length} auth keys`);
    } catch (error) {
      console.error('[TOKEN_CACHE] clear failed:', error.message);
    }
  }

  _initializeSecureStorage() {
    try {
      this._useSecureStorage = safeStorage && safeStorage.isEncryptionAvailable();
      console.debug('[TOKEN_CACHE] Secure storage', this._useSecureStorage ? 'available' : 'not available');
    } catch (error) {
      console.warn('[TOKEN_CACHE] Secure storage initialization failed:', error.message);
      this._useSecureStorage = false;
    }
  }

  async _getSecureItem(key) {
    try {
      const encryptedData = localStorage.getItem(this._securePrefix + key);
      if (!encryptedData) return null;
      const encryptedBuffer = Buffer.from(encryptedData, 'base64');
      return safeStorage.decryptString(encryptedBuffer);
    } catch (error) {
      console.warn(`[TOKEN_CACHE] Secure getItem failed: ${error.message}`);
      return null;
    }
  }

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

  async _removeSecureItem(key) {
    try {
      localStorage.removeItem(this._securePrefix + key);
    } catch (error) {
      console.warn(`[TOKEN_CACHE] Secure removeItem failed: ${error.message}`);
    }
  }

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

  _getAuthRelatedKeys() {
    const authKeys = [];
    try {
      if (this._useMemoryFallback) {
        for (const key of this._memoryFallback.keys()) {
          if (this._isAuthRelatedKey(key)) authKeys.push(key);
        }
      } else {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && this._isAuthRelatedKey(key)) authKeys.push(key);
        }
      }
    } catch (error) {
      console.warn('[TOKEN_CACHE] Failed to get auth keys:', error.message);
    }
    return authKeys;
  }

  _isAuthRelatedKey(key) {
    if (typeof key !== 'string') return false;
    const authPatterns = [
      'tmp.auth.v1.', 'refresh_token', 'msal.token', 'EncryptionKey',
      'authSessionId', 'LogoutState', 'accessToken', 'idtoken',
      'Account', 'Authority', 'ClientInfo'
    ];
    return authPatterns.some(pattern => key.includes(pattern));
  }

  _sanitizeKey(key) {
    if (typeof key !== 'string') return '[INVALID_KEY]';
    return key.replaceAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      (match) => `${match.substr(0, 8)}...`);
  }
}

module.exports = TokenCache;
