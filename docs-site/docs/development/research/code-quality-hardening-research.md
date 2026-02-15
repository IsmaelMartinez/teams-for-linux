# Code Quality and Hardening Research

:::info Incremental Improvement
This document identifies areas where the codebase can be incrementally hardened. Most items are best-practice improvements rather than urgent issues. The project already has a solid security foundation including IPC channel allowlisting, CSP headers, MQTT command whitelisting, and PII logging guidelines (ADR-013).
:::

**Created**: 2026-02-15
**Updated**: 2026-02-15
**Status**: Research complete, ready for incremental implementation
**Method**: Multi-agent review with 4-persona validation (security, product, maintainer, DevOps)

## Executive Summary

A comprehensive review of the codebase identified several areas where existing practices can be tightened. The findings fall into three broad categories: input handling improvements, logging hygiene, and resilience gaps. None of these represent active exploits or known incidents -- they are the kind of incremental improvements that mature projects adopt over time to reduce surface area and improve reliability.

The review also confirmed that several aspects of the codebase are already well-designed. The MQTT command system uses proper JSON validation and action whitelisting. The IPC validator enforces a channel allowlist. The CSP headers provide meaningful restrictions. The project's PII logging guidelines (ADR-013, CLAUDE.md) are thorough, though a handful of older log statements predate them.

---

## Findings

### Input Handling Improvements

Two areas in the codebase pass external input to system commands and would benefit from stricter validation.

The SSO password retrieval in `app/login/index.js` runs a user-configured command using a shell-based API. The more targeted `execFileSync()` API would be a better fit since it avoids shell interpretation entirely, passing the command directly to the OS. The command path comes from the user's own config file, so the practical risk is limited to scenarios where a config file is modified by a third party. The fix is a straightforward API swap with path validation.

The incoming call notification handler in `app/mainAppWindow/browserWindowManager.js` passes caller information from Teams messages as arguments to a user-configured notification command via `spawn()`. Since `spawn()` does not invoke a shell, this is safer than it might initially appear. Adding argument sanitization would be a defense-in-depth measure to guard against edge cases in whatever command the user has configured.

Both changes are small, focused, and unlikely to cause regressions.

### Logging Hygiene

The project established clear PII logging guidelines in ADR-013 and CLAUDE.md. A few older log statements predate these guidelines and should be brought into alignment.

The title mutation observer in `app/browser/tools/mutationTitle.js` logs Teams page titles at debug level. In Teams, page titles frequently include message previews, sender names, and chat content. The fix is straightforward: log that a title change occurred and the extracted unread count, without including the title text itself.

Similarly, `app/notificationSystem/index.js` logs notification titles at debug level, which can include sender names. And `app/certificate/index.js` logs certificate issuer names and fingerprints, which could reveal organizational details. These are all simple log message adjustments that don't change any functional behavior.

### Resilience Gaps

The application currently has no top-level handlers for `uncaughtException` or `unhandledRejection` events. If an unhandled error occurs anywhere in the process, Node.js will terminate silently with no diagnostic output. Adding handlers that log the error before the process exits would significantly improve the debugging experience for users reporting crashes.

The app startup entry point (`handleAppReady()` in `app/index.js`) has no try/catch wrapper. A failure during initialization currently produces no meaningful error message. Wrapping it provides a clear signal when startup fails and why.

The Graph API IPC handlers in `app/graphApi/ipcHandlers.js` lack try/catch blocks, meaning a network error or unexpected response could propagate as an unhandled rejection. The MQTT and other IPC handlers in the codebase already follow the try/catch pattern, so this is a matter of consistency.

These are all additive changes -- they add safety nets without modifying existing behavior.

### Renderer Globals Cleanup

The preload script at `app/browser/preload.js` exposes `globalThis.nodeRequire` and `globalThis.nodeProcess`. These were likely added during early development for browser tool access, but a codebase audit confirms that no browser tools actually reference these globals. They can be safely removed to tighten the renderer's access scope. Since nothing depends on them, this is a cleanup with no functional impact.

### IPC Validator Enhancement

The IPC validator in `app/security/ipcValidator.js` sanitizes prototype pollution vectors (`__proto__`, `constructor`, `prototype`) from payloads. The current implementation handles top-level properties but does not recurse into nested objects. For payloads that contain nested structures, adding recursive sanitization would close the gap. This is a targeted enhancement to an existing security mechanism.

### CI/CD Additions

The build workflow (`build.yml`) runs the full build and packaging pipeline but does not include `npm run lint` or `npm audit` steps. Linting is currently only enforced locally via pre-commit hooks. Adding both steps to CI would catch issues earlier and prevent vulnerable dependencies from shipping in releases.

The project does not currently use Dependabot or Renovate for automated dependency update PRs. Setting up one of these would reduce the manual overhead of tracking dependency updates.

### Documentation Maintenance

The SECURITY.md file contains GitHub template boilerplate with placeholder version numbers (5.1.x, 4.0.x) that don't correspond to the actual project versioning (2.7.x). Updating it with accurate supported versions and reporting instructions would help security researchers who want to report issues through proper channels.

---

## What Was Reviewed and Found Sound

Several areas were reviewed and found to be well-implemented, requiring no changes.

The MQTT command handling system uses JSON parsing with try/catch, validates command structure, and enforces an action whitelist before processing. The IPC channel allowlist in `ipcValidator.js` effectively restricts which channels can be used. The CSP headers in `browserWindowManager.js` provide appropriate restrictions given the application's need to load Teams web content. The connection manager has retry logic with method rotation. The configuration system's layered merging (system config, user config, CLI args, defaults) works correctly.

---

## Implementation Approach

These improvements are best done incrementally as small, independent PRs rather than as a single large change. Each finding is self-contained and can be implemented, reviewed, and tested in isolation. The risk profile is low across the board since the changes are either additive (error handlers), subtractive (removing unused globals), or surgical (log message adjustments, API swaps).

### Suggested Grouping

The findings naturally cluster into a few independent work items, each suitable for a single PR.

The logging hygiene items (mutationTitle, notificationSystem, certificate) can be bundled together as they all follow the same pattern of removing content from debug log messages. The error handling items (process handlers, handleAppReady wrapper, GraphAPI IPC try/catch) can be grouped as resilience improvements. The input handling items (login command API swap, spawn argument sanitization) form a natural pair. The remaining items (renderer globals cleanup, IPC validator recursion, CI additions, SECURITY.md update) are each small enough to be individual PRs.

### Compatibility with Roadmap

These improvements are complementary to the existing roadmap (v2.7.7 and v2.8.0 release plans) and can proceed in parallel with feature work. None of them conflict with the Screen Lock Media Privacy, Custom Notifications Phase 2, AppImage auto-update, or Electron 40 upgrade work streams.

---

## Related Documentation

- [ADR-013: PII Log Sanitization](../adr/013-pii-log-sanitization.md) - Established PII logging guidelines
- [Contributing Guide](../contributing.md) - Code standards and error handling patterns
- [IPC API Documentation](../ipc-api.md) - IPC channel documentation and patterns
- [Module Index](../module-index.md) - Codebase structure reference
