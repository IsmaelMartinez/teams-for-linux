# MSAL Token Cache Interface Patterns Research

## Task 1.3: MSAL Token Cache Interface Patterns for Reference Implementation

**Date**: September 2, 2025  
**Status**: ✅ Complete  
**Research Focus**: MSAL.js browser cache implementation for Teams token cache bridge design

## Summary

Microsoft Authentication Library (MSAL) provides comprehensive token caching patterns using standard browser storage APIs with additional security and management layers. These patterns serve as the foundation for implementing a Teams-compatible token cache bridge.

## Core MSAL Cache Interface

### ITokenCache Interface (MSAL Node)

**Primary Methods**:
```javascript
interface ITokenCache {
  getAccountByHomeId(homeAccountId: string): Promise<AccountInfo | null>;
  getAccountByLocalId(localAccountId: string): Promise<AccountInfo | null>;
  getAllAccounts(): Promise<AccountInfo[]>;
  removeAccount(account: AccountInfo): Promise<void>;
}
```

### Browser Storage Implementation

MSAL Browser uses standard localStorage/sessionStorage APIs:

```javascript
// Core storage interface
const cache = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => localStorage.setItem(key, value), 
  removeItem: (key: string) => localStorage.removeItem(key),
  clear: () => localStorage.clear() // Selective clearing in practice
};
```

## Cache Configuration Options

### Storage Locations
- **sessionStorage** (default) - Session-only persistence
- **localStorage** - Cross-tab and session persistence  
- **memoryStorage** - In-memory only (not persistent)

### MSAL.js Configuration
```javascript
// Legacy MSAL.js v1
const config = {
  cacheLocation: 'localStorage' 
};

// Modern @azure/msal-browser
const config = {
  cache: {
    cacheLocation: BrowserCacheLocation.LocalStorage,
    storeAuthStateInCookie: true
  }
};
```

## Cached Artifacts Structure

### Durable Artifacts (Persistent)
- **Access tokens** - API access credentials
- **ID tokens** - User identity information  
- **Refresh tokens** - Token renewal credentials
- **Accounts** - User account metadata

### Ephemeral Artifacts (Temporary)
- **Request metadata** - OAuth flow state
- **Errors** - Authentication errors
- **Interaction status** - UI flow state

## MSAL Key Patterns

### Key Structure Examples
```javascript
// Token keys index
`msal.token.keys.${CLIENT_ID}` 

// Specific token storage
`msal.token.authority.${AUTHORITY}.${CLIENT_ID}.${SCOPE_HASH}`

// Account information
`msal.account.keys.${CLIENT_ID}`
```

### Teams Implementation Evidence
From localStorage analysis, Teams uses:
- `msal.token.keys.5e3ce6c0-2b1f-4627-bb78-5aa95ef9cada`

This confirms Teams integrates MSAL components for some authentication flows.

## Security Features (MSAL v2+)

### Encryption
- **AES-GCM encryption** with HKDF key derivation
- **Session cookie key storage** (`msal.cache.encryption`)
- **Automatic key cleanup** on browser instance close

### Security Recommendations
- Avoid direct cache manipulation
- Use MSAL APIs for token/account retrieval
- Prevent XSS vulnerabilities for storage security

## Token Lifecycle Management

### Automatic Token Refresh
```javascript
// MSAL handles silent token renewal
const tokenResponse = await msalInstance.acquireTokenSilent({
  scopes: ["user.read"],
  account: account
});
```

### Cache Access Pattern
```javascript
// Retrieve token from cache
const msalTokenKeys = JSON.parse(localStorage.getItem(`msal.token.keys.${CLIENT_ID}`));
const accessTokenKey = msalTokenKeys.accessToken[0];
const accessToken = JSON.parse(localStorage.getItem(accessTokenKey)).secret;
```

## Implementation Patterns for Teams Cache Bridge

### 1. Storage Interface Compatibility
Teams cache bridge must implement localStorage-compatible interface:

```javascript
class TeamsTokenCache {
  getItem(key) { return localStorage.getItem(key); }
  setItem(key, value) { localStorage.setItem(key, value); }
  removeItem(key) { localStorage.removeItem(key); }
  clear() { /* selective clearing for auth keys only */ }
}
```

### 2. Key Pattern Recognition  
Support both Teams and MSAL key patterns:

```javascript
const isTeamsKey = key.startsWith('tmp.auth.v1.') || /^[0-9a-f-]{36}/.test(key);
const isMSALKey = key.startsWith('msal.');
```

### 3. Token Type Handling
Handle different token types appropriately:
- **Access tokens** - Short-lived (1 hour), cacheable
- **Refresh tokens** - Long-lived (24+ hours), critical for silent refresh
- **ID tokens** - User identity, needed for account operations

### 4. Account Management Integration
Provide MSAL-like account methods:

```javascript
getAllAccounts() {
  // Parse Teams localStorage for user accounts
  // Return in MSAL AccountInfo format
}
```

## Cache Management Best Practices

### 1. Selective Clearing
```javascript
clear() {
  // Only clear auth-related keys, not all localStorage
  Object.keys(localStorage)
    .filter(key => key.startsWith('tmp.auth.') || key.startsWith('msal.'))
    .forEach(key => localStorage.removeItem(key));
}
```

### 2. Error Handling
```javascript
getItem(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.debug('[TOKEN_CACHE] Error accessing localStorage:', error);
    return null;
  }
}
```

### 3. Token Validation
```javascript
isTokenValid(tokenData) {
  try {
    const parsed = JSON.parse(tokenData);
    return parsed.expiresOn > Date.now();
  } catch (error) {
    return false;
  }
}
```

## Integration Points with Teams Authentication

### Teams-MSAL Bridge Requirements
1. **Preserve existing Teams token format** - Don't break current storage
2. **Support MSAL token access** - Enable existing MSAL key access 
3. **Maintain token lifecycle** - Support both manual and automatic refresh
4. **Provide fallback mechanisms** - Graceful degradation if cache fails

### Expected Cache Operations for Teams
Based on Teams auth provider interface analysis:

```javascript
const expectedOperations = [
  'acquireToken', // Needs cache lookup
  'getCachedUsers', // Needs account enumeration  
  '_getAccessTokenRequest', // Needs token retrieval
  'clearCacheForScope', // Needs selective clearing
];
```

## Conclusion

MSAL provides a robust, secure token caching pattern that Teams partially adopts. The cache bridge implementation should:

1. **Implement localStorage interface** - Standard getItem/setItem/removeItem/clear
2. **Support both key patterns** - Teams (tmp.auth.v1.*) and MSAL (msal.*)
3. **Provide account management** - MSAL-compatible account retrieval
4. **Handle token lifecycle** - Validation, refresh, and cleanup
5. **Maintain security** - Avoid exposing sensitive token data

## Next Steps

- ✅ **Task 1.3 Complete**: MSAL patterns researched and documented
- ⏳ **Task 1.4**: Design token cache bridge interface matching Teams expectations
- ⏳ **Task 1.5**: Create token cache interface specification

## References

- [MSAL Node ITokenCache Interface](https://learn.microsoft.com/en-us/javascript/api/@azure/msal-node/itokencache)
- [MSAL Browser Caching Documentation](https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-browser/docs/caching.md)
- [MSAL Token Caching Guide](https://learn.microsoft.com/en-us/entra/identity-platform/msal-acquire-cache-tokens)
- Teams localStorage Analysis (Task 1.2)
- Teams Auth Provider Interface Analysis (Task 1.1)

---

*Research completed as part of Task 1.3 in PRD token-cache-authentication-fix implementation.*