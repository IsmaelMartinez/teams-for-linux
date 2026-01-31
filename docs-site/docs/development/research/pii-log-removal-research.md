# PII Log Removal Research

**Date:** 2026-01-31
**Status:** Research Complete, Ready for Implementation
**Issue/Context:** Improve logging hygiene by removing/redacting Personally Identifiable Information (PII) from all logs

## Executive Summary

This research investigates implementing PII redaction in Teams for Linux logging. The codebase currently has **42 files** with logging statements and **documented PII protection goals** in security architecture, but **implementation is inconsistent**. A centralized sanitization utility with pattern-based redaction can address this gap effectively.

**Key Findings:**

- Current logging uses `electron-log` v5.4.3 with file logging disabled by default
- **HIGH-RISK** PII exposure: MQTT credentials, password commands, API endpoints
- Only one file (`tokenCache.js`) has any sanitization (UUID masking)
- Several npm libraries exist for PII redaction (redact-pii, @redactpii/node)
- Implementation effort: **Medium** (8-16 hours across 2-3 phases)

## Current State Analysis

### Logging Infrastructure

**Framework:** `electron-log` v5.4.3
**Configuration:** `app/config/logger.js`
**Default behavior:** Console logging at INFO level, file logging disabled

```javascript
// Default configuration from app/config/index.js
{
  "logConfig": {
    "transports": {
      "console": { "level": "info" },
      "file": { "level": false }  // Disabled by default
    }
  }
}
```

### Files with Logging (42 total)

| Category | Files | Example Concerns |
|----------|-------|------------------|
| **Authentication/Tokens** | 5 | Password commands, SSO flow, token operations |
| **MQTT** | 3 | Broker URLs, usernames, topics, client IDs |
| **APIs/Network** | 4 | Graph API endpoints, error responses, headers |
| **System Integration** | 8 | Certificate fingerprints, screen sharing, idle state |
| **UI/Rendering** | 10 | Window operations, tray icons, notifications |
| **Browser Tools** | 12 | DOM interactions, settings, module initialization |

### Current PII Exposure Risk Assessment

#### HIGH RISK - Immediate Attention Required

| Data Type | File | Line(s) | Example |
|-----------|------|---------|---------|
| MQTT broker URL | `app/mqtt/index.js` | 69, 84 | Full broker connection string |
| MQTT username | `app/mqtt/index.js` | 86 | Plaintext username |
| MQTT topics | `app/mqtt/index.js` | 181, 205 | Topic prefix + status topics |
| Password command | `app/login/index.js` | 46 | SSO password retrieval command |
| Request headers | `app/intune/index.js` | 254 | Custom headers with auth info |

#### MEDIUM RISK - Should Address

| Data Type | File | Line(s) | Example |
|-----------|------|---------|---------|
| API endpoints | `app/graphApi/index.js` | 103, 133 | Graph API URLs with queries |
| Error messages | `app/graphApi/index.js` | 137-140 | Raw API error responses |
| Certificate fingerprints | `app/certificate/index.js` | 25-30 | CA certificate details |
| SSO accounts | `app/intune/index.js` | 80-120 | Account type, count info |
| Custom service URLs | `app/customBackground/index.js` | 74, 89 | Background service endpoints |

#### LOW RISK - Currently Acceptable

- Status codes and message counts
- Feature flags and configuration booleans
- Performance metrics and timestamps
- UI state indicators

### Existing Sanitization (Limited)

Only `app/browser/tools/tokenCache.js` has any sanitization:

```javascript
// Lines 348-354
_sanitizeKey(key) {
  return key.replaceAll(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    (match) => `${match.substr(0, 8)}...`
  );
}
```

**Coverage:** 2 uses in 1 file out of 42 files with logging.

## PII Redaction Approaches

### Approach 1: Custom Sanitization Utility (Recommended)

Create a centralized `app/utils/logSanitizer.js` module with regex patterns for common PII.

**Pros:**

- No additional dependencies
- Full control over patterns
- Lightweight and fast
- Easy to customize for this codebase

**Cons:**

- Requires maintenance of patterns
- May miss edge cases

**Implementation:**

```javascript
// app/utils/logSanitizer.js
const PII_PATTERNS = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  uuid: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
  password: /password[=:]\s*['"]?[^'"\s]+['"]?/gi,
  token: /bearer\s+[a-zA-Z0-9._-]+/gi,
  ipAddress: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  mqttUrl: /(mqtt[s]?:\/\/)[^:]+:[^@]+@/gi,
  urlQueryParams: /\?[^\s]+/g,
};

function sanitize(message) {
  if (typeof message !== 'string') {
    message = JSON.stringify(message);
  }

  let sanitized = message;

  // Email → ***@***.***
  sanitized = sanitized.replace(PII_PATTERNS.email, '[EMAIL_REDACTED]');

  // UUID → first 8 chars...
  sanitized = sanitized.replace(PII_PATTERNS.uuid, (m) => `${m.slice(0, 8)}...`);

  // MQTT URLs → hide credentials
  sanitized = sanitized.replace(PII_PATTERNS.mqttUrl, '$1[CREDENTIALS]@');

  // Password values → [REDACTED]
  sanitized = sanitized.replace(PII_PATTERNS.password, 'password=[REDACTED]');

  // Bearer tokens → [TOKEN]
  sanitized = sanitized.replace(PII_PATTERNS.token, 'Bearer [TOKEN_REDACTED]');

  // Query params (may contain tokens) → [PARAMS]
  sanitized = sanitized.replace(PII_PATTERNS.urlQueryParams, '?[PARAMS_REDACTED]');

  return sanitized;
}

module.exports = { sanitize };
```

### Approach 2: Use @redactpii/node Library

**Package:** [@redactpii/node](https://www.npmjs.com/package/@redactpii/node)

**Features:**

- Zero dependencies
- Sub-millisecond performance
- Built-in patterns for emails, SSNs, credit cards, phone numbers
- Custom rule support
- Offline operation (no API calls)

**Pros:**

- Battle-tested patterns
- Maintained by third party
- Optional SOC 2/HIPAA audit log integration

**Cons:**

- Additional dependency
- May be overkill for this use case
- Patterns may not match all Teams-specific PII

**Usage:**

```javascript
const { redact } = require('@redactpii/node');

const cleanMessage = redact(logMessage, {
  customRules: [
    { pattern: /mqtt[s]?:\/\/[^\s]+/gi, replacement: '[MQTT_URL_REDACTED]' }
  ]
});
```

### Approach 3: Pino with Built-in Redaction

**Package:** [pino](https://github.com/pinojs/pino)

**Features:**

- Native redaction via path configuration
- Excellent performance (2% overhead)
- Structured JSON logging

**Consideration:** Would require replacing `electron-log` entirely.

**Pros:**

- Industry-standard solution
- Built-in redaction
- Great for structured logs

**Cons:**

- Breaking change - replaces existing logging
- More configuration complexity
- Overkill for current needs

**Not Recommended** for this project due to migration effort.

## Recommended Implementation Plan

### Phase 1: Create Sanitization Utility (4-6 hours)

1. Create `app/utils/logSanitizer.js` with common PII patterns
2. Add unit tests for sanitization patterns
3. Document patterns and usage

**Files to create:**

- `app/utils/logSanitizer.js`
- `app/utils/logSanitizer.test.js` (if test framework exists)

### Phase 2: Integrate with Logger (2-4 hours)

1. Wrap `electron-log` with sanitization layer
2. Apply sanitization to all log transports

**Approach A - Custom Transport Hook:**

```javascript
// app/config/logger.js
const { sanitize } = require('../utils/logSanitizer');

// Hook into electron-log
log.hooks.push((message, transport) => {
  if (transport.name === 'file' || transport.name === 'console') {
    message.data = message.data.map(item => sanitize(item));
  }
  return message;
});
```

**Approach B - Wrapper Functions:**

```javascript
// app/utils/safeLogger.js
const log = require('electron-log');
const { sanitize } = require('./logSanitizer');

module.exports = {
  info: (...args) => log.info(...args.map(sanitize)),
  warn: (...args) => log.warn(...args.map(sanitize)),
  error: (...args) => log.error(...args.map(sanitize)),
  debug: (...args) => log.debug(...args.map(sanitize)),
};
```

### Phase 3: Audit and Fix High-Risk Files (4-6 hours)

Priority files requiring review and fixes:

1. **`app/mqtt/index.js`** - Remove/redact broker credentials, username, topics
2. **`app/login/index.js`** - Remove password command logging entirely
3. **`app/intune/index.js`** - Limit error message details, remove headers
4. **`app/graphApi/index.js`** - Sanitize error responses
5. **`app/certificate/index.js`** - Remove certificate fingerprint details
6. **`app/customBackground/index.js`** - Redact custom service URLs

### Phase 4: Documentation and Guidelines (2-3 hours)

1. Update security architecture documentation
2. Create logging guidelines in contributing guide
3. Add pre-commit hook or ESLint rule to detect common PII patterns

## Effort Estimation

| Phase | Effort | Priority |
|-------|--------|----------|
| Phase 1: Sanitization Utility | 4-6 hours | HIGH |
| Phase 2: Logger Integration | 2-4 hours | HIGH |
| Phase 3: Fix High-Risk Files | 4-6 hours | HIGH |
| Phase 4: Documentation | 2-3 hours | MEDIUM |
| **Total** | **12-19 hours** | |

## Testing Strategy

### Unit Tests

- Test each PII pattern individually
- Test edge cases (partial matches, nested objects)
- Test performance with large log messages

### Integration Tests

- Verify logs don't contain redacted patterns
- Test that essential debugging info is preserved

### Manual Testing

- Enable file logging temporarily
- Perform actions that trigger sensitive logging
- Grep log files for PII patterns

## GDPR Compliance Considerations

Based on [GDPR logging best practices](https://www.mezmo.com/blog/best-practices-for-gdpr-logging):

1. **Data Minimization:** Only log necessary information
2. **Anonymization:** Mask identifiers before storage
3. **Retention:** Implement log rotation and deletion policies
4. **Access Control:** Restrict access to log files
5. **Encryption:** Consider encrypting log files at rest

The current implementation with file logging disabled by default is GDPR-friendly. When users enable file logging, they should be warned about potential PII exposure.

## Configuration Options to Consider

```javascript
// Potential new config options
{
  "logConfig": {
    "sanitizePii": true,  // Enable PII sanitization (default: true)
    "piiPatterns": {      // Custom patterns to redact
      "customField": "/custom-regex/gi"
    },
    "retentionDays": 7    // Auto-delete logs older than N days
  }
}
```

## Alternative Considered: Structured Logging

Instead of string-based sanitization, adopt structured logging where sensitive fields are explicitly excluded:

```javascript
// Instead of:
log.info(`Connected to MQTT broker: ${brokerUrl} as ${username}`);

// Use:
log.info('Connected to MQTT broker', {
  connected: true,
  broker: '[CONFIGURED]'  // Don't log actual URL
});
```

This requires more code changes but is more robust long-term.

## Recommendations

1. **Immediate:** Implement Phase 1-2 (Sanitization utility + Logger integration)
2. **Short-term:** Complete Phase 3 (Fix high-risk files)
3. **Ongoing:** Add logging guidelines to contributing documentation
4. **Future:** Consider structured logging migration for new code

## Clarification Needed

The original request mentioned "personio" - I was unable to find a logging/PII library by this name. Possible interpretations:

- **Pino** (logging library with built-in redaction) - Not recommended due to migration effort
- **Personio** (HR software company) - May have internal tools but none publicly available
- **Custom terminology** - Please clarify if this refers to a specific pattern or approach

## References

### Libraries

- [@redactpii/node](https://www.npmjs.com/package/@redactpii/node) - Fast regex-based PII redaction
- [redact-pii](https://www.npmjs.com/package/redact-pii) - Original PII redaction library
- [Pino Redaction](https://github.com/pinojs/pino/blob/main/docs/redaction.md) - Built-in Pino redaction

### Best Practices

- [NodeJS: Redacting Secrets from Pino Logs](https://dev.to/francoislp/nodejs-best-practices-redacting-secrets-from-your-pino-logs-1eik)
- [GDPR Logging Best Practices](https://www.mezmo.com/blog/best-practices-for-gdpr-logging)
- [Best Logging Practices for Sensitive Data](https://betterstack.com/community/guides/logging/sensitive-data/)
- [GDPR-Compliant Logging JavaScript Checklist](https://www.bytehide.com/blog/gdpr-compliant-logging-a-javascript-developers-checklist)

### Related Documentation

- [Security Architecture](../security-architecture.md) - Current security controls
- [Token Cache Architecture](../token-cache-architecture.md) - PII handling for tokens
- [Log Configuration](../log-config.md) - Current logging configuration

## Next Steps

1. Review and approve this research document
2. Create implementation tasks for each phase
3. Begin Phase 1: Sanitization utility development
4. Update security architecture documentation to reflect planned improvements
