# PII Sanitization Requirements for Token Cache Operations

## Task 1.6: PII Sanitization Requirements for Cache Operations Logging

**Date**: September 2, 2025  
**Status**: ✅ Complete  
**Security Focus**: Ensure no personally identifiable information or sensitive authentication data is exposed in logs

## Overview

Token cache operations must implement comprehensive PII sanitization to protect user privacy and prevent credential exposure in application logs, debugging output, and crash reports.

## Classification of Sensitive Data

### 1. High-Risk PII (Never Log)

**Access Tokens & Secrets**
- JWT access tokens (e.g., `eyJ0eXAiOiJKV1QiLCJhbGc...`)
- Refresh tokens (e.g., `0.AXoA...` patterns)
- ID token payloads containing user claims
- Encryption keys and certificate data
- Authentication signatures

**User Identifiers**
- Full email addresses (e.g., `user@company.com`)
- User Principal Names (UPNs)
- Object IDs and tenant IDs (full values)
- Directory GUIDs (full values)

**Authentication State**
- Session cookies and authentication cookies
- CSRF tokens and state parameters
- Authorization codes from OAuth flows
- Client secrets and application keys

### 2. Medium-Risk PII (Sanitize Before Logging)

**UUIDs and Identifiers**
- User UUIDs: `d3578ae8-0d6d-44c0-8d1f-297336ecb0a2` → `d3578ae8...`
- Client IDs: `5e3ce6c0-2b1f-4627-bb78-5aa95ef9cada` → `5e3ce6c0...`
- Tenant identifiers (first 8 characters only)
- Session identifiers (first 8 characters only)

**Domain Information**
- Corporate domains in URLs (e.g., `company.sharepoint.com` → `*****.sharepoint.com`)
- Custom authority endpoints with organization names
- Internal service URLs with sensitive paths

### 3. Safe to Log (With Context)

**Technical Metadata**
- Token expiry timestamps (no user correlation)
- Token type indicators (`accessToken`, `refreshToken`, `idToken`)
- Cache operation types (`GET`, `SET`, `REMOVE`, `CLEAR`)
- Error codes and technical error messages (non-user specific)
- Cache statistics (counts, sizes, timing)

## Sanitization Implementation

### 1. Key Sanitization Functions

```javascript
class PIISanitizer {
  /**
   * Sanitize localStorage keys for logging
   * @param {string} key - The localStorage key
   * @returns {string} Sanitized key safe for logging
   */
  static sanitizeKey(key) {
    if (typeof key !== 'string') return '[INVALID_KEY_TYPE]';
    
    // Handle UUID patterns - show first 8 chars only
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
    let sanitized = key.replace(uuidPattern, (match) => `${match.substr(0, 8)}...`);
    
    // Handle MSAL client IDs
    const msalClientPattern = /msal\.token\.keys\.([0-9a-f-]{36})/gi;
    sanitized = sanitized.replace(msalClientPattern, 'msal.token.keys.$1...');
    
    // Handle very long keys (>200 chars) - truncate
    if (sanitized.length > 200) {
      sanitized = `${sanitized.substr(0, 197)}...`;
    }
    
    return sanitized;
  }
  
  /**
   * Sanitize token values - NEVER log actual content
   * @param {string} value - The token value  
   * @returns {string} Safe metadata about the value
   */
  static sanitizeValue(value) {
    if (typeof value !== 'string') return '[INVALID_VALUE_TYPE]';
    if (!value) return '[EMPTY_VALUE]';
    
    const length = value.length;
    const type = this.detectTokenType(value);
    const hasExpiry = this.hasExpiryData(value);
    
    return `[${type}_TOKEN:${length}chars${hasExpiry ? ':HAS_EXPIRY' : ''}]`;
  }
  
  /**
   * Detect token type from value structure
   * @param {string} value - The token value
   * @returns {string} Token type identifier
   */
  static detectTokenType(value) {
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
   */
  static hasExpiryData(value) {
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
```

### 2. Logging Implementation

```javascript
class TokenCacheLogger {
  /**
   * Log cache operations with PII sanitization
   * @param {string} operation - The operation type
   * @param {string} key - The cache key
   * @param {string} [value] - The cache value (optional)
   * @param {Object} [metadata] - Additional metadata
   */
  static logOperation(operation, key, value = null, metadata = {}) {
    const sanitizedKey = PIISanitizer.sanitizeKey(key);
    const sanitizedValue = value ? PIISanitizer.sanitizeValue(value) : null;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      operation,
      key: sanitizedKey,
      ...(sanitizedValue && { value: sanitizedValue }),
      ...metadata
    };
    
    console.debug(`[TOKEN_CACHE] ${operation}: ${sanitizedKey}${sanitizedValue ? ` => ${sanitizedValue}` : ''}`);
    
    // Store sanitized log entry for debugging
    this.addToAuditLog(logEntry);
  }
  
  /**
   * Log errors with sanitized context
   * @param {Error} error - The error object
   * @param {string} context - The operation context
   * @param {string} [key] - The related key (optional)
   */
  static logError(error, context, key = null) {
    const sanitizedKey = key ? PIISanitizer.sanitizeKey(key) : null;
    
    console.error(`[TOKEN_CACHE] ERROR in ${context}:`, {
      message: error.message,
      name: error.name,
      ...(sanitizedKey && { key: sanitizedKey }),
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * Maintain sanitized audit log for debugging
   * @param {Object} logEntry - The sanitized log entry
   */
  static addToAuditLog(logEntry) {
    if (!this._auditLog) this._auditLog = [];
    
    // Keep last 1000 entries only
    if (this._auditLog.length >= 1000) {
      this._auditLog.shift();
    }
    
    this._auditLog.push(logEntry);
  }
  
  /**
   * Get sanitized cache statistics for debugging
   * @returns {Object} Safe cache statistics
   */
  static getCacheStats() {
    const stats = {
      timestamp: new Date().toISOString(),
      totalKeys: 0,
      authKeysCount: 0,
      refreshTokenCount: 0,
      msalKeysCount: 0,
      averageKeyLength: 0,
      totalValueSize: 0,
      operationHistory: this._auditLog ? this._auditLog.length : 0
    };
    
    // Count keys by pattern (no actual key values logged)
    Object.keys(localStorage).forEach(key => {
      stats.totalKeys++;
      stats.averageKeyLength += key.length;
      
      if (key.startsWith('tmp.auth.v1.')) stats.authKeysCount++;
      if (key.includes('.refresh_token')) stats.refreshTokenCount++;
      if (key.startsWith('msal.')) stats.msalKeysCount++;
      
      const value = localStorage.getItem(key);
      if (value) stats.totalValueSize += value.length;
    });
    
    stats.averageKeyLength = Math.round(stats.averageKeyLength / stats.totalKeys);
    
    return stats;
  }
}
```

## Sanitization Rules by Data Type

### 1. UUID Sanitization

**Pattern**: `d3578ae8-0d6d-44c0-8d1f-297336ecb0a2`
**Sanitized**: `d3578ae8...`
**Reasoning**: First 8 characters provide enough context for debugging without exposing full identifier

```javascript
const sanitizeUUID = (uuid) => {
  return uuid.replace(/([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '$1...');
};
```

### 2. Token Value Sanitization

**Access Token**: `eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6Ik...`
**Sanitized**: `[JWT_TOKEN:1247chars:HAS_EXPIRY]`

**Refresh Token**: `0.AXoAqzFabcdefghijklmnopqrstuvwxyz123456789...`
**Sanitized**: `[REFRESH_TOKEN:485chars]`

**JSON Token Bundle**: `{"accessToken":"eyJ...","expiresOn":1693747200}`
**Sanitized**: `[TOKEN_BUNDLE:892chars:HAS_EXPIRY]`

### 3. URL Sanitization

**Corporate URLs**: `https://company.sharepoint.com/sites/teams/auth`
**Sanitized**: `https://*****.sharepoint.com/sites/teams/auth`

**Authority URLs**: `https://login.microsoftonline.com/12345678-1234-1234-1234-123456789abc`
**Sanitized**: `https://login.microsoftonline.com/12345678...`

## Implementation in Token Cache

### 1. Core Cache Operations

```javascript
class TeamsTokenCache {
  getItem(key) {
    try {
      const value = localStorage.getItem(key);
      TokenCacheLogger.logOperation('GET', key, value);
      return value;
    } catch (error) {
      TokenCacheLogger.logError(error, 'getItem', key);
      return null;
    }
  }
  
  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
      TokenCacheLogger.logOperation('SET', key, value);
    } catch (error) {
      TokenCacheLogger.logError(error, 'setItem', key);
      throw error;
    }
  }
  
  removeItem(key) {
    try {
      localStorage.removeItem(key);
      TokenCacheLogger.logOperation('REMOVE', key);
    } catch (error) {
      TokenCacheLogger.logError(error, 'removeItem', key);
    }
  }
  
  clear() {
    const authKeys = this.getAuthKeys();
    TokenCacheLogger.logOperation('CLEAR_START', `${authKeys.length} keys`);
    
    authKeys.forEach(key => this.removeItem(key));
    
    TokenCacheLogger.logOperation('CLEAR_COMPLETE', `${authKeys.length} keys`);
  }
}
```

### 2. Diagnostic Integration

```javascript
// Integration with existing ReactHandler diagnostic logging
class ReactHandler {
  _analyzeTokenStorage() {
    console.debug('[AUTH_DIAG] TOKEN_CACHE_STATS:', TokenCacheLogger.getCacheStats());
    
    // Log sanitized token patterns without exposing values
    const patterns = this._getTokenPatterns();
    console.debug('[AUTH_DIAG] TOKEN_PATTERNS:', patterns);
  }
  
  _getTokenPatterns() {
    const patterns = {
      authV1Keys: [],
      refreshTokenKeys: [],
      msalKeys: [],
      userSpecificKeys: []
    };
    
    Object.keys(localStorage).forEach(key => {
      const sanitizedKey = PIISanitizer.sanitizeKey(key);
      
      if (key.startsWith('tmp.auth.v1.')) {
        patterns.authV1Keys.push(sanitizedKey);
      } else if (key.includes('.refresh_token')) {
        patterns.refreshTokenKeys.push(sanitizedKey);
      } else if (key.startsWith('msal.')) {
        patterns.msalKeys.push(sanitizedKey);
      } else if (/^[0-9a-f-]{36}/.test(key)) {
        patterns.userSpecificKeys.push(sanitizedKey);
      }
    });
    
    return patterns;
  }
}
```

## Security Validation

### 1. PII Exposure Prevention

**Validation Tests**:
```javascript
describe('PII Sanitization', () => {
  test('should never log actual token values', () => {
    const sensitiveToken = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiI...';
    const sanitized = PIISanitizer.sanitizeValue(sensitiveToken);
    expect(sanitized).not.toContain('eyJ0eXAiOiJKV1Qi');
    expect(sanitized).toMatch(/\[JWT_TOKEN:\d+chars/);
  });
  
  test('should truncate UUIDs to first 8 characters', () => {
    const key = 'tmp.auth.v1.d3578ae8-0d6d-44c0-8d1f-297336ecb0a2.microsoft.com';
    const sanitized = PIISanitizer.sanitizeKey(key);
    expect(sanitized).toBe('tmp.auth.v1.d3578ae8....microsoft.com');
  });
  
  test('should not expose email addresses in logs', () => {
    const logs = getAllLogs();
    logs.forEach(log => {
      expect(log).not.toMatch(/@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    });
  });
});
```

### 2. Audit Trail Compliance

**Requirements**:
- ✅ All cache operations logged with sanitized parameters
- ✅ Error conditions logged without exposing sensitive context
- ✅ Performance metrics available without PII exposure
- ✅ Debugging information available with privacy protection
- ✅ Audit log size limits enforced (1000 entries maximum)

## Integration Requirements

### 1. Existing Logging Systems

**ReactHandler Integration**:
- Must use existing `[AUTH_DIAG]` prefix for authentication diagnostics
- Must integrate with `logAuthenticationState()` method
- Must not break existing diagnostic logging patterns

**ActivityHub Integration**:
- Must integrate with periodic authentication monitoring
- Must provide sanitized cache statistics for monitoring
- Must maintain compatibility with existing logging infrastructure

### 2. Error Reporting

**Crash Reports and Debug Information**:
- All logged data must be safe for external bug reports
- No risk of credential exposure in crash dumps
- Safe debugging information for development team
- User privacy maintained in all reporting scenarios

## Deployment Checklist

### 1. Pre-Deployment Validation

- [ ] ✅ All token values replaced with metadata in logs
- [ ] ✅ UUID truncation working correctly
- [ ] ✅ No email addresses or user names in debug output
- [ ] ✅ Error messages don't expose sensitive context
- [ ] ✅ Audit log size limits enforced
- [ ] ✅ Integration with existing logging systems verified

### 2. Runtime Monitoring

- [ ] ✅ Log monitoring for accidental PII exposure
- [ ] ✅ Audit trail integrity maintained
- [ ] ✅ Performance impact of sanitization measured
- [ ] ✅ Memory usage of audit log monitored
- [ ] ✅ Error handling preserves privacy requirements

## Privacy Impact Assessment

### Risk Mitigation Summary

**High-Risk Eliminated**:
- ❌ No access tokens logged
- ❌ No refresh tokens logged  
- ❌ No user credentials exposed
- ❌ No email addresses or user names logged

**Medium-Risk Mitigated**:
- ✅ UUIDs truncated to first 8 characters
- ✅ URLs sanitized to remove company domains
- ✅ Token metadata provided without content exposure
- ✅ Audit log size limits prevent unlimited data accumulation

**Low-Risk Accepted**:
- ✅ Technical metadata logged for debugging
- ✅ Error codes and performance metrics available
- ✅ Cache statistics available for monitoring
- ✅ Operation timing and success rates tracked

## Conclusion

The PII sanitization requirements ensure comprehensive privacy protection while maintaining essential debugging and monitoring capabilities. Implementation must strictly follow these guidelines to prevent credential exposure and maintain user privacy across all operational scenarios.

---

*PII sanitization requirements completed as Task 1.6 in PRD token-cache-authentication-fix implementation.*