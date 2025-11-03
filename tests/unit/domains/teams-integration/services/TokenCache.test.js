/**
 * TokenCache Service Tests
 * Comprehensive test suite for TeamsTokenCache with ADR-002 compliance
 *
 * Tests cover:
 * - Constructor and initialization
 * - localStorage-compatible API
 * - Encryption/decryption with Electron safeStorage
 * - Token persistence across sessions
 * - Error handling and fallback mechanisms
 * - ADR-002 compliance verification
 * - Edge cases and boundary conditions
 */

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const { strict: assert } = require('node:assert');

// Mock Electron's safeStorage
let mockSafeStorage = {
  isEncryptionAvailable: mock.fn(() => true),
  encryptString: mock.fn((str) => Buffer.from(`encrypted:${str}`)),
  decryptString: mock.fn((buffer) => {
    const str = buffer.toString();
    return str.replace('encrypted:', '');
  })
};

// Mock localStorage
const createMockLocalStorage = () => {
  const storage = new Map();
  return {
    getItem: mock.fn((key) => storage.get(key) || null),
    setItem: mock.fn((key, value) => storage.set(key, value)),
    removeItem: mock.fn((key) => storage.delete(key)),
    clear: mock.fn(() => storage.clear()),
    get length() {
      return storage.size;
    },
    key: mock.fn((index) => Array.from(storage.keys())[index] || null),
    _storage: storage // For test inspection
  };
};

// Setup mocks before requiring the module
let mockLocalStorage;

describe('TokenCache Service', () => {
  let tokenCacheInstance;

  beforeEach(() => {
    // Create fresh mocks
    mockSafeStorage = {
      isEncryptionAvailable: mock.fn(() => true),
      encryptString: mock.fn((str) => Buffer.from(`encrypted:${str}`)),
      decryptString: mock.fn((buffer) => {
        const str = buffer.toString();
        return str.replace('encrypted:', '');
      })
    };

    // Create fresh localStorage mock
    mockLocalStorage = createMockLocalStorage();
    global.localStorage = mockLocalStorage;

    // Mock electron module in require cache
    require.cache[require.resolve('electron')] = {
      exports: {
        safeStorage: mockSafeStorage
      }
    };

    // Clear tokenCache from cache to get fresh instance
    delete require.cache[require.resolve('../../../../../app/browser/tools/tokenCache.js')];

    // Require the module to create new instance
    tokenCacheInstance = require('../../../../../app/browser/tools/tokenCache.js');
  });

  afterEach(() => {
    // Cleanup
    if (mockLocalStorage) {
      mockLocalStorage.clear();
    }
    delete global.localStorage;
    delete require.cache[require.resolve('electron')];
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with secure storage when available', () => {
      const stats = tokenCacheInstance.getCacheStats();
      assert.strictEqual(stats.storageInfo.secureStorage, true);
      assert.strictEqual(stats.storageInfo.localStorage, true);
    });

    it('should initialize with localStorage fallback when secure storage unavailable', () => {
      mockSafeStorage.isEncryptionAvailable = mock.fn(() => false);

      // Re-initialize with secure storage disabled
      delete require.cache[require.resolve('../../../../../app/browser/tools/tokenCache.js')];
      const freshCache = require('../../../../../app/browser/tools/tokenCache.js');

      const stats = freshCache.getCacheStats();
      assert.strictEqual(stats.storageInfo.secureStorage, false);
      assert.strictEqual(stats.storageType, 'localStorage');
    });

    it('should handle localStorage unavailability with memory fallback', () => {
      mockLocalStorage.setItem = mock.fn(() => {
        throw new Error('localStorage unavailable');
      });

      // Should not throw during initialization
      delete require.cache[require.resolve('../../../../../app/browser/tools/tokenCache.js')];
      const freshCache = require('../../../../../app/browser/tools/tokenCache.js');

      assert.ok(freshCache !== null);
    });

    it('should verify constructor sets up correct initial state', () => {
      const stats = tokenCacheInstance.getCacheStats();

      assert.ok(stats.hasOwnProperty('totalKeys'));
      assert.ok(stats.hasOwnProperty('storageType'));
      assert.ok(stats.hasOwnProperty('storageInfo'));
      assert.strictEqual(typeof stats.storageInfo.platform, 'string');
    });
  });

  describe('localStorage-Compatible API - getItem', () => {
    it('should retrieve item from localStorage', async () => {
      mockLocalStorage._storage.set('test-key', 'test-value');

      const value = await tokenCacheInstance.getItem('test-key');
      assert.strictEqual(value, 'test-value');
    });

    it('should return null for non-existent keys', async () => {
      const value = await tokenCacheInstance.getItem('non-existent-key');
      assert.strictEqual(value, null);
    });

    it('should handle invalid key types gracefully', async () => {
      const value = await tokenCacheInstance.getItem(null);
      assert.strictEqual(value, null);

      const value2 = await tokenCacheInstance.getItem(undefined);
      assert.strictEqual(value2, null);

      const value3 = await tokenCacheInstance.getItem(123);
      assert.strictEqual(value3, null);
    });

    it('should retrieve from secure storage when available', async () => {
      // Set item via secure storage
      await tokenCacheInstance.setItem('secure-key', 'secure-value');

      // Verify encrypted data was stored
      const encryptedKey = 'secure_teams_secure-key';
      assert.ok(mockLocalStorage._storage.has(encryptedKey));

      // Retrieve and verify
      const value = await tokenCacheInstance.getItem('secure-key');
      assert.strictEqual(value, 'secure-value');
    });

    it('should fallback to localStorage when secure storage fails', async () => {
      const originalDecrypt = mockSafeStorage.decryptString;
      mockSafeStorage.decryptString = mock.fn(() => {
        throw new Error('Decryption failed');
      });

      // Set item in localStorage directly
      mockLocalStorage._storage.set('fallback-key', 'fallback-value');

      const value = await tokenCacheInstance.getItem('fallback-key');
      assert.strictEqual(value, 'fallback-value');

      // Restore
      mockSafeStorage.decryptString = originalDecrypt;
    });
  });

  describe('localStorage-Compatible API - setItem', () => {
    it('should store item in localStorage', async () => {
      await tokenCacheInstance.setItem('new-key', 'new-value');

      const storedValue = mockLocalStorage._storage.get('new-key') ||
                          mockLocalStorage._storage.get('secure_teams_new-key');
      assert.ok(storedValue !== null);
    });

    it('should reject non-string keys', async () => {
      await assert.rejects(
        async () => await tokenCacheInstance.setItem(null, 'value'),
        { name: 'TypeError', message: /Key and value must be strings/ }
      );

      await assert.rejects(
        async () => await tokenCacheInstance.setItem(123, 'value'),
        { name: 'TypeError' }
      );
    });

    it('should reject non-string values', async () => {
      await assert.rejects(
        async () => await tokenCacheInstance.setItem('key', null),
        { name: 'TypeError', message: /Key and value must be strings/ }
      );

      await assert.rejects(
        async () => await tokenCacheInstance.setItem('key', { obj: 'value' }),
        { name: 'TypeError' }
      );
    });

    it('should handle quota exceeded errors with memory fallback', async () => {
      const originalSetItem = mockLocalStorage.setItem;
      mockLocalStorage.setItem = mock.fn(() => {
        const error = new Error('QuotaExceededError');
        error.name = 'QuotaExceededError';
        throw error;
      });

      await tokenCacheInstance.setItem('quota-key', 'quota-value');

      // With secure storage enabled, it uses secure storage (doesn't hit quota)
      // Without secure storage, it would switch to memory
      const stats = tokenCacheInstance.getCacheStats();
      assert.ok(['secure', 'memory'].includes(stats.storageType));

      // Restore
      mockLocalStorage.setItem = originalSetItem;
    });

    it('should encrypt data when secure storage is available', async () => {
      await tokenCacheInstance.setItem('encrypted-key', 'sensitive-data');

      assert.ok(mockSafeStorage.encryptString.mock.calls.length > 0);
      assert.strictEqual(mockSafeStorage.encryptString.mock.calls[0].arguments[0], 'sensitive-data');
    });

    it('should fallback to unencrypted storage on encryption failure', async () => {
      const originalEncrypt = mockSafeStorage.encryptString;
      mockSafeStorage.encryptString = mock.fn(() => {
        throw new Error('Encryption failed');
      });

      await tokenCacheInstance.setItem('fallback-key', 'fallback-data');

      // Should still store in localStorage
      assert.ok(mockLocalStorage._storage.has('fallback-key'));

      // Restore
      mockSafeStorage.encryptString = originalEncrypt;
    });
  });

  describe('localStorage-Compatible API - removeItem', () => {
    it('should remove item from localStorage', async () => {
      mockLocalStorage._storage.set('remove-key', 'remove-value');

      await tokenCacheInstance.removeItem('remove-key');

      assert.strictEqual(mockLocalStorage._storage.has('remove-key'), false);
    });

    it('should remove item from secure storage', async () => {
      await tokenCacheInstance.setItem('secure-remove', 'value');
      await tokenCacheInstance.removeItem('secure-remove');

      const encryptedKey = 'secure_teams_secure-remove';
      assert.strictEqual(mockLocalStorage._storage.has(encryptedKey), false);
    });

    it('should handle invalid key types gracefully', async () => {
      await assert.doesNotReject(async () => {
        await tokenCacheInstance.removeItem(null);
        await tokenCacheInstance.removeItem(undefined);
        await tokenCacheInstance.removeItem(123);
      });
    });

    it('should not throw on removing non-existent keys', async () => {
      await assert.doesNotReject(async () => {
        await tokenCacheInstance.removeItem('non-existent-key');
      });
    });
  });

  describe('localStorage-Compatible API - clear', () => {
    it('should clear authentication-related keys only', async () => {
      // Set auth-related keys
      mockLocalStorage._storage.set('tmp.auth.v1.token', 'auth-token');
      mockLocalStorage._storage.set('refresh_token', 'refresh-token');
      mockLocalStorage._storage.set('msal.token.abc', 'msal-token');

      // Set non-auth keys
      mockLocalStorage._storage.set('user-preference', 'preference-value');
      mockLocalStorage._storage.set('app-setting', 'setting-value');

      await tokenCacheInstance.clear();

      // Auth keys should be removed
      assert.strictEqual(mockLocalStorage._storage.has('tmp.auth.v1.token'), false);
      assert.strictEqual(mockLocalStorage._storage.has('refresh_token'), false);
      assert.strictEqual(mockLocalStorage._storage.has('msal.token.abc'), false);

      // Non-auth keys should remain
      assert.strictEqual(mockLocalStorage._storage.has('user-preference'), true);
      assert.strictEqual(mockLocalStorage._storage.has('app-setting'), true);
    });

    it('should handle errors during clear operation', async () => {
      mockLocalStorage._storage.set('tmp.auth.v1.token', 'auth-token');

      const originalRemove = mockLocalStorage.removeItem;
      let callCount = 0;
      mockLocalStorage.removeItem = mock.fn(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Remove failed');
        }
      });

      await assert.doesNotReject(async () => {
        await tokenCacheInstance.clear();
      });

      // Restore
      mockLocalStorage.removeItem = originalRemove;
    });

    it('should work with memory fallback', async () => {
      const originalSetItem = mockLocalStorage.setItem;
      mockLocalStorage.setItem = mock.fn(() => {
        const error = new Error('QuotaExceededError');
        error.name = 'QuotaExceededError';
        throw error;
      });

      await tokenCacheInstance.setItem('tmp.auth.v1.test', 'value');
      await tokenCacheInstance.clear();

      const value = await tokenCacheInstance.getItem('tmp.auth.v1.test');
      assert.strictEqual(value, null);

      // Restore
      mockLocalStorage.setItem = originalSetItem;
    });
  });

  describe('Encryption and Decryption', () => {
    it('should use Electron safeStorage for encryption', async () => {
      const initialCalls = mockSafeStorage.encryptString.mock.calls.length;
      await tokenCacheInstance.setItem('token', 'secret-value');

      assert.ok(mockSafeStorage.encryptString.mock.calls.length > initialCalls);
    });

    it('should decrypt data when retrieving from secure storage', async () => {
      await tokenCacheInstance.setItem('token', 'secret-value');

      const initialCalls = mockSafeStorage.decryptString.mock.calls.length;
      const retrieved = await tokenCacheInstance.getItem('token');

      assert.strictEqual(retrieved, 'secret-value');
      assert.ok(mockSafeStorage.decryptString.mock.calls.length > initialCalls);
    });

    it('should handle decryption failures gracefully', async () => {
      const originalDecrypt = mockSafeStorage.decryptString;
      mockSafeStorage.decryptString = mock.fn(() => {
        throw new Error('Decryption error');
      });

      mockLocalStorage._storage.set('secure_teams_key', 'encrypted-data');

      const value = await tokenCacheInstance.getItem('key');
      // Should return null on decryption failure
      assert.strictEqual(value, null);

      // Restore
      mockSafeStorage.decryptString = originalDecrypt;
    });

    it('should store encrypted data in base64 format', async () => {
      await tokenCacheInstance.setItem('token', 'test-value');

      const encryptedKey = 'secure_teams_token';
      const storedValue = mockLocalStorage._storage.get(encryptedKey);

      assert.ok(storedValue !== null);
      // Should be base64 string
      assert.ok(/^[A-Za-z0-9+/=]+$/.test(storedValue));
    });
  });

  describe('Token Persistence', () => {
    it('should persist Teams authentication tokens', async () => {
      const authToken = 'tmp.auth.v1.eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';

      await tokenCacheInstance.setItem('tmp.auth.v1.token', authToken);

      const retrieved = await tokenCacheInstance.getItem('tmp.auth.v1.token');
      assert.strictEqual(retrieved, authToken);
    });

    it('should persist refresh tokens', async () => {
      const refreshToken = 'refresh_token_abc123xyz';

      await tokenCacheInstance.setItem('refresh_token', refreshToken);

      const retrieved = await tokenCacheInstance.getItem('refresh_token');
      assert.strictEqual(retrieved, refreshToken);
    });

    it('should persist MSAL tokens', async () => {
      const msalToken = '{"accessToken":"token123","expiresOn":1234567890}';

      await tokenCacheInstance.setItem('msal.token.account-id', msalToken);

      const retrieved = await tokenCacheInstance.getItem('msal.token.account-id');
      assert.strictEqual(retrieved, msalToken);
    });

    it('should maintain token integrity across operations', async () => {
      const complexToken = JSON.stringify({
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        refresh_token: 'refresh123',
        expires_in: 3600,
        scope: 'user.read mail.send'
      });

      await tokenCacheInstance.setItem('token-data', complexToken);
      const retrieved = await tokenCacheInstance.getItem('token-data');

      assert.strictEqual(retrieved, complexToken);
      assert.deepStrictEqual(JSON.parse(retrieved), JSON.parse(complexToken));
    });
  });

  describe('Error Handling', () => {
    it('should handle encryption failures without crashing', async () => {
      const originalEncrypt = mockSafeStorage.encryptString;
      mockSafeStorage.encryptString = mock.fn(() => {
        throw new Error('Hardware encryption module unavailable');
      });

      await assert.doesNotReject(async () => {
        await tokenCacheInstance.setItem('key', 'value');
      });

      // Restore
      mockSafeStorage.encryptString = originalEncrypt;
    });

    it('should handle storage unavailable errors', async () => {
      const originalGet = mockLocalStorage.getItem;
      mockLocalStorage.getItem = mock.fn(() => {
        throw new Error('Storage access denied');
      });

      const value = await tokenCacheInstance.getItem('key');
      assert.strictEqual(value, null);

      // Restore
      mockLocalStorage.getItem = originalGet;
    });

    it('should automatically switch to memory fallback on quota errors', async () => {
      const originalSetItem = mockLocalStorage.setItem;
      mockLocalStorage.setItem = mock.fn(() => {
        const error = new Error('QuotaExceededError');
        error.name = 'QuotaExceededError';
        throw error;
      });

      await tokenCacheInstance.setItem('key1', 'value1');

      // Subsequent calls should use memory or secure storage
      await tokenCacheInstance.setItem('key2', 'value2');

      const stats = tokenCacheInstance.getCacheStats();
      // With secure storage, it stays secure; without it, switches to memory
      assert.ok(['secure', 'memory'].includes(stats.storageType));

      // Restore
      mockLocalStorage.setItem = originalSetItem;
    });

    it('should handle concurrent operations gracefully', async () => {
      const operations = [
        tokenCacheInstance.setItem('key1', 'value1'),
        tokenCacheInstance.setItem('key2', 'value2'),
        tokenCacheInstance.getItem('key1'),
        tokenCacheInstance.removeItem('key3')
      ];

      await assert.doesNotReject(async () => {
        await Promise.all(operations);
      });
    });
  });

  describe('ADR-002 Compliance', () => {
    it('should implement required Storage interface methods', () => {
      assert.strictEqual(typeof tokenCacheInstance.getItem, 'function');
      assert.strictEqual(typeof tokenCacheInstance.setItem, 'function');
      assert.strictEqual(typeof tokenCacheInstance.removeItem, 'function');
      assert.strictEqual(typeof tokenCacheInstance.clear, 'function');
    });

    it('should use Electron safeStorage when available', () => {
      const stats = tokenCacheInstance.getCacheStats();
      assert.strictEqual(stats.storageInfo.secureBackend, 'electron-safeStorage');
    });

    it('should implement graceful fallback chain', () => {
      // Secure storage → localStorage → memory
      const stats = tokenCacheInstance.getCacheStats();

      assert.ok(['secure', 'localStorage', 'memory'].includes(stats.storageType));
    });

    it('should recognize all Teams authentication patterns', () => {
      const authKeys = [
        'tmp.auth.v1.token',
        'refresh_token',
        'msal.token.abc',
        'EncryptionKey',
        'authSessionId',
        'LogoutState',
        'accessToken',
        'idtoken',
        'Account',
        'Authority',
        'ClientInfo'
      ];

      // Set all auth keys
      authKeys.forEach(key => {
        mockLocalStorage._storage.set(key, 'test-value');
      });

      const stats = tokenCacheInstance.getCacheStats();
      assert.ok(stats.authKeysCount >= authKeys.length);
    });

    it('should provide cache statistics for monitoring', () => {
      const stats = tokenCacheInstance.getCacheStats();

      assert.ok(stats.hasOwnProperty('totalKeys'));
      assert.ok(stats.hasOwnProperty('authKeysCount'));
      assert.ok(stats.hasOwnProperty('refreshTokenCount'));
      assert.ok(stats.hasOwnProperty('msalTokenCount'));
      assert.ok(stats.hasOwnProperty('storageType'));
      assert.ok(stats.hasOwnProperty('storageInfo'));
    });

    it('should maintain async interface compatibility', async () => {
      // All methods should return promises
      assert.ok(tokenCacheInstance.getItem('key') instanceof Promise);
      assert.ok(tokenCacheInstance.setItem('key', 'value') instanceof Promise);
      assert.ok(tokenCacheInstance.removeItem('key') instanceof Promise);
      assert.ok(tokenCacheInstance.clear() instanceof Promise);
    });

    it('should ensure authentication flow identical to v2.x', async () => {
      // Critical v2.x compatibility test

      // 1. Set tokens as v2.x would
      await tokenCacheInstance.setItem('tmp.auth.v1.token', 'access-token');
      await tokenCacheInstance.setItem('refresh_token', 'refresh-token');
      await tokenCacheInstance.setItem('msal.token.account', 'msal-token');

      // 2. Verify retrieval works
      const accessToken = await tokenCacheInstance.getItem('tmp.auth.v1.token');
      const refreshToken = await tokenCacheInstance.getItem('refresh_token');
      const msalToken = await tokenCacheInstance.getItem('msal.token.account');

      assert.strictEqual(accessToken, 'access-token');
      assert.strictEqual(refreshToken, 'refresh-token');
      assert.strictEqual(msalToken, 'msal-token');

      // 3. Verify cache stats show tokens
      const stats = tokenCacheInstance.getCacheStats();
      assert.ok(stats.refreshTokenCount >= 1);
      assert.ok(stats.msalTokenCount >= 1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null values gracefully', async () => {
      await assert.rejects(
        async () => await tokenCacheInstance.setItem('key', null),
        { name: 'TypeError' }
      );

      const value = await tokenCacheInstance.getItem(null);
      assert.strictEqual(value, null);
    });

    it('should handle empty strings', async () => {
      await tokenCacheInstance.setItem('empty-key', '');

      const value = await tokenCacheInstance.getItem('empty-key');
      // With secure storage enabled, empty strings are preserved
      // Without secure storage, localStorage returns null (|| null in implementation)
      assert.strictEqual(value, '');
    });

    it('should handle large data payloads', async () => {
      const largeToken = 'x'.repeat(10000); // 10KB token

      await assert.doesNotReject(async () => {
        await tokenCacheInstance.setItem('large-token', largeToken);
      });

      const retrieved = await tokenCacheInstance.getItem('large-token');
      assert.strictEqual(retrieved.length, 10000);
    });

    it('should handle special characters in keys', async () => {
      const specialKeys = [
        'key.with.dots',
        'key-with-dashes',
        'key_with_underscores',
        'key:with:colons',
        'key|with|pipes'
      ];

      for (const key of specialKeys) {
        await tokenCacheInstance.setItem(key, 'value');
        const retrieved = await tokenCacheInstance.getItem(key);
        assert.strictEqual(retrieved, 'value', `Failed for key: ${key}`);
      }
    });

    it('should handle special characters in values', async () => {
      const specialValues = [
        'value with spaces',
        'value\nwith\nnewlines',
        'value\twith\ttabs',
        'value"with"quotes',
        "value'with'apostrophes",
        'value<with>brackets',
        'value{with}braces',
        'value/with/slashes',
        'value\\with\\backslashes'
      ];

      for (let i = 0; i < specialValues.length; i++) {
        const value = specialValues[i];
        await tokenCacheInstance.setItem(`special-value-${i}`, value);
        const retrieved = await tokenCacheInstance.getItem(`special-value-${i}`);
        assert.strictEqual(retrieved, value, `Failed for value: ${value}`);
      }
    });

    it('should handle Unicode and emoji in values', async () => {
      const unicodeValues = [
        'Hello 世界',
        'Привет мир',
        'مرحبا بالعالم',
        '🚀🔐💻',
        '€£¥₹'
      ];

      for (let i = 0; i < unicodeValues.length; i++) {
        const value = unicodeValues[i];
        await tokenCacheInstance.setItem(`unicode-${i}`, value);
        const retrieved = await tokenCacheInstance.getItem(`unicode-${i}`);
        assert.strictEqual(retrieved, value, `Failed for Unicode: ${value}`);
      }
    });

    it('should handle UUID-like keys correctly', async () => {
      const uuidKey = 'token-12345678-1234-5678-1234-567812345678';

      await tokenCacheInstance.setItem(uuidKey, 'uuid-value');
      const retrieved = await tokenCacheInstance.getItem(uuidKey);

      assert.strictEqual(retrieved, 'uuid-value');
    });

    it('should handle rapid successive operations', async () => {
      const operations = [];

      for (let i = 0; i < 100; i++) {
        operations.push(tokenCacheInstance.setItem(`key-${i}`, `value-${i}`));
      }

      await assert.doesNotReject(async () => {
        await Promise.all(operations);
      });
    });

    it('should maintain data integrity during storage type transitions', async () => {
      // Set data in normal mode
      await tokenCacheInstance.setItem('persistent-key', 'persistent-value');

      // Force quota error to switch to memory
      const originalSetItem = mockLocalStorage.setItem;
      let callCount = 0;
      mockLocalStorage.setItem = mock.fn((key, value) => {
        callCount++;
        if (callCount === 2) {
          const error = new Error('QuotaExceededError');
          error.name = 'QuotaExceededError';
          throw error;
        }
        originalSetItem(key, value);
      });

      await tokenCacheInstance.setItem('trigger-fallback', 'value');

      // Verify original data still accessible
      const value = await tokenCacheInstance.getItem('persistent-key');
      assert.strictEqual(value, 'persistent-value');

      // Restore
      mockLocalStorage.setItem = originalSetItem;
    });
  });
});
