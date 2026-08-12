/**
 * Encrypted token cache persistence using Electron safeStorage.
 * Stores MSAL token cache in electron-store under auth.appRegistration.tokenCache.
 */

const SETTINGS_KEY = 'auth.appRegistration.tokenCache';

let safeStorageModule = null;
try {
  safeStorageModule = require('electron').safeStorage;
} catch {
  // Graceful fallback when required outside Electron context
}

/**
 * Saves serialized MSAL token cache encrypted with safeStorage
 */
const saveTokenCache = async (settingsStore, serializedData) => {
  if (!settingsStore || typeof settingsStore.set !== 'function' || !serializedData) {
    return false;
  }

  try {
    if (safeStorageModule && safeStorageModule.isEncryptionAvailable()) {
      const encryptedBuffer = safeStorageModule.encryptString(serializedData);
      const base64Data = encryptedBuffer.toString('base64');
      settingsStore.set(SETTINGS_KEY, { encrypted: true, data: base64Data });
      return true;
    } else {
      console.debug('[AuthCache] Encryption unavailable; token cache not saved');
      return false;
    }
  } catch (error) {
    console.warn('[AuthCache] Failed to save token cache:', error.message);
    return false;
  }
};

/**
 * Loads and decrypts MSAL token cache
 */
const loadTokenCache = async (settingsStore) => {
  if (!settingsStore || typeof settingsStore.get !== 'function') {
    return null;
  }

  try {
    const entry = settingsStore.get(SETTINGS_KEY);
    if (!entry || !entry.encrypted || !entry.data) {
      return null;
    }

    if (safeStorageModule && safeStorageModule.isEncryptionAvailable()) {
      const buffer = Buffer.from(entry.data, 'base64');
      const decrypted = safeStorageModule.decryptString(buffer);
      return decrypted;
    } else {
      console.debug('[AuthCache] Encryption unavailable for decryption');
      return null;
    }
  } catch (error) {
    console.warn('[AuthCache] Failed to load token cache:', error.message);
    return null;
  }
};

/**
 * Creates MSAL cachePlugin interface for PublicClientApplication
 */
const createCachePlugin = (settingsStore) => {
  return {
    beforeCacheAccess: async (cacheContext) => {
      const serialized = await loadTokenCache(settingsStore);
      if (serialized) {
        cacheContext.tokenCache.deserialize(serialized);
      }
    },
    afterCacheAccess: async (cacheContext) => {
      if (cacheContext.cacheHasChanged) {
        const serialized = cacheContext.tokenCache.serialize();
        await saveTokenCache(settingsStore, serialized);
      }
    },
  };
};

module.exports = {
  saveTokenCache,
  loadTokenCache,
  createCachePlugin,
};

