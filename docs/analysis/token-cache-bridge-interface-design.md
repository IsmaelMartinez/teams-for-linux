# Token Cache Bridge Interface Design

## Task 1.4: Design Token Cache Bridge Interface Matching Teams Auth Provider Expectations

**Date**: September 2, 2025  
**Status**: ✅ Complete  
**Based on**: Tasks 1.1, 1.2, and 1.3 research findings

## Summary

This document defines the comprehensive interface design for the Teams token cache bridge that will provide the missing `_tokenCache` functionality to the Teams authentication provider, enabling silent token refresh and eliminating 24-hour re-authentication prompts.

## Core Interface Design

### Primary TokenCache Class

```javascript
class TeamsTokenCache {
  constructor(options = {}) {
    this.storageAdapter = options.storageAdapter || localStorage;
    this.keyPrefix = options.keyPrefix || '';
    this.enableLogging = options.enableLogging || false;
    this.piiSanitizer = options.piiSanitizer || this._defaultPiiSanitizer;
  }

  // Standard storage interface (required by Teams auth provider)
  getItem(key) { }
  setItem(key, value) { }
  removeItem(key) { }
  clear() { }

  // Enhanced Teams-specific methods
  getTeamsTokens(userUuid) { }
  getRefreshTokens() { }
  getAllAccounts() { }
  removeAccount(accountId) { }

  // Token lifecycle management
  isTokenValid(tokenData) { }
  getTokenExpiry(key) { }
  cleanExpiredTokens() { }

  // MSAL compatibility methods
  getAccountByHomeId(homeAccountId) { }
  getAccountByLocalId(localAccountId) { }

  // Utility methods
  getKeysByPattern(pattern) { }
  getTokenStats() { }
}
```

## Core Storage Interface Implementation

### Primary Methods (Required by Teams)

```javascript
/**
 * Retrieves a value from localStorage with error handling
 * @param {string} key - Storage key
 * @returns {string|null} - Stored value or null
 */
getItem(key) {
  try {
    if (!key) return null;
    
    const value = this.storageAdapter.getItem(key);
    
    if (this.enableLogging && this._isAuthKey(key)) {
      console.debug(`[AUTH_DIAG] TokenCache.getItem: ${this._sanitizeKey(key)} -> ${value ? 'found' : 'null'}`);
    }
    
    return value;
  } catch (error) {
    console.error(`[AUTH_DIAG] TokenCache.getItem error for key ${this._sanitizeKey(key)}:`, error);
    return null;
  }
}

/**
 * Stores a value in localStorage with validation
 * @param {string} key - Storage key  
 * @param {string} value - Value to store
 */
setItem(key, value) {
  try {
    if (!key || value === undefined) return;
    
    // Validate token data before storage
    if (this._isTokenKey(key) && !this._validateTokenData(value)) {
      console.warn(`[AUTH_DIAG] TokenCache.setItem: Invalid token data for key ${this._sanitizeKey(key)}`);
      return;
    }
    
    this.storageAdapter.setItem(key, value);
    
    if (this.enableLogging && this._isAuthKey(key)) {
      console.debug(`[AUTH_DIAG] TokenCache.setItem: ${this._sanitizeKey(key)} -> stored (${value?.length || 0} chars)`);
    }
  } catch (error) {
    console.error(`[AUTH_DIAG] TokenCache.setItem error for key ${this._sanitizeKey(key)}:`, error);
  }
}

/**
 * Removes a value from localStorage
 * @param {string} key - Storage key
 */
removeItem(key) {
  try {
    if (!key) return;
    
    this.storageAdapter.removeItem(key);
    
    if (this.enableLogging && this._isAuthKey(key)) {
      console.debug(`[AUTH_DIAG] TokenCache.removeItem: ${this._sanitizeKey(key)} -> removed`);
    }
  } catch (error) {
    console.error(`[AUTH_DIAG] TokenCache.removeItem error for key ${this._sanitizeKey(key)}:`, error);
  }
}

/**
 * Selectively clears only authentication-related keys
 */
clear() {
  try {
    const authKeys = this._getAllAuthKeys();
    let removedCount = 0;
    
    authKeys.forEach(key => {
      this.storageAdapter.removeItem(key);
      removedCount++;
    });
    
    if (this.enableLogging) {
      console.debug(`[AUTH_DIAG] TokenCache.clear: Removed ${removedCount} auth keys`);
    }
  } catch (error) {
    console.error(`[AUTH_DIAG] TokenCache.clear error:`, error);
  }
}
```

## Enhanced Teams-Specific Methods

### Token Retrieval by Pattern

```javascript
/**
 * Retrieves all tokens for a specific user UUID
 * @param {string} userUuid - User's UUID from Teams
 * @returns {Object} - Categorized tokens
 */
getTeamsTokens(userUuid) {
  if (!userUuid) return { auth: [], refresh: [], user: [] };
  
  const pattern = userUuid;
  const keys = this.getKeysByPattern(pattern);
  
  return {
    auth: keys.filter(key => key.includes('tmp.auth.v1') && key.includes(userUuid)),
    refresh: keys.filter(key => key.includes('refresh_token')),
    user: keys.filter(key => key.includes(userUuid) && (key.includes('idtoken') || key.includes('User')))
  };
}

/**
 * Retrieves all refresh tokens from localStorage
 * @returns {Array} - Array of refresh token keys and metadata
 */
getRefreshTokens() {
  const refreshKeys = this.getKeysByPattern('refresh_token');
  
  return refreshKeys.map(key => {
    const value = this.getItem(key);
    return {
      key: this._sanitizeKey(key),
      exists: !!value,
      length: value?.length || 0,
      expiry: this.getTokenExpiry(key)
    };
  });
}

/**
 * Retrieves all user accounts in MSAL-compatible format
 * @returns {Array} - Array of account objects
 */
getAllAccounts() {
  const userKeys = this.getKeysByPattern('User');
  const globalUser = this.getItem('tmp.auth.v1.GLOBAL.User.User');
  
  const accounts = [];
  
  // Parse global user if available
  if (globalUser) {
    try {
      const userData = JSON.parse(globalUser);
      accounts.push({
        homeAccountId: userData.homeAccountId || 'unknown',
        localAccountId: userData.localAccountId || 'unknown', 
        username: userData.username || 'unknown',
        environment: userData.environment || 'login.microsoftonline.com',
        source: 'global'
      });
    } catch (error) {
      console.debug('[AUTH_DIAG] Error parsing global user data:', error);
    }
  }
  
  return accounts;
}
```

### Token Validation and Lifecycle

```javascript
/**
 * Validates token data structure and expiry
 * @param {string} tokenData - JSON token data
 * @returns {boolean} - True if valid
 */
isTokenValid(tokenData) {
  try {
    if (!tokenData) return false;
    
    const parsed = JSON.parse(tokenData);
    
    // Check for required properties
    if (!parsed.secret && !parsed.accessToken && !parsed.idToken) {
      return false;
    }
    
    // Check expiry if present
    if (parsed.expiresOn) {
      const expiryTime = typeof parsed.expiresOn === 'string' 
        ? new Date(parsed.expiresOn).getTime()
        : parsed.expiresOn;
      
      return expiryTime > Date.now();
    }
    
    return true; // No expiry data available, assume valid
  } catch (error) {
    return false;
  }
}

/**
 * Extracts token expiry information
 * @param {string} key - Token key
 * @returns {number|null} - Expiry timestamp or null
 */
getTokenExpiry(key) {
  const value = this.getItem(key);
  if (!value) return null;
  
  try {
    const parsed = JSON.parse(value);
    if (parsed.expiresOn) {
      return typeof parsed.expiresOn === 'string' 
        ? new Date(parsed.expiresOn).getTime()
        : parsed.expiresOn;
    }
  } catch (error) {
    // Ignore parsing errors
  }
  
  return null;
}

/**
 * Removes expired tokens from cache
 * @returns {number} - Count of removed tokens
 */
cleanExpiredTokens() {
  const authKeys = this._getAllAuthKeys();
  let removedCount = 0;
  
  authKeys.forEach(key => {
    if (this._isTokenKey(key)) {
      const value = this.getItem(key);
      if (value && !this.isTokenValid(value)) {
        this.removeItem(key);
        removedCount++;
      }
    }
  });
  
  if (this.enableLogging && removedCount > 0) {
    console.debug(`[AUTH_DIAG] TokenCache.cleanExpiredTokens: Removed ${removedCount} expired tokens`);
  }
  
  return removedCount;
}
```

## MSAL Compatibility Layer

### Account Management

```javascript
/**
 * MSAL-compatible account retrieval by home account ID
 * @param {string} homeAccountId - Home account identifier
 * @returns {Object|null} - Account info or null
 */
async getAccountByHomeId(homeAccountId) {
  const accounts = this.getAllAccounts();
  return accounts.find(account => account.homeAccountId === homeAccountId) || null;
}

/**
 * MSAL-compatible account retrieval by local account ID  
 * @param {string} localAccountId - Local account identifier
 * @returns {Object|null} - Account info or null
 */
async getAccountByLocalId(localAccountId) {
  const accounts = this.getAllAccounts();
  return accounts.find(account => account.localAccountId === localAccountId) || null;
}

/**
 * MSAL-compatible account removal
 * @param {Object} account - Account to remove
 */
async removeAccount(account) {
  if (!account) return;
  
  const userUuid = this._extractUuidFromAccount(account);
  if (userUuid) {
    const userTokens = this.getTeamsTokens(userUuid);
    
    // Remove all tokens associated with this account
    [...userTokens.auth, ...userTokens.refresh, ...userTokens.user].forEach(key => {
      this.removeItem(key);
    });
    
    if (this.enableLogging) {
      console.debug(`[AUTH_DIAG] TokenCache.removeAccount: Removed account ${account.username || account.homeAccountId}`);
    }
  }
}
```

## Utility and Helper Methods

### Key Pattern Matching

```javascript
/**
 * Retrieves keys matching a specific pattern
 * @param {string|RegExp} pattern - Pattern to match
 * @returns {Array} - Matching keys
 */
getKeysByPattern(pattern) {
  const keys = Object.keys(this.storageAdapter);
  const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  
  return keys.filter(key => regex.test(key));
}

/**
 * Retrieves all authentication-related keys
 * @private
 * @returns {Array} - Auth keys
 */
_getAllAuthKeys() {
  const keys = Object.keys(this.storageAdapter);
  return keys.filter(key => this._isAuthKey(key));
}

/**
 * Determines if a key is authentication-related
 * @private  
 * @param {string} key - Key to check
 * @returns {boolean} - True if auth key
 */
_isAuthKey(key) {
  return key.startsWith('tmp.auth.') || 
         key.startsWith('msal.') ||
         key.includes('refresh_token') ||
         /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(key);
}

/**
 * Determines if a key contains token data
 * @private
 * @param {string} key - Key to check  
 * @returns {boolean} - True if token key
 */
_isTokenKey(key) {
  return key.includes('accessToken') ||
         key.includes('idToken') ||
         key.includes('refresh_token') ||
         key.includes('token');
}
```

### PII Sanitization

```javascript
/**
 * Sanitizes keys for logging (removes UUIDs and sensitive data)
 * @private
 * @param {string} key - Key to sanitize
 * @returns {string} - Sanitized key
 */
_sanitizeKey(key) {
  if (!key) return 'null';
  
  // Replace UUIDs with placeholder
  const sanitized = key.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    'UUID-REDACTED'
  );
  
  // Truncate very long keys
  return sanitized.length > 50 ? sanitized.substring(0, 47) + '...' : sanitized;
}

/**
 * Default PII sanitizer for token values
 * @private
 * @param {string} value - Value to sanitize
 * @returns {string} - Sanitized representation
 */
_defaultPiiSanitizer(value) {
  if (!value) return 'null';
  
  try {
    const parsed = JSON.parse(value);
    return {
      type: parsed.tokenType || 'unknown',
      hasSecret: !!parsed.secret,
      hasAccessToken: !!parsed.accessToken,
      hasIdToken: !!parsed.idToken,
      expiresOn: parsed.expiresOn || 'unknown',
      length: value.length
    };
  } catch (error) {
    return { 
      type: 'string',
      length: value.length,
      preview: value.substring(0, 20) + (value.length > 20 ? '...' : '')
    };
  }
}
```

### Diagnostics and Stats

```javascript
/**
 * Retrieves comprehensive token cache statistics
 * @returns {Object} - Cache statistics
 */
getTokenStats() {
  const authKeys = this._getAllAuthKeys();
  
  const stats = {
    total: authKeys.length,
    byCategory: {
      auth: 0,
      refresh: 0,
      user: 0,
      msal: 0,
      other: 0
    },
    byPrefix: {},
    expired: 0,
    valid: 0,
    totalSize: 0
  };
  
  authKeys.forEach(key => {
    const value = this.getItem(key);
    const valueLength = value ? value.length : 0;
    stats.totalSize += valueLength;
    
    // Categorize
    if (key.startsWith('tmp.auth.v1') && !key.includes('User')) {
      stats.byCategory.auth++;
    } else if (key.includes('refresh_token')) {
      stats.byCategory.refresh++;
    } else if (key.includes('User') || key.includes('idtoken')) {
      stats.byCategory.user++;
    } else if (key.startsWith('msal.')) {
      stats.byCategory.msal++;
    } else {
      stats.byCategory.other++;
    }
    
    // Count by prefix
    const prefix = key.split('.')[0] || key.substring(0, 10);
    stats.byPrefix[prefix] = (stats.byPrefix[prefix] || 0) + 1;
    
    // Validate tokens
    if (this._isTokenKey(key) && value) {
      if (this.isTokenValid(value)) {
        stats.valid++;
      } else {
        stats.expired++;
      }
    }
  });
  
  return stats;
}
```

## Integration Interface

### Teams Auth Provider Integration

```javascript
/**
 * Injects the token cache into Teams authentication provider
 * @param {Object} authProvider - Teams auth provider instance
 * @returns {boolean} - Success status
 */
static injectIntoAuthProvider(authProvider, options = {}) {
  if (!authProvider) {
    console.error('[AUTH_DIAG] TokenCache.inject: No auth provider provided');
    return false;
  }
  
  try {
    const cacheInstance = new TeamsTokenCache({
      enableLogging: true,
      ...options
    });
    
    // Inject as _tokenCache property
    authProvider._tokenCache = cacheInstance;
    
    // Add cache validation method
    authProvider._validateTokenCache = () => {
      return authProvider._tokenCache instanceof TeamsTokenCache;
    };
    
    console.debug('[AUTH_DIAG] TokenCache.inject: Successfully injected token cache');
    return true;
    
  } catch (error) {
    console.error('[AUTH_DIAG] TokenCache.inject: Error injecting cache:', error);
    return false;
  }
}
```

## Usage Examples

### Basic Cache Operations

```javascript
// Create cache instance
const tokenCache = new TeamsTokenCache({
  enableLogging: true
});

// Basic operations
const token = tokenCache.getItem('tmp.auth.v1.GLOBAL.accessToken');
tokenCache.setItem('custom.token', JSON.stringify({ value: 'test' }));
tokenCache.removeItem('expired.token');

// Get token statistics
const stats = tokenCache.getTokenStats();
console.log(`Cache contains ${stats.total} auth keys, ${stats.valid} valid tokens`);
```

### Teams Integration

```javascript
// Inject into Teams auth provider
const success = TeamsTokenCache.injectIntoAuthProvider(authProvider);

if (success) {
  // Auth provider now has _tokenCache available
  const userTokens = authProvider._tokenCache.getTeamsTokens('d3578ae8-0d6d-44c0-8d1f-297336ecb0a2');
  console.log(`Found ${userTokens.auth.length} auth tokens for user`);
}
```

## Error Handling and Resilience

### Graceful Degradation

```javascript
/**
 * Validates token data before storage operations
 * @private
 * @param {string} data - Data to validate
 * @returns {boolean} - True if valid
 */
_validateTokenData(data) {
  if (!data) return false;
  
  try {
    // Must be valid JSON for tokens
    if (data.startsWith('{')) {
      JSON.parse(data);
    }
    
    // Check for reasonable size limits
    if (data.length > 10000) {
      console.warn('[AUTH_DIAG] TokenCache: Unusually large token data');
    }
    
    return true;
  } catch (error) {
    return false;
  }
}
```

## Configuration Options

### Constructor Options

```javascript
const options = {
  storageAdapter: localStorage,     // Storage backend (localStorage, sessionStorage, custom)
  keyPrefix: '',                   // Optional key prefix for isolation
  enableLogging: false,            // Enable diagnostic logging
  piiSanitizer: customSanitizer,   // Custom PII sanitization function
  maxTokenAge: 24 * 60 * 60 * 1000, // Maximum token age before cleanup (24 hours)
  autoCleanup: true                // Automatic cleanup of expired tokens
};

const cache = new TeamsTokenCache(options);
```

## Summary

This token cache bridge interface design provides:

1. **Complete localStorage interface compatibility** for Teams auth provider
2. **Enhanced Teams-specific methods** for token management
3. **MSAL compatibility layer** for broader integration
4. **Comprehensive error handling** and logging
5. **PII sanitization** for security compliance
6. **Diagnostic capabilities** for troubleshooting
7. **Flexible configuration** for different deployment scenarios

The design bridges the gap between Teams' expected `_tokenCache` interface and the actual localStorage token storage, enabling silent token refresh and eliminating authentication prompts.

## Next Steps

- ✅ **Task 1.4 Complete**: Token cache bridge interface designed  
- ⏳ **Task 1.5**: Create token cache interface specification and validation criteria
- ⏳ **Task 2.1**: Implement tokenCache.js with this interface design

---

*Interface design completed as part of Task 1.4 in PRD token-cache-authentication-fix implementation.*