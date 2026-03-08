# Codebase Review (March 2026)

:::info Actionable Review
Comprehensive review of code quality, maintainability, performance, and developer experience.
:::

**Date:** 2026-03-07
**Scope:** Full repository audit across architecture, testing, performance, and DX
**Author:** Claude AI Assistant

---

## Executive Summary

The repository is in good shape for a community-maintained Electron wrapper. The recent refactoring of `app/index.js` has been largely successful, the documentation is extensive (18 ADRs, module READMEs in all 27 directories, thorough config docs), and the CI/CD pipeline builds for 6 platforms across 3 architectures. The review identified actionable improvements in four areas: performance overhead from DOM observers during meetings, testing gaps for key modules, a few architectural inconsistencies, and some developer experience papercuts.

---

## Performance: DOM Observers and Polling

Three patterns may create CPU overhead during normal use, especially during meetings. These need hands-on evaluation before any changes — Teams' React DOM is unpredictable and the observers may be necessary for reliable functionality.

### MutationObservers on document.body

The MQTT status monitor at `app/browser/tools/mqttStatusMonitor.js` lines 82-98 attaches a MutationObserver to `document.body` with `{ childList: true, subtree: true, attributes: true }`. Teams is a complex React application generating hundreds of DOM mutations per second during active use. Even with the 300ms debounce, the observer callback fires for every mutation to manage the timer, and the debounced handler runs 10+ `querySelector` calls. The React internals path (`detectStatusFromReact`) is described as "most reliable" and doesn't require DOM observation. The polling fallback at 10-second intervals is sufficient when React access is available, so the MutationObserver could be removed when the React path works.

The screen sharing module at `app/screenSharing/injectedScreenSharing.js` lines 304-319 attaches a similar observer with no debouncing at all. Every DOM mutation calls `processStopSharingButtons()`, which runs a complex multi-selector query and falls back to iterating every `<button>` element checking text against 37 translation strings. The periodic fallback at 5-second intervals already handles the same logic.

### timestampCopyOverride 1-second polling

At `app/browser/tools/timestampCopyOverride.js` line 8, a `setInterval` runs every 1000ms. Each tick traverses React fiber trees via `ReactHandler._getTeams2CoreServices()`, which calls `_validateTeamsEnvironment()` internally, performing domain validation, document checks, and React structure checks. This runs for the entire app lifetime. Exponential backoff (1s, 2s, 4s, up to 30s) or a one-shot approach after Teams loads would eliminate this overhead.

### nativeTheme listener leak

The `initSystemThemeFollow` function in `app/mainAppWindow/index.js` lines 434-448 registers a `nativeTheme.on("updated")` handler every time `did-finish-load` fires. After N page loads (including network reconnections and Teams navigation), each theme change triggers N duplicate IPC messages.

---

## Testing Gaps

The project has approximately 8.4% test-to-source ratio, with only 2 of 78 source modules having unit test coverage. The existing tests (logSanitizer, loggerHook) are well-written with thorough edge case coverage.

### Tests not wired into CI

The `test:unit` script in `package.json` hardcodes only `logSanitizer.test.js` and `loggerHook.test.js`. The files `meetingUrlValidation.test.js` and `meetupJoinRegEx.test.js` exist but never run automatically. Switching to `node --test tests/unit/` fixes this with auto-discovery.

### Untested key modules

The IPC security validator (`app/security/ipcValidator.js`) is the application's primary IPC boundary. It validates every IPC channel and sanitizes payloads against prototype pollution. The certificate validation module (`app/certificate/index.js`) makes accept/reject decisions for SSL certificates in corporate environments. The MQTT command handler (`app/mqtt/index.js`, `handleCommand` method) parses JSON from external network messages and validates actions against a whitelist. All three contain pure functions that are straightforward to unit test.

### E2E tests don't gate builds

In `.github/workflows/build.yml`, the build jobs depend only on `lint_and_audit`, not on `e2e_tests`. A PR can merge with failing E2E tests. Adding `e2e_tests` to the build `needs` array would close this gap.

---

## Architecture

### mainAppWindow/index.js is the new refactoring target

The CLAUDE.md identifies `app/index.js` as the module being refactored, and that work has been substantially successful. The god module problem has migrated to `app/mainAppWindow/index.js` (726 lines), which uses 13 module-level `let` variables as mutable shared state and mixes window management, screen sharing preview creation (~120 lines), authentication flow interception, custom background filtering, theme following, CSS injection, login dialog triggering, and Intune integration. It's the only main-process module still using the closure-based singleton pattern instead of a class. Converting it to a class (matching the pattern every recently-written module uses) would be the single highest-impact architectural improvement.

### Inconsistent privacy patterns

The codebase uses three approaches for class field privacy: WeakMap emulation (in `appConfiguration`, `connectionManager`, `menus`, `spellCheckProvider`), native `#private` fields (in `screenSharing`, `notifications`, `notificationSystem`, `idle`, `partitions`, `quickChat`, `mqtt/mediaStatusService`, `graphApi`), and plain public fields (in `mqtt/index.js`, `menus/index.js`, `browserWindowManager.js`). The WeakMap pattern adds 60+ lines of boilerplate in `ConnectionManager` alone. The "older Node.js compatibility" comment is no longer valid on Electron 39+ (Node.js 22+). Standardising on `#private` fields would reduce noise and align with the newer modules.

### Notifications naming confusion

Two directories handle notifications with similar names and overlapping sound logic. `app/notifications/service.js` handles native Electron notifications and sound playback. `app/notificationSystem/index.js` handles custom in-app toast notifications. Sound logic is duplicated between `browser/preload.js` and `notifications/service.js`. Renaming `notificationSystem/` to `toastNotification/` and consolidating sound logic would clarify the architecture.

### Graph API logging bypasses PII sanitisation

The `graphApi/index.js` and `graphApi/ipcHandlers.js` directly import `electron-log`, bypassing the PII sanitisation hook installed in `config/logger.js`. Using `console.*` instead would route through the sanitised pipeline.

---

## Developer Experience

### Quick wins to reduce issue volume

Creating a `.github/PULL_REQUEST_TEMPLATE.md` with the checklist from the contributing guide would standardise PR quality. Adding a `.nvmrc` file and `engines` field to `package.json` would prevent Node.js version mismatches. Fixing the bug report template to not pre-fill the debug command as the field value would capture actual diagnostic output. Adding `app/browser/preload.js` to CODEOWNERS would protect against the documented recurring regression.

### Stale bot configuration

The stale bot marks issues as stale after 30 days and closes after 5 more. For a volunteer-maintained project, this is aggressive. Adding `exempt-issue-labels` for confirmed bugs and extending the stale period to 60 days would reduce frustration.

### ESLint rules could enforce style guide

The ESLint config only adds `no-var` and `eqeqeq` beyond the recommended set. The contributing guide mentions `const` preference, async/await, and `#private` fields, but none are enforced by linting. Adding `prefer-const` and `prefer-arrow-callback` would automate enforcement.

### prestart hook friction

The `prestart` script runs `npm ci` on every `npm start`, adding 10-30 seconds to each dev cycle. Contributors who have already installed dependencies are surprised by this. Removing or conditionalising the hook would improve iteration speed.

---

## Strengths Worth Preserving

The ADR practice is exemplary with 18 records covering all major decisions. The PII log sanitiser covers 17 pattern types with thorough unit tests. The IPC validation layer with channel allowlisting and prototype pollution protection is a well-designed compensating control. All secondary windows correctly use full Electron security settings. The token cache uses Electron's `safeStorage` API. The release process offers four options with dry-run support. Module-level READMEs exist in all 27 directories. No synchronous IPC calls exist anywhere in the codebase.

---

## Recommended Priority

The work that would have the most immediate impact falls into three categories.

Quick fixes that prevent regressions (partially addressed in PR #2312): unit test auto-discovery and tests for ipcValidator/certificate/MQTT are done. Remaining: add `e2e_tests` to the CI build dependency chain, create a PR template.

Performance evaluation for meetings: investigate whether the body-level MutationObservers, timestampCopyOverride polling, and nativeTheme listener registration are necessary for reliable functionality before making changes. Teams' React DOM is unpredictable and these may be required.

Structural improvements for long-term maintainability: convert `mainAppWindow/index.js` to a class, standardise on `#private` fields, consolidate notification sound logic, fix Graph API logging to go through the sanitised pipeline.
