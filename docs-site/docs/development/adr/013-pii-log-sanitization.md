---
id: 013-pii-log-sanitization
---

# ADR 013: PII Log Sanitization

## Status

Implemented (Phase 1)

## Context

The codebase has ~590 log statements across 42 files. Audit revealed HIGH-RISK PII exposure in MQTT credentials, password commands, and API endpoints. Only one file (`tokenCache.js`) had any sanitization. File logging is disabled by default, but when enabled, sensitive data could leak.

## Decision

Use custom regex-based sanitization utility (`app/utils/logSanitizer.js`) instead of third-party libraries.

**Pattern replacement order** (specific before general):
1. MQTT URLs → preserve protocol, redact credentials
2. Bearer tokens → `Bearer [TOKEN]`
3. Passwords, auth headers, API keys, tokens, secrets → `[REDACTED]`
4. Certificate fingerprints → preserve label, redact value
5. Emails → `[EMAIL]`
6. UUIDs → keep first 8 chars for correlation
7. IP addresses → `[IP]`
8. URL query params → `?[PARAMS]`
9. User paths → preserve structure, redact username

## Consequences

### Positive
- Zero dependencies, fast execution
- Full control over patterns
- UUIDs remain correlatable for debugging

### Negative
- Requires pattern maintenance
- May miss edge cases (regex-only, no NER)

### Implementation Phases
1. **Done**: Sanitizer utility + tests
2. **Next**: Logger integration via electron-log hooks
3. **Later**: Apply to high-risk files (MQTT, login, intune)

## Alternatives Considered

| Option | Rejected Because |
|--------|------------------|
| Microsoft Presidio | Requires Docker, network latency |
| PII-PALADIN | 90MB bundle size |
| @redactpii/node | Additional dependency, less control |
| Pino with redaction | Would require replacing electron-log |

## Related

- Research: `docs-site/docs/development/research/pii-log-removal-research.md`
- Implementation: `app/utils/logSanitizer.js`
