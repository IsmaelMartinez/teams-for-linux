# Code Quality and Hardening Research

:::info Incremental Improvement
This document identifies areas where the codebase can be incrementally hardened. Most items are best-practice improvements rather than urgent issues. The project already has a solid security foundation including IPC channel allowlisting, CSP headers, MQTT command whitelisting, and PII logging guidelines (ADR-013).
:::

**Created**: 2026-02-15
**Updated**: 2026-02-15
**Status**: Phase 1 implemented, CI/CD items remaining
**Method**: Multi-agent review with 4-persona validation (security, product, maintainer, DevOps)

## Executive Summary

A comprehensive review of the codebase identified several areas where existing practices can be tightened. The findings fall into three broad categories: input handling improvements, logging hygiene, and resilience gaps. None of these represent active exploits or known incidents -- they are the kind of incremental improvements that mature projects adopt over time to reduce surface area and improve reliability.

The review also confirmed that several aspects of the codebase are already well-designed. The MQTT command system uses proper JSON validation and action whitelisting. The IPC validator enforces a channel allowlist. The CSP headers provide meaningful restrictions. The project's PII logging guidelines (ADR-013, CLAUDE.md) are thorough, though a handful of older log statements predate them.

### Implementation Status

**Phase 1** (all code-level items) was implemented in a single PR. During review, two findings from the original research were revised:

1. **SSO `execFileSync` swap was reverted** — The original recommendation to switch from `execSync` to `execFileSync` would break existing user configurations that rely on shell features (pipes, variable expansion, quoted arguments). Since the command comes entirely from the user's own config file, there is no command injection risk from untrusted input. The PII log removal (no longer logging the command string) was kept.

2. **Certificate fingerprint was preserved in logs** — The original recommendation removed the certificate fingerprint from error logs. During review, this was identified as a usability regression: enterprise users need the fingerprint value to configure `customCACertsFingerprints`. A certificate fingerprint identifies a certificate, not a person, so it is not PII. The URL and issuer name (which could reveal organizational details) remain removed.

**Remaining items:** CI/CD additions (lint/audit in build workflow, Dependabot/Renovate).

---

## Findings

### Input Handling Improvements

Two areas in the codebase pass external input to system commands and would benefit from stricter validation.

~~The SSO password retrieval in `app/login/index.js` runs a user-configured command using a shell-based API. The more targeted `execFileSync()` API would be a better fit since it avoids shell interpretation entirely.~~ **Revised:** During implementation review, the `execFileSync` swap was found to be a breaking change. Naive whitespace splitting of the command string breaks shell features (pipes, variable expansion, quoted arguments) that users depend on. Since the command comes from the user's own config file, there is no injection risk from untrusted input. **Resolution:** Kept `execSync` but removed the PII log (no longer logs the command string). The debug log now uses a generic message instead.

The incoming call notification handler in `app/mainAppWindow/browserWindowManager.js` passes caller information from Teams messages as arguments to a user-configured notification command via `spawn()`. Since `spawn()` does not invoke a shell, this is safer than it might initially appear. ✅ **Implemented:** Added `sanitizeCommandArg()` method that validates string type, limits length to 500 characters, and strips control characters before passing to `spawn()`.

### Logging Hygiene

The project established clear PII logging guidelines in ADR-013 and CLAUDE.md. A few older log statements predate these guidelines and should be brought into alignment.

✅ **Implemented:** The title mutation observer in `app/browser/tools/mutationTitle.js` no longer logs the title text (which contained message previews and sender names). It now logs only that a title change occurred, whether a regex match was found, and the extracted unread count.

✅ **Implemented:** `app/notificationSystem/index.js` no longer logs the notification title (which contained sender names).

✅ **Implemented (revised):** `app/certificate/index.js` — the URL and issuer name were removed from error logs. The certificate fingerprint was initially removed but **restored during review**: enterprise users need it to configure `customCACertsFingerprints`, and a fingerprint identifies a certificate, not a person. The error message now provides actionable guidance pointing users to the config option.

### Resilience Gaps

✅ **Implemented:** Top-level `uncaughtException` and `unhandledRejection` handlers added at the top of `app/index.js`. The `uncaughtException` handler logs the error and calls `process.exit(1)` (appropriate since process state is unknown after an uncaught exception). The `unhandledRejection` handler logs the error but allows the process to continue (consistent with Node.js default behavior for non-fatal rejections).

✅ **Implemented:** `handleAppReady()` in `app/index.js` is now wrapped with try/catch. On failure, the error is logged with a `[STARTUP]` prefix and the app quits gracefully via `app.quit()`.

✅ **Implemented:** All 7 Graph API IPC handlers in `app/graphApi/ipcHandlers.js` now have try/catch blocks. Errors return `{ success: false, error: error.message }`, consistent with the pattern used by MQTT and other IPC handlers in the codebase.

### Renderer Globals Cleanup

✅ **Implemented:** `globalThis.nodeRequire` and `globalThis.nodeProcess` removed from `app/browser/preload.js`. Codebase-wide grep confirmed zero references to these globals — they were dead code from early development.

### IPC Validator Enhancement

✅ **Implemented:** The IPC validator in `app/security/ipcValidator.js` now uses recursive `sanitizePayload()` to remove prototype pollution vectors from nested objects. The function has a configurable depth limit (`MAX_SANITIZE_DEPTH = 10`) that prevents stack overflow from deeply nested or circular payloads. Dangerous properties (`__proto__`, `constructor`, `prototype`) are stored in a `Set` for O(1) lookup.

### CI/CD Additions

The build workflow (`build.yml`) runs the full build and packaging pipeline but does not include `npm run lint` or `npm audit` steps. Linting is currently only enforced locally via pre-commit hooks. Adding both steps to CI would catch issues earlier and prevent vulnerable dependencies from shipping in releases.

The project does not currently use Dependabot or Renovate for automated dependency update PRs. Setting up one of these would reduce the manual overhead of tracking dependency updates.

### Documentation Maintenance

✅ **Implemented:** SECURITY.md updated from GitHub template boilerplate (5.1.x, 4.0.x) to accurate version numbers (2.7.x), with proper vulnerability reporting instructions via GitHub's private security advisory feature, and a link to the security architecture documentation.

---

## What Was Reviewed and Found Sound

Several areas were reviewed and found to be well-implemented, requiring no changes.

The MQTT command handling system uses JSON parsing with try/catch, validates command structure, and enforces an action whitelist before processing. The IPC channel allowlist in `ipcValidator.js` effectively restricts which channels can be used. The CSP headers in `browserWindowManager.js` provide appropriate restrictions given the application's need to load Teams web content. The connection manager has retry logic with method rotation. The configuration system's layered merging (system config, user config, CLI args, defaults) works correctly.

---

## Implementation Approach

### Phase 1 (Completed)

All code-level items were implemented in a single PR covering logging hygiene, resilience improvements, input handling, renderer cleanup, IPC validator enhancement, and SECURITY.md update. The changes span 10 files with a net +148/-72 lines.

**Key learnings from review:**

- **User-controlled inputs are not injection vectors.** The SSO password command comes from the user's own config file. Switching to `execFileSync` with naive whitespace splitting would break legitimate shell features (pipes, expansion, quotes) without preventing any real attack. When the user controls the input, the security boundary is the config file, not the command execution API.
- **Not all sensitive-looking data is PII.** Certificate fingerprints identify certificates, not people. Removing them from logs creates a usability regression for enterprise users who need the value to configure `customCACertsFingerprints`. The distinction between "data that identifies people" and "data that identifies systems" matters when applying PII guidelines.

### Remaining Work

The CI/CD items (lint/audit in build workflow, Dependabot/Renovate) were not part of Phase 1 and remain as future work. These are infrastructure changes rather than code changes and can be addressed independently.

---

## Related Documentation

- [ADR-013: PII Log Sanitization](../adr/013-pii-log-sanitization.md) - Established PII logging guidelines
- [Contributing Guide](../contributing.md) - Code standards and error handling patterns
- [IPC API Documentation](../ipc-api.md) - IPC channel documentation and patterns
- [Module Index](../module-index.md) - Codebase structure reference
