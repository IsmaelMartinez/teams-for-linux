# PII Log Removal Research

**Date:** 2026-01-31 (Updated: 2026-02-01)
**Status:** Phase 2 Implemented
**Issue/Context:** Improve logging hygiene by removing/redacting Personally Identifiable Information (PII) from all logs

## Executive Summary

This research investigates implementing PII redaction in Teams for Linux logging. The codebase currently has **42 files** with logging statements and **documented PII protection goals** in security architecture, but **implementation is inconsistent**. A centralized sanitization utility with pattern-based redaction can address this gap effectively.

**Key Findings:**

- Current logging uses `electron-log` v5.4.3 with file logging disabled by default
- **HIGH-RISK** PII exposure: MQTT credentials, password commands, API endpoints
- Only one file (`tokenCache.js`) has any sanitization (UUID masking)
- **Excessive verbosity:** ~590 log statements in app code, many could be removed or demoted
- Multiple approaches evaluated: custom regex, Microsoft Presidio, PII-PALADIN, @redactpii/node
- **Recommended:** Custom regex utility (no dependencies, fast, full control)
- Implementation effort: **Medium** (16-24 hours across 5 phases)

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
| MQTT broker URL | `app/mqtt/index.js` | 69 | Full broker connection string |
| MQTT topics | `app/mqtt/index.js` | 84, 86, 146, 181, 205 | Topic prefix + status/command topics |
| MQTT payload | `app/mqtt/index.js` | 146 | Published message content |
| Password command | `app/login/index.js` | 45 | SSO password retrieval command |
| Request headers | `app/intune/index.js` | 253 | SSO credential info |

**Note:** MQTT username/password are in connection options but NOT logged directly (good practice).

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

## Comprehensive Log Audit

### Log Statement Count by File

A complete audit of all `console.log/debug/info/warn/error` statements reveals **~590 log statements** in app code (excluding scripts, tests, and documentation examples).

#### Most Verbose Files (Candidates for Reduction)

| File | Log Count | Category | Recommendation |
|------|-----------|----------|----------------|
| `app/browser/tools/mqttStatusMonitor.js` | 26 | Debug | Reduce to 3-4 key state changes |
| `app/screenSharing/injectedScreenSharing.js` | 22 | Debug | Keep 5-6 essential, remove rest |
| `app/browser/tools/reactHandler.js` | 21 | Debug | Reduce to errors + key events |
| `app/mqtt/index.js` | 21 | Mixed | Keep errors, sanitize/remove PII |
| `app/mainAppWindow/index.js` | 20 | Mixed | Reduce debug, keep errors |
| `app/browser/preload.js` | 20 | Mixed | Reduce startup verbosity |
| `app/intune/index.js` | 20 | Debug | Keep errors, remove PII |
| `app/cacheManager/index.js` | 17 | Debug | Reduce file operation logs |
| `app/browser/tools/tokenCache.js` | 16 | Debug | Keep errors only |
| `app/globalShortcuts/index.js` | 11 | Mixed | Keep registration status |
| `app/browser/tools/mutationTitle.js` | 11 | Debug | Reduce to 2-3 logs |
| `app/browser/tools/navigationButtons.js` | 10 | Debug | Remove most, keep errors |
| `app/notifications/service.js` | 9 | Debug | Reduce to errors only |
| `app/config/index.js` | 9 | Info | Keep config path, reduce rest |
| `app/browser/tools/activityHub.js` | 9 | Debug | Reduce state logging |

#### Log Level Distribution (App Code)

| Level | Count | Percentage | Assessment |
|-------|-------|------------|------------|
| `console.debug` | ~320 | 54% | **Too verbose** - most should be removed |
| `console.info` | ~95 | 16% | Some could be debug level |
| `console.warn` | ~85 | 14% | Appropriate |
| `console.error` | ~75 | 13% | Appropriate |
| `console.log` | ~15 | 3% | Should be converted to appropriate level |

### Detailed PII Audit by File

#### HIGH RISK - Contains Sensitive Data

| File | Line | Log Statement | PII Type | Action |
|------|------|---------------|----------|--------|
| `app/mqtt/index.js` | 69 | `Connecting to broker: ${this.config.brokerUrl}` | Broker URL | **Remove URL** |
| `app/mqtt/index.js` | 84, 86 | `Subscribed to command topic: ${commandTopic}` | Topic name | **Sanitize** |
| `app/mqtt/index.js` | 146 | `Published to ${topic}: ${payloadString...}` | Topic + payload | **Sanitize** |
| `app/mqtt/index.js` | 181 | `Published status...on topic: ${topic}` | Topic name | **Sanitize** |
| `app/mqtt/index.js` | 205 | `Published to topic: ${fullTopic}` | Topic name | **Sanitize** |
| `app/login/index.js` | 45 | Logs password command | Credentials | **Remove entirely** |
| `app/certificate/index.js` | 25-27 | Logs cert issuer, fingerprint | Security info | **Remove details** |
| `app/intune/index.js` | 80-120 | Multiple account logging | Account info | **Reduce to counts** |
| `app/intune/index.js` | 253 | `SSO credential added` | Auth info | **Remove** |
| `app/customBackground/index.js` | 74, 89 | `Forwarding '${details.url}' to...` | Custom URLs | **Sanitize** |
| `app/mainAppWindow/index.js` | 510-511 | DEBUG intercepted URLs | URL + headers | **Remove** |

**Note:** MQTT username/password are passed in connection options but are NOT directly logged (good).

#### MEDIUM RISK - Could Expose Indirect PII

| File | Line | Concern | Action |
|------|------|---------|--------|
| `app/graphApi/index.js` | 103, 133 | API endpoints with queries | Sanitize query params |
| `app/browser/tools/activityHub.js` | 61 | Logs `document.body.innerHTML` | **Remove - may contain PII** |
| `app/mainAppWindow/index.js` | 641 | `Requesting to open '${details.url}'` | External URLs | Sanitize |
| `app/browser/tools/tokenCache.js` | Various | Token cache key logging | Already sanitized (good) |

#### LOW RISK - Safe Logs

- Status indicators (available, busy, away)
- Feature flags and boolean config
- Error codes without sensitive context
- UI state changes (window focus, zoom level)
- Module initialization confirmations

### Verbosity Reduction Recommendations

#### Tier 1: Remove Entirely (~150 logs)

Logs that provide no value in production:

```javascript
// REMOVE: Redundant state logging
console.debug('[MQTT Status] Strategy 0: Checking React internals...');
console.debug('[MQTT Status] Strategy 1: Checking CSS selectors...');
console.debug('[MQTT Status] Strategy 2: Checking me-control button...');
// ... (26 strategy logs in mqttStatusMonitor.js alone)

// REMOVE: Per-operation file logging
console.debug("Removed file:", cleanupPath);
console.debug("Skipping inaccessible file:", ...);

// REMOVE: Navigation button injection details
console.debug('Navigation buttons already exist');
console.debug('Found search navigation region...');
```

#### Tier 2: Demote to Trace/Verbose (~100 logs)

Logs useful only for deep debugging:

```javascript
// DEMOTE: Screen sharing diagnostics
console.debug(`[SCREEN_SHARE_DIAG] Stream registered (${activeStreams.length} total active)`);

// DEMOTE: React handler internals
console.debug('[ReactHandler] Found presenceService:', Object.keys(presenceService));

// DEMOTE: Config loading details
console.debug("configFile:", configObject.configFile);
```

#### Tier 3: Keep but Sanitize (~50 logs)

Essential logs that need PII removal:

```javascript
// SANITIZE: MQTT connection (remove URL)
console.info('[MQTT] Connected to broker'); // Remove URL

// SANITIZE: Custom background URLs
console.debug('Forwarding request to custom background service'); // Remove actual URL

// SANITIZE: API errors
console.error('[API] Request failed:', sanitizedError); // Remove query params
```

#### Tier 4: Keep As-Is (~290 logs)

Appropriate logs:
- Errors with safe context
- Security warnings
- Feature initialization confirmations
- Window lifecycle events

## Log Reduction Implementation Plan

### Phase 5: Log Verbosity Reduction (4-6 hours)

**Priority 1 - High volume debug removal:**

1. `app/browser/tools/mqttStatusMonitor.js` - Reduce 26 → 4 logs
2. `app/screenSharing/injectedScreenSharing.js` - Reduce 22 → 6 logs
3. `app/browser/tools/reactHandler.js` - Reduce 21 → 8 logs
4. `app/cacheManager/index.js` - Reduce 17 → 5 logs

**Priority 2 - Consolidate repetitive logs:**

1. Replace per-item logs with summary logs
2. Use structured logging for batch operations
3. Add log level configuration per module

**Example transformation:**

```javascript
// BEFORE: 26 individual debug logs
console.debug('[MQTT Status] Strategy 0: Checking React internals...');
console.debug('[MQTT Status] Found presenceService:', keys);
console.debug('[MQTT Status] Strategy 1: Checking CSS selectors...');
// ... 23 more

// AFTER: 2 summarized logs
console.debug('[MQTT Status] Checking status via strategies: react, css, title');
console.debug('[MQTT Status] Status detected:', status, 'via:', strategy);
```

## Configuration Obfuscation (Future Improvement)

### Problem

Sensitive configuration values are logged during startup and debugging:

- MQTT broker URLs with credentials
- Custom service endpoints
- SSO configuration details
- API keys in error messages

### Proposed Solution

Create a configuration sanitizer that masks sensitive fields before logging:

```javascript
// app/utils/configSanitizer.js
const SENSITIVE_KEYS = [
  'brokerUrl', 'mqttPassword', 'mqttUsername',
  'customBackgroundUrl', 'ssoPassword', 'authToken',
  'clientSecret', 'apiKey'
];

function sanitizeConfig(config) {
  const sanitized = { ...config };

  for (const key of Object.keys(sanitized)) {
    if (SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
      sanitized[key] = '[CONFIGURED]';
    } else if (typeof sanitized[key] === 'object') {
      sanitized[key] = sanitizeConfig(sanitized[key]);
    }
  }

  return sanitized;
}

module.exports = { sanitizeConfig, SENSITIVE_KEYS };
```

### Usage

```javascript
const { sanitizeConfig } = require('./utils/configSanitizer');

// Safe to log
console.info('Configuration loaded:', sanitizeConfig(config));
// Output: { brokerUrl: '[CONFIGURED]', mqttUsername: '[CONFIGURED]', trayIcon: true, ... }
```

### Config Display Options

Consider adding a user-facing config display feature:

```javascript
// Show config with sensitive values hidden (for support/debugging)
ipcMain.handle('get-safe-config', () => {
  return sanitizeConfig(appConfig);
});
```

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
  // Note: [^"'\s] prevents matching beyond quotes in JSON strings
  urlQueryParams: /\?[^"'\s]+/g,
};

function sanitize(message) {
  if (typeof message !== 'string') {
    message = JSON.stringify(message);
  }

  let sanitized = message;

  // Email → [EMAIL_REDACTED]
  sanitized = sanitized.replace(PII_PATTERNS.email, '[EMAIL_REDACTED]');

  // IP Address → [IP_REDACTED]
  sanitized = sanitized.replace(PII_PATTERNS.ipAddress, '[IP_REDACTED]');

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

### Approach 3: Microsoft Presidio

**Repository:** [microsoft/presidio](https://github.com/microsoft/presidio)

Microsoft Presidio is an open-source framework for identifying and de-identifying sensitive data using Named Entity Recognition (NER), regular expressions, rule-based logic, and checksums.

**Features:**

- Detects PII including credit cards, names, locations, SSNs, phone numbers
- Multiple de-identification techniques: redaction, masking, anonymization
- Processes text, images, and structured data
- Contextual awareness across multiple languages

**Architecture:**

- **Presidio Analyzer** - Detects PII entities
- **Presidio Anonymizer** - Applies anonymization strategies
- Runs as Docker containers exposing REST APIs

**Integration for Node.js:**

```javascript
// Call Presidio REST API from Node.js
const response = await fetch('http://localhost:5002/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: logMessage,
    language: 'en'
  })
});
```

**Pros:**

- Enterprise-grade, Microsoft-maintained
- Excellent NER-based detection (catches names, locations, organizations)
- Highly customizable with custom recognizers
- MIT licensed

**Cons:**

- Python-based - requires Docker containers for Node.js integration
- Adds significant infrastructure complexity (2 containers needed)
- Network latency for each log sanitization call
- Overkill for logging use case - designed for batch processing

**Verdict:** Not recommended for real-time log sanitization due to architecture mismatch, but excellent for batch log analysis or compliance auditing.

### Approach 4: PII-PALADIN (Node.js NER + Regex)

**Package:** [pii-paladin](https://github.com/jeeem/PII-PALADIN)

A Node.js package combining a pre-trained BERT NER model with regex patterns for comprehensive PII detection.

**Features:**

- Hybrid approach: NER model + regex patterns
- Detects names, organizations, locations (NER) + SSNs, credit cards, emails, phones (regex)
- Fully offline - no API calls
- Simple API: `await censorPII(text)` returns sanitized string

**Usage:**

```javascript
import { censorPII } from 'pii-paladin';

const text = "Contact John Doe at john.doe@example.com";
const censored = await censorPII(text);
// Output: Contact [CENSORED] at [CENSORED]
```

**Pros:**

- Native Node.js - no Docker required
- NER catches names that regex misses
- Fully offline operation
- Active maintenance (v2.0.2 published recently)

**Cons:**

- **~90MB bundle size** (includes ML models) - significant for Electron app
- Slower than regex-only (ML inference overhead)
- Node.js server-side only (not for browser)
- Does not reliably detect dates or contextually ambiguous PII

**Lighter Alternative:** `pii-paladin-lite` (~5KB) - regex-only version for browsers/smaller footprint.

**Verdict:** Good option if NER-based name detection is critical. Consider `pii-paladin-lite` for smaller footprint.

### Approach 5: Pino with Built-in Redaction

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

**Verdict:** Not recommended for this project due to migration effort.

## Approach Comparison Matrix

| Approach | Bundle Size | Performance | NER Support | Complexity | Recommendation |
|----------|-------------|-------------|-------------|------------|----------------|
| Custom Regex Utility | 0 KB | Fast | No | Low | **Recommended** |
| @redactpii/node | ~50 KB | Fast | No | Low | Good alternative |
| Microsoft Presidio | Docker | Slow (network) | Yes | High | Not for logging |
| PII-PALADIN | ~90 MB | Medium | Yes | Medium | If NER needed |
| PII-PALADIN Lite | ~5 KB | Fast | No | Low | Good alternative |
| Pino | ~100 KB | Fast | No | High | Not recommended |

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
| Phase 5: Log Verbosity Reduction | 4-6 hours | MEDIUM |
| **Total** | **16-25 hours** | |

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
2. **Short-term:** Complete Phase 3 (Fix high-risk files - especially MQTT, login, intune)
3. **Medium-term:** Complete Phase 5 (Reduce verbosity - target 50% reduction in debug logs)
4. **Ongoing:** Add logging guidelines to contributing documentation and CLAUDE.md
5. **Future:** Implement config obfuscation utility for safe config display
6. **Future:** Consider structured logging migration for new code

### Decision Matrix

Based on this research, the recommended approach is:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **PII Redaction Library** | Custom regex utility | Zero dependencies, fast, full control |
| **Log Reduction Target** | 50% of debug logs | ~150 logs can be removed entirely |
| **Config Obfuscation** | Future phase | Lower priority than log sanitization |
| **Structured Logging** | Not now | Too much migration effort for current benefit |

## References

### Libraries

- [Microsoft Presidio](https://github.com/microsoft/presidio) - Enterprise PII detection with NER (Python/Docker)
- [PII-PALADIN](https://github.com/jeeem/PII-PALADIN) - Node.js NER + regex hybrid (~90MB)
- [pii-filter](https://github.com/HabaneroCake/pii-filter) - JavaScript PII filter
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

1. ~~Review and approve this research document~~ ✅
2. ~~Create implementation tasks for each phase~~ ✅
3. ~~Begin Phase 1: Sanitization utility development~~ ✅ (PR #2116)
4. ~~Phase 2: Logger integration via electron-log hooks~~ ✅
5. **Phase 3: Apply sanitization to high-risk files** (MQTT, login, intune, certificate)
6. Update security architecture documentation to reflect completed improvements
