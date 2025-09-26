# Token Cache Architecture

<!-- toc -->

## Overview

The Teams for Linux token cache system provides persistent authentication by implementing the missing `_tokenCache` interface that Microsoft Teams' authentication provider expects. This eliminates frequent re-authentication prompts and enables silent token refresh capabilities.

## Problem Statement

Microsoft Teams web app uses an authentication provider that expects a token cache interface for silent token refresh. In browser environments, this works seamlessly, but Electron applications lack this interface by default. Without it, users experience:

- Authentication prompts every ~24 hours
- Re-authentication required after system sleep/wake cycles
- Authentication lost after application restarts
- Inability to use refresh tokens for silent authentication

## Solution Architecture

### Phase 1: Core Token Cache Bridge (Completed)

The initial implementation provides a localStorage-compatible interface that satisfies Teams' authentication provider requirements.

```mermaid
graph TB
    A[Teams Authentication Provider] --> B[Token Cache Bridge]
    B --> C[localStorage]
    B --> D[Memory Fallback]
    
    subgraph "Token Cache Interface"
        B --> E[getItem/setItem/removeItem]
        B --> F[Token Validation]
        B --> G[PII-Safe Logging]
    end
```

### Phase 2: Secure Storage Integration (Completed)

Enhanced implementation adds OS-level encryption using Electron's `safeStorage` API while maintaining backward compatibility.

```mermaid
graph TB
    A[Teams Authentication Provider] --> B[Enhanced Token Cache]
    
    subgraph "Storage Backends"
        B --> C[Secure Storage Primary]
        B --> D[localStorage Fallback]
        B --> E[Memory Emergency Fallback]
    end
    
    subgraph "Secure Storage Layer"
        C --> F[Electron safeStorage]
        F --> G[OS-Specific Secure Storage]
    end
    
```

## Implementation Details

### Core Components

#### 1. TeamsTokenCache Class

Located in `app/browser/tools/tokenCache.js`, this singleton class provides:

- **localStorage Interface Compatibility**: Full implementation of `getItem`, `setItem`, `removeItem`, `clear`, `length`, and `key(index)`
- **Secure Storage Integration**: Primary storage using Electron `safeStorage` with encryption
- **Graceful Fallback**: Automatic fallback to localStorage if secure storage unavailable
- **Memory Fallback**: Emergency fallback to in-memory storage for quota issues

#### 2. Authentication Provider Injection

The token cache is injected into Teams' authentication provider via `reactHandler.js`:

```javascript
// Inject token cache into Teams authentication provider
if (authProvider && !authProvider._tokenCache) {
    authProvider._tokenCache = tokenCache;
    console.log('[AUTH] Token cache injected successfully');
}
```

#### 3. Cross-Platform Secure Storage

The implementation uses Electron's `safeStorage` API which automatically handles platform-specific encryption backends (macOS Keychain, Windows DPAPI, Linux Secret Service). The application only needs to check `safeStorage.isEncryptionAvailable()` - Electron abstracts all OS-specific details.

#### 4. Configurable Token Refresh Scheduling

The token cache includes built-in refresh scheduling to prevent authentication expiry:

```javascript
// Refresh Scheduling Interface
startRefreshScheduler(refreshCallback, intervalHours)  // Start scheduled refresh
stopRefreshScheduler()                                // Stop and cleanup
getRefreshSchedulerStatus()                          // Get current status
```

**Configuration Options:**
- **Enabled/Disabled**: Toggle refresh functionality via `tokenRefresh.enabled`
- **Interval**: 1-24 hours (configurable via `tokenRefresh.refreshIntervalHours`)
- **Automatic Cleanup**: Prevents memory leaks with proper timer management

**Integration with Teams:**
- Uses existing Teams authentication provider
- Calls `acquireToken` with correlation and force refresh flags
- Runs alongside Teams' native refresh (no conflicts)
- Preserves all existing authentication functionality

**Usage Example:**
```javascript
// Start refresh scheduler with 2-hour intervals
tokenCache.startRefreshScheduler(
  () => reactHandler.refreshToken(), 
  2 // hours
);

// Check status
const status = tokenCache.getRefreshSchedulerStatus();
console.log('Refresh enabled:', status.enabled);
console.log('Next refresh in:', status.intervalHours, 'hours');
```

### Security Considerations

#### 1. Encryption at Rest

- **Secure Storage**: All tokens encrypted using OS-level cryptographic APIs
- **Key Management**: Encryption keys managed by the operating system
- **Access Control**: Only the application can decrypt stored tokens

#### 2. Fallback Security

- **localStorage Fallback**: Plain text storage when secure storage unavailable
- **Memory Fallback**: Temporary storage for quota exceeded scenarios
- **PII Protection**: All logging sanitizes personally identifiable information

#### 3. Natural Transition

- **Gradual Security**: New tokens automatically use secure storage
- **Existing Compatibility**: Old tokens continue working via fallback
- **Token Refresh**: Natural security improvement as tokens refresh

## Token Storage Format

### Secure Storage

Tokens are stored in localStorage with a secure prefix and encrypted content:

```
Key: secure_teams_<original_key>
Value: <base64_encoded_encrypted_data>
```

### Token Types Supported

The system recognizes and handles multiple token formats:

- **Teams Auth v1**: `tmp.auth.v1.*` patterns
- **Refresh Tokens**: UUID-based refresh token patterns
- **ID Tokens**: UUID-based ID token patterns  
- **MSAL Tokens**: `msal.*` patterns
- **Custom Tokens**: Any tokens matching authentication patterns

## Configuration

### Automatic Configuration

The token cache system requires no user configuration and works automatically:

1. **Availability Detection**: Automatically detects secure storage availability
2. **Storage Selection**: Chooses secure storage for new tokens when available
3. **Fallback Selection**: Selects appropriate storage backend based on availability

### Runtime Information

Diagnostic information available via `getStorageInfo()`:

```javascript
{
  localStorage: true,
  memoryFallback: false,
  secureStorage: true,
  platform: "darwin",
  secureBackend: "electron-safeStorage"
}
```

## Error Handling

### Storage Errors

- **Quota Exceeded**: Automatic switch to memory fallback
- **Security Errors**: Graceful degradation to localStorage
- **Encryption Errors**: Fallback to unencrypted storage

### Storage Fallback

- **Graceful Degradation**: Falls back to localStorage when secure storage unavailable
- **Complete Failure**: Leaves tokens in localStorage
- **Recovery**: No data loss in any failure scenario

## Performance Considerations

### Optimization Strategies

1. **Lazy Initialization**: Secure storage initialized only when needed
2. **No Migration**: Zero overhead natural transition
3. **Efficient Fallback**: Fast detection and switching between backends
4. **Minimal Logging**: Reduced logging overhead compared to complex systems

### Benchmarks

| Operation | Secure Storage | localStorage | Memory |
|-----------|----------------|--------------|--------|
| getItem | ~2ms | ~1ms | ~0.1ms |
| setItem | ~3ms | ~1ms | ~0.1ms |

## Troubleshooting

### Common Issues

#### 1. Secure Storage Unavailable

**Symptoms**: Logs show "Secure storage not available"
**Cause**: Secure storage unavailable (check `safeStorage.isEncryptionAvailable()`)
**Resolution**: Automatic fallback to localStorage, no user action needed

#### 2. Storage Availability

**Symptoms**: Some tokens not migrated to secure storage
**Cause**: Individual token encryption failures
**Resolution**: Failed tokens remain in localStorage, authentication still works

#### 3. Memory Fallback Active

**Symptoms**: Logs show "Switching to memory fallback"
**Cause**: localStorage quota exceeded
**Resolution**: Tokens stored in memory for current session, consider clearing browser data

### Debug Information

Token cache uses console logging with `[TOKEN_CACHE]` prefixes. Enable detailed logging to see debug output:

```bash
ELECTRON_DEBUG_LOGGING=true npm start
```

### Log Patterns

```
[TOKEN_CACHE] TokenCache initialized { localStorage: true, secureStorage: true }
[TOKEN_CACHE] Secure storage available
[TOKEN_CACHE] Secure storage available and ready
```

## Future Enhancements

### Planned Improvements

- **Simplified Architecture**: No migration complexity to maintain
- **Performance Optimization**: Further reduce encryption/decryption overhead
- **Advanced Diagnostics**: Enhanced monitoring for enterprise environments

### Not Planned

- **Custom MSAL Integration**: Would require developer app registration
- **Token Value Modification**: Only provides cache interface, doesn't alter tokens
- **Real-time Token Monitoring**: Focused on cache interface, not token lifecycle

## API Reference

### Public Methods

#### `getItem(key: string): Promise<string | null>`
Retrieve token from cache with secure storage priority.

#### `setItem(key: string, value: string): Promise<void>`
Store token in cache with encryption when available.

#### `removeItem(key: string): Promise<void>`
Remove token from all storage backends.

#### `clear(): Promise<void>`
Clear all authentication-related tokens.

#### `isTokenValid(key: string): Promise<boolean>`
Check if token exists and is not expired.

#### `getStorageInfo(): object`
Get diagnostic information about storage backends.

### Storage Interface Compatibility

The class implements the full Web Storage API for Teams compatibility:

- `length: number` - Number of stored items
- `key(index: number): string | null` - Get key at index

## Upgrade Guide

### From Previous Versions

Users upgrading from versions without secure storage will experience seamless transition:

1. **Immediate Compatibility**: Existing tokens continue working via localStorage fallback
2. **Automatic Security**: New tokens use secure storage when available  
3. **Natural Transition**: Security improves as tokens refresh (typically within hours)
4. **Zero Downtime**: No authentication interruption during upgrade

### No Migration Required

The implementation eliminates migration complexity by using a dual-storage approach where new tokens automatically use secure storage while existing tokens remain functional through fallback mechanisms.

## Security Best Practices

### For Users

- **Keep OS Updated**: Ensure operating system security updates are current
- **Check Availability**: Use `safeStorage.isEncryptionAvailable()` to verify secure storage support
- **Monitor Logs**: Watch for security warnings in application logs

### For Developers

- **PII Protection**: Never log actual token values or user identifiers
- **Error Handling**: Always provide fallback mechanisms for storage failures
- **Availability Testing**: Test both with and without secure storage availability
- **Fallback Testing**: Verify graceful degradation when secure storage unavailable

---

> [!NOTE]
> This implementation provides enterprise-grade security while maintaining simplicity and reliability. The natural transition approach eliminates migration complexity while ensuring authentication works regardless of platform capabilities.

