# Token Cache Investigation - Issue #1357

## Problem Statement

Teams for Linux (Electron wrapper) experiences authentication failures after:
- System sleep/wake cycles
- 24-hour periods (token expiry)
- App restarts

Users are forced to re-authenticate despite the web version of Teams working perfectly in browsers.

## Root Cause Analysis

### Initial Findings

Our diagnostic logging (v2.5.3) revealed:

#### ✅ What's Working:
- **Token Storage**: 62 auth-related keys in localStorage
- **Refresh Tokens**: 4 refresh-related keys found and properly stored
- **Auth Provider Methods**: `acquireToken`, `getCachedUsers` available
- **Token Acquisition**: IC3 gateway tokens acquired successfully `fromCache: true`

#### ❌ What's Broken:
- **Token Cache Interface**: `authProvider._tokenCache` is `false`
- **Cache Bridge Missing**: Auth provider can't access stored tokens
- **Silent Refresh Fails**: No cache interface prevents automatic token renewal

### Technical Deep Dive

```javascript
// What we found in the authentication provider:
{
  getCachedUsers: ✅ available,
  acquireToken: ✅ available,
  _getAccessTokenRequest: ✅ available,
  _tokenCache: ❌ undefined/false  // THIS IS THE PROBLEM
}
```

**Key Insight**: The authentication provider HAS token functionality but LACKS the cache interface to access stored tokens for silent refresh.

## Why Browsers Work vs Electron Doesn't

### Browser Behavior:
- Native session/cookie persistence
- Built-in token cache handling
- Graceful sleep/wake recovery
- localStorage automatically accessible

### Electron Issues:
- Missing token cache interface abstraction
- No persistence across process restarts
- Sleep/wake cycle breaks in-memory cache
- Auth provider expects cache object structure that doesn't exist

## Industry Research & Best Practices

### This is a Known Issue

Multiple sources confirm this is a widespread problem:

1. **Microsoft Token Policies**: 
   - Refresh tokens expire after 24 hours by default
   - Silent renewal requires persistent cache
   - Sleep/inactivity invalidates in-memory tokens

2. **Electron-Specific Challenges**:
   - Native desktop apps have expanded attack surface
   - localStorage not always persistent across sessions
   - Missing browser-like session management
   - Auth providers expect specific cache interfaces

3. **Community Solutions**:
   - Custom token cache bridges (localStorage → cache interface)
   - OS-backed credential storage (keytar/safeStorage)
   - Persistent token serialization

## Proposed Solutions

### Option 1: Custom Token Cache Bridge ⚡ (Current Direction)

Create a shim that provides the missing `_tokenCache` interface:

```javascript
// Pseudo-code
const customTokenCache = {
  getItem: (key) => JSON.parse(localStorage.getItem(key)),
  setItem: (key, value) => localStorage.setItem(key, JSON.stringify(value)),
  removeItem: (key) => localStorage.removeItem(key),
  // ... other cache methods expected by auth provider
};

// Inject into auth provider
authProvider._tokenCache = customTokenCache;
```

**Pros**: 
- Minimal changes to existing codebase
- Uses existing localStorage tokens
- No external dependencies

**Cons**: 
- Considered a "hack" by security standards
- Tokens still stored in plain localStorage
- May break with Teams updates

### Option 2: OS-Backed Secure Storage 🔐 (Recommended)

Implement keytar or Electron's safeStorage for secure token persistence:

```javascript
// Using keytar
const keytar = require('keytar');

// Store refresh token securely
await keytar.setPassword('teams-for-linux', 'refresh-token', tokenValue);

// Retrieve for renewal
const refreshToken = await keytar.getPassword('teams-for-linux', 'refresh-token');
```

**Pros**:
- Industry best practice for Electron apps
- OS-level encryption (Keychain/Windows Vault)
- Persistent across app updates/restarts
- Secure against malware token theft

**Cons**:
- Additional complexity
- External dependency (keytar/safeStorage)
- Need to intercept and manage token lifecycle

### Option 3: Hybrid Approach 🚀 (Optimal)

Combine both solutions:
1. Implement secure storage for refresh tokens
2. Create cache bridge for compatibility
3. Graceful fallback mechanisms

## Implementation Tasks & Spikes

### Phase 1: Token Cache Bridge (Quick Win)
- [ ] **SPIKE**: Analyze exact cache interface expected by Teams auth provider
- [ ] **TASK**: Implement localStorage-backed cache bridge
- [ ] **TASK**: Inject cache bridge into auth provider at runtime
- [ ] **TASK**: Test silent token refresh functionality
- [ ] **TASK**: Add comprehensive logging for cache operations

### Phase 2: Secure Storage Integration (Long-term)
- [ ] **SPIKE**: Compare keytar vs Electron safeStorage vs node-keyv
- [ ] **SPIKE**: Investigate token interception points in Teams web app
- [ ] **TASK**: Implement secure token storage abstraction
- [ ] **TASK**: Create token migration from localStorage to secure storage
- [ ] **TASK**: Add token encryption/decryption wrapper
- [ ] **TASK**: Handle cross-platform storage differences (macOS/Linux/Windows)

### Phase 3: Robust Authentication Flow
- [ ] **TASK**: Implement fallback to interactive auth when silent fails
- [ ] **TASK**: Add sleep/wake event handling for token refresh
- [ ] **TASK**: Create token lifecycle monitoring
- [ ] **TASK**: Add comprehensive error handling and recovery

### Phase 4: Testing & Validation
- [ ] **TASK**: Test 24-hour token expiry scenarios
- [ ] **TASK**: Test system sleep/wake token persistence
- [ ] **TASK**: Test app restart token recovery
- [ ] **TASK**: Security audit of token storage implementation
- [ ] **TASK**: Performance impact assessment

## Security Considerations

### Current Risk (localStorage only):
- Tokens readable by malware
- Plain-text storage on disk
- No encryption at rest
- Vulnerable to local attacks

### Secure Storage Benefits:
- OS-level encryption (AES-256)
- Integration with system keychain
- Harder to extract by malicious software
- Industry standard for desktop apps

## References & Similar Issues

1. **Electron Security**: https://www.electronjs.org/docs/latest/tutorial/security
2. **Auth0 Electron Guide**: https://auth0.com/blog/securing-electron-applications-with-openid-connect-and-oauth-2/
3. **Microsoft Token Best Practices**: Official guidance recommends OS credential stores
4. **Similar Apps**: Slack, Discord, VSCode all use secure storage for tokens
5. **Community Discussions**: Multiple Stack Overflow threads about Electron + Microsoft auth

## Success Criteria

- [ ] Users no longer need to re-authenticate after 24 hours
- [ ] Tokens persist through system sleep/wake cycles
- [ ] App restarts don't require re-authentication
- [ ] Silent token refresh works reliably
- [ ] Tokens stored securely (not plain-text localStorage)
- [ ] Solution works across all supported platforms (Linux, macOS, Windows)

## Next Steps

1. **Start with Phase 1** - implement token cache bridge for immediate relief
2. **Research keytar vs safeStorage** for secure storage implementation
3. **Test with controlled token expiry scenarios**
4. **Plan migration strategy** from current localStorage to secure storage

---

*Investigation Date: September 2, 2025*  
*Issue: #1357 - Authentication refresh problems*  
*Status: Root cause identified, implementation phases planned*