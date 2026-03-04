# Auth Expiry Detection and Calendar Resilience Research

:::info Requires Validation First
Three spikes need validation before implementation decisions can be made.
:::

**Date:** 2026-03-04
**Status:** Spikes defined, awaiting validation
**Issue:** [#2296](https://github.com/IsmaelMartinez/teams-for-linux/issues/2296) - Calendar blank on first visit each day
**Author:** Claude AI Assistant
**Related:** [ADR-003: Token Refresh Implementation](../adr/003-token-refresh-implementation.md), [Configuration Organization Research](configuration-organization-research.md)

---

## Executive Summary

Users report that the calendar page appears blank on the first visit each day, requiring a manual page refresh or re-login to recover. Investigation reproduced the issue and identified a complete failure chain: Microsoft auth tokens expire after ~24 hours, Teams' silent token renewal fails with `InteractionRequired` errors for several minutes, the `CalendarSyncJob` fails during this window because it receives empty JSON responses, and the calendar iframe renders blank content.

The core problem is that Teams for Linux has no mechanism to detect auth token expiry or to trigger re-authentication proactively. The existing `connectionManager` handles network-level failures (DNS, connectivity) but is unaware of auth-level failures. This research defines three spikes to validate different approaches: proactive token refresh to prevent the problem, reactive auth failure detection to trigger recovery, and calendar-specific iframe reload as a targeted fallback.

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

## 4. Spike 3: Calendar Iframe Recovery

### Hypothesis

When auth tokens expire and recovery occurs (either via Spike 1's proactive refresh or Spike 2's reload), the calendar iframe may still display stale blank content because the iframe loaded during the auth failure window. A targeted iframe reload, triggered after auth recovery is confirmed, would restore calendar functionality without requiring a full page reload.

### What to Validate

The spike needs to confirm that the calendar iframe can be identified reliably in the Teams DOM, that reloading the iframe after auth recovery causes it to re-fetch data successfully, and that Teams' React reconciliation doesn't fight the iframe reload (e.g., by reverting it to the blank state).

### Validation Steps

1. Identify the calendar iframe DOM selector. During investigation, the calendar was observed loading from `outlook.office.com/hosted/calendar/view/week`. Validate that this URL pattern is consistent and that the iframe can be found via `document.querySelector('iframe[src*="outlook.office.com/hosted/calendar"]')`.

2. After auth recovery is detected (either by Spike 1's successful refresh or Spike 2's reload completing), execute a script in the renderer that finds the calendar iframe and sets `iframe.src = iframe.src` to trigger a reload.

3. Test whether the reloaded iframe renders calendar data correctly, and whether the React component tree detects the iframe reload and interferes with it.

### Success Criteria

The calendar iframe reloads successfully after auth recovery, displays the user's calendar data, and Teams' React framework does not revert or break the reloaded iframe. The reload is invisible to the user (no flash or navigation).

### Failure Criteria

The spike fails if the iframe selector is unreliable across Teams updates, if React's virtual DOM reconciliation reverts the iframe reload, or if the reloaded iframe triggers a new auth failure loop. Any of these would indicate that a full page reload (as in Spike 2) is the only reliable recovery mechanism for the calendar.

### Implementation Location

Script injection: `app/browser/tools/reactHandler.js` or a dedicated calendar recovery module.
Trigger: Connected to Spike 1 or Spike 2's recovery signal.

### Estimated Effort

Low (0.5-1 day). The iframe manipulation is simple to implement. The risk is entirely in whether Teams' React framework cooperates, which can only be validated through testing.

---

## 5. CSP Fix (Immediate)

During investigation of issue #2296, CSP violations for `wss://augloop.office.com` WebSocket connections were observed in the debug logs. The Teams server-side CSP `connect-src` directive does not include this augloop domain, causing the browser to block co-authoring and real-time collaboration WebSocket connections.

A fix has been implemented in `app/mainAppWindow/index.js` via the `expandConnectSrcCSP` function, which appends `wss://augloop.office.com` to the `connect-src` CSP directive in response headers. This fix is independent of the three spikes and can ship immediately. It follows the same pattern used by `customBackground` for modifying CSP headers.

---

## 6. Recommended Implementation Order

The spikes should be validated in the order presented. Spike 1 (proactive token refresh) addresses the root cause and prevents the blank calendar entirely. If Spike 1 validates successfully, Spike 2 becomes a safety net for edge cases and Spike 3 may not be needed at all. If Spike 1 fails (e.g., the correlation object is no longer accessible), Spike 2 becomes the primary approach and Spike 3 provides targeted recovery for the calendar specifically.

The CSP fix should ship independently and immediately, as it addresses a separate issue observed in the same debug session.

---

## Related Documentation

- [ADR-003: Token Refresh Implementation Strategy](../adr/003-token-refresh-implementation.md) - Detailed design for proactive token refresh
- [Configuration Options](../../configuration.md) - Application configuration reference
- [Connection Manager](../../development/module-index.md) - Network failure handling infrastructure
- [IPC API Documentation](../ipc-api.md) - IPC channel patterns and allowlist requirements
