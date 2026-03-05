# Auth Expiry Detection and Calendar Resilience Research

:::info Requires Validation First
Three spikes need validation before implementation decisions can be made.
:::

**Date:** 2026-03-04 (updated 2026-03-05)
**Status:** Calendar recovery implemented; auth spikes awaiting validation
**Issue:** [#2296](https://github.com/IsmaelMartinez/teams-for-linux/issues/2296) - Calendar blank on first visit each day
**Author:** Claude AI Assistant
**Related:** [ADR-003: Token Refresh Implementation](../adr/003-token-refresh-implementation.md), [Configuration Organization Research](configuration-organization-research.md)

---

## Executive Summary

Users report that the calendar page appears blank on the first visit each day, requiring a manual page refresh or navigation away and back to recover. Initial investigation hypothesized that expired auth tokens caused the blank calendar, but user-submitted debug logs from March 2026 revealed a different root cause: a startup race condition where the calendar iframe loads before background services (service discovery, service workers, auth state) have fully initialized.

The calendar's boot script (`HostedCalendarFunctionalBoot`) preloads shell scripts that are never consumed because the prerequisite services haven't settled yet. The iframe then self-reloads once (Teams' internal retry), but that also fails for the same reason. The user's workaround of navigating to Chat and back works because the second visit creates a fresh iframe after all services are ready.

A calendar iframe recovery mechanism has been implemented: the `authDiagnostics` module detects when the iframe loads twice within a short window (the multi-load signal), then schedules a delayed reload after services have settled. The original auth-related spikes remain relevant for the separate expired-token scenario and are awaiting user validation.

---

## 1. Root Cause Analysis

### Reproduction Steps

The issue was reproduced by creating a fresh Electron profile, logging into Teams, then relaunching the app after the auth token had expired (~24 hours later). Debug logging captured the complete failure sequence.

### Observed Failure Chain

The failure begins when the app launches with expired tokens. The `expiry_AuthService` timestamp in localStorage has passed, and Teams' internal auth service attempts a silent token renewal. This renewal fails with `InteractionRequired` (AADSTS50058), meaning the user's session cookie has expired and interactive login is required.

During the ~4 minutes while Teams retries silent auth, background jobs continue to fire. The `CalendarSyncJob` makes API calls that return empty responses (the auth middleware intercepts the request but returns no data). The calendar iframe at `outlook.office.com/hosted/calendar/view/week` receives a response that causes a `SyntaxError: Unexpected token ' '` when parsing the empty JSON body. All preloaded calendar scripts go unconsumed.

Eventually, Teams detects the auth failure and presents the user with an interactive login prompt. After the user logs in, everything works correctly. The calendar remains blank until the user either refreshes the page or navigates away and back.

### Key Signals Observed in Debug Logs

The console output from the renderer contained `InteractionRequired` error messages from Teams' auth provider, with the AADSTS50058 error code indicating a session has expired. These messages appeared consistently across multiple test runs and represent a reliable detection signal.

The `expiry_AuthService` key in localStorage contained a Unix timestamp (observed value: `1772641479`) that corresponds to the token's expiration time. Comparing this to the current time at app startup provides an early warning signal.

HTTP responses from calendar-related endpoints (Substrate service, Outlook calendar API) returned empty or error responses during the auth failure window, but these are harder to intercept reliably because they occur within the Teams iframe context.

### Existing Infrastructure Gaps

The `connectionManager` (`app/connectionManager/index.js`) handles `did-fail-load` events and `powerMonitor.on("resume")` to reload the page after network failures, but it has no concept of auth state. It would reload a page that has network connectivity but expired tokens, which wouldn't help because the reload would encounter the same expired tokens.

The `tokenCache` (`app/browser/tools/tokenCache.js`) implements secure storage for auth tokens but has no expiry tracking or proactive refresh capability. It stores and retrieves tokens on demand without examining their content.

ADR-003 designed a proactive token refresh mechanism using `forceRenew + forceRefresh + skipCache` parameters but was never implemented. The design identified the key technical requirement: the `correlation` object from Teams core services must be included in refresh requests.

---

## 2. Spike 1: Proactive Token Refresh (ADR-003 Implementation)

### Hypothesis

Implementing the token refresh mechanism described in ADR-003 will prevent auth expiry from occurring during a session, eliminating the blank calendar issue at its root. The combination of `forceRenew: true`, `forceRefresh: true`, `skipCache: true`, and `prompt: 'none'` will force a silent token renewal without user interaction.

### What to Validate

The spike needs to confirm three things. First, that the `correlation` object is still accessible from the Teams React component tree (`teams.CoreServices.correlation`) in the current Teams web app version. Second, that the documented refresh parameters produce a `fromCache: false` response, confirming a genuine token renewal occurred. Third, that a periodic timer (defaulting to 1 hour, matching the ADR-003 recommendation) prevents `InteractionRequired` errors from appearing during a 24+ hour session.

### Validation Steps

1. In `app/browser/tools/reactHandler.js`, add a method that reads the `correlation` object from Teams' React internals, calls `acquireToken()` with the force-refresh parameters documented in ADR-003, and logs the result (without logging PII — only log `fromCache` status and whether the call succeeded).

2. Add a `setInterval` timer in the same module that triggers this refresh every hour (configurable via `tokenRefresh.refreshIntervalHours`, range 1-24, default 1).

3. Add a startup check that reads `expiry_AuthService` from localStorage and, if the token has less than 1 hour remaining, triggers an immediate refresh attempt before the first timer tick.

4. Test by logging in, waiting for the timer to fire at least once, and confirming `fromCache: false` in the response. Then let the token expire naturally (~24h) and confirm the calendar loads correctly on the next app launch.

### Success Criteria

A successful spike produces `fromCache: false` responses from periodic refresh calls, and no `InteractionRequired` errors appear in the console during a 24+ hour session. The calendar page loads correctly on first visit each day without requiring manual intervention.

### Failure Criteria

The spike fails if the `correlation` object is no longer accessible in the Teams React tree, if the force-refresh parameters no longer produce fresh tokens, or if Microsoft rate-limits the refresh requests. Any of these would require falling back to Spike 2 (reactive detection).

### Implementation Location

Primary: `app/browser/tools/reactHandler.js` (renderer process, has access to Teams' React internals).
Configuration: `app/appConfiguration/index.js` (add `tokenRefresh.enabled` and `tokenRefresh.refreshIntervalHours`).
Timer management: New method in `reactHandler.js` or a dedicated `tokenRefreshManager.js` module.

### Estimated Effort

Medium (2-3 days). The core mechanism is already proven in ADR-003's POC. The main work is integrating the timer with the existing module lifecycle, adding configuration, and testing the 24-hour scenario.

---

## 3. Spike 2: Auth Failure Detection via Console Monitoring

### Hypothesis

The `InteractionRequired` console messages from Teams' auth provider are a reliable, low-false-positive signal for auth token expiry. Monitoring for these patterns from the renderer and notifying the main process via IPC would allow the app to trigger a page reload that forces interactive re-authentication before the user encounters a blank calendar.

### What to Validate

The spike needs to confirm that `InteractionRequired` messages appear consistently when tokens expire (not just in our test runs), that they don't appear during normal operation as false positives, and that a page reload triggered after detecting these messages successfully forces the login flow.

### Validation Steps

1. In the renderer preload script, override `console.error` and `console.warn` to intercept messages matching the pattern `/InteractionRequired|AADSTS50058/`. When a match is detected, send an IPC message (`auth-failure-detected`) to the main process.

2. In `app/mainAppWindow/index.js`, register a handler for `auth-failure-detected` that debounces rapid-fire messages (Teams emits multiple auth failures in quick succession) and triggers a reload via `connectionManager.refresh()` after a configurable delay (default: 30 seconds, to give Teams' internal retry mechanism a chance to succeed first).

3. Add the `auth-failure-detected` IPC channel to the allowlist in `app/security/ipcValidator.js`.

4. Test by letting tokens expire and observing whether the auto-reload triggers before the user sees a blank calendar, and whether the reload successfully presents the login prompt.

### Success Criteria

The detector fires within 30 seconds of the first `InteractionRequired` error appearing, triggers a page reload, and the user sees a login prompt instead of a blank calendar. Zero false positives during normal 8-hour usage sessions with valid tokens.

### Failure Criteria

The spike fails if the console messages are inconsistent across Teams versions, if false positives disrupt normal usage, or if the reload doesn't resolve the auth state (e.g., if tokens are cached at a level that survives page reload).

### Implementation Location

Detection: `app/browser/preload.js` or a new browser tool module in `app/browser/tools/`.
Handler: `app/mainAppWindow/index.js` (IPC handler + reload trigger).
IPC allowlist: `app/security/ipcValidator.js`.

### Estimated Effort

Low (1 day). The console interception is straightforward, and the reload mechanism already exists in `connectionManager`. The main risk is false positive calibration, which requires multi-day testing.

### Relationship to Spike 1

If Spike 1 succeeds (proactive refresh prevents expiry), Spike 2 becomes a safety net for edge cases where the proactive refresh fails (e.g., the app was suspended for longer than the refresh interval, or the refresh API call failed silently). Both spikes are complementary rather than competing.

---

## 4. Spike 3: Calendar Iframe Recovery (Implemented)

### Hypothesis (Updated)

User-submitted debug logs revealed that the blank calendar occurs even with valid auth tokens (57 minutes remaining, no `InteractionRequired` errors). The root cause is a startup race condition: the calendar iframe loads before background services (service discovery, service workers) have finished initializing. The calendar's `HostedCalendarFunctionalBoot` script preloads 4 shell scripts that are never consumed, and the iframe self-reloads once (Teams' internal retry) but fails again for the same reason.

The recovery mechanism detects this multi-load pattern and triggers a delayed reload after services have settled.

### Evidence from Debug Logs

The following timeline from the reporter's logs illustrates the race condition. The calendar iframe first loaded at T+11s after page load start, but service workers were still installing until T+14s and the Discover API had returned errors for `groupsServiceV2`, `searchService`, and `consumerLicenses` at T+4s. The iframe loaded a second time at T+24s (Teams' internal retry), but the same preloaded scripts went unconsumed again. Both loads produced the `HostedCalendarFunctionalBoot` error "Setting overlaysContent is only supported from the top level browsing context", and 9 `ApiError: Unacceptable or no response` errors from the SharePoint service worker occurred between the loads.

### Implementation

The `authDiagnostics` module in `app/browser/tools/authDiagnostics.js` now includes calendar iframe recovery. When the calendar iframe fires its `load` event twice within a 30-second window, the module interprets this as a failed initialization (the iframe's own retry mechanism kicked in) and schedules a recovery reload after a 15-second delay. The delay allows background services to fully settle before the iframe attempts to boot again.

The recovery fires only once per page load to avoid reload loops. A flag tracks whether the reload was triggered by the recovery mechanism so that the recovery-triggered load event is not counted as another failure signal.

### Remaining Validation Needed

The implementation needs user testing to confirm that the delayed reload successfully renders the calendar, and that Teams' React reconciliation does not interfere with the iframe reload. If React reverts the iframe state, a full page reload via `connectionManager.refresh()` would be needed instead.

---

## 5. CSP Fix (Implemented, Cosmetic)

During investigation of issue #2296, CSP violations for `wss://augloop.office.com` WebSocket connections were observed in the debug logs. A fix was implemented in `app/mainAppWindow/index.js` via the `expandConnectSrcCSP` function, which appends `wss://augloop.office.com` to the `connect-src` CSP directive in response headers.

User-submitted logs revealed that the CSP violations are on the `Content-Security-Policy-Report-Only` header, not the enforcing `Content-Security-Policy` header. The policy text explicitly states "The policy is report-only, so the violation has been logged but no further action has been taken." This means the augloop WebSocket connections were never actually blocked — the violations are log noise only. The server-side report-only policy already includes `wss://*.augloop.office.com`, but the bare domain `wss://augloop.office.com` doesn't match the wildcard pattern, hence the report. Our fix targets the enforcing header and is harmless but does not suppress the report-only violations.

---

## 6. Recommended Implementation Order

Spike 3 (calendar iframe recovery) has been implemented and should be validated first, as it addresses the race condition observed in user-submitted logs — which is the most commonly reported scenario. The reporter should test whether the delayed iframe reload resolves the blank calendar on first visit.

Spikes 1 and 2 remain relevant for a separate failure mode: expired auth tokens after overnight idle, where `InteractionRequired` errors cause the calendar (and other features) to fail. These spikes require a user who can reproduce the expired-token scenario and share logs showing `AADSTS50058` or `InteractionRequired` errors. They are complementary to Spike 3 rather than competing with it.

---

## 7. Diagnostic Logging for User Validation

The `authDiagnostics` module at `app/browser/tools/authDiagnostics.js` captures diagnostic data and performs calendar iframe recovery. All diagnostic output uses the `[AUTH_DIAG]` prefix and is captured by electron-log when file logging is enabled.

The module monitors three signals and performs one recovery action. First, it checks the `expiry_AuthService` timestamp in localStorage every 5 minutes and at startup. Note: user-submitted logs showed this key may not be accessible from the main page context (it appears to live in a web worker scope), so this check may log "no valid expiry_AuthService found" even when tokens are valid. Second, it intercepts `console.error` and `console.warn` for `InteractionRequired` and `AADSTS` error patterns, debouncing the detection to avoid log spam (30-second window). Third, it uses a MutationObserver to detect when the calendar iframe from `outlook.office.com/hosted/calendar` is added to the DOM, monitors its load/error events, and triggers a recovery reload if the iframe loads multiple times within 30 seconds (indicating a failed initialization). The recovery reload fires once after a 15-second delay to give background services time to settle.

To collect diagnostic data from the issue reporter, ask them to enable file logging by adding the following to their config:

```json
{
  "logConfig": {
    "transports": {
      "console": { "level": "info" },
      "file": { "level": "debug" }
    }
  }
}
```

The log file will be at `~/.config/teams-for-linux/logs/main.log` (or `~/snap/teams-for-linux/current/.config/teams-for-linux/logs/main.log` for snap). After using the app for a day, the log file will contain the complete timeline of auth state changes, failure detections, and calendar iframe events — enough to validate all three spikes without implementing the full features. All PII is automatically sanitized by the existing log sanitizer.

---

## Related Documentation

- [ADR-003: Token Refresh Implementation Strategy](../adr/003-token-refresh-implementation.md) - Detailed design for proactive token refresh
- [Configuration Options](../../configuration.md) - Application configuration reference
- [Connection Manager](../../development/module-index.md) - Network failure handling infrastructure
- [IPC API Documentation](../ipc-api.md) - IPC channel patterns and allowlist requirements
