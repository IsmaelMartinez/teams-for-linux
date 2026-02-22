# Development Roadmap

**Last Updated:** 2026-02-22
**Current Version:** v2.7.8
**Status:** Living Document — planning v2.7.9 and v2.8.0

This document outlines the future development direction for Teams for Linux, organized by priority and readiness for implementation.

## Quick Reference

| Priority | Feature | Status | Effort | Target |
|----------|---------|--------|--------|--------|
| **Merge** | MQTT Screen Sharing fix ([#2107](https://github.com/IsmaelMartinez/teams-for-linux/issues/2107)) | PR [#2193](https://github.com/IsmaelMartinez/teams-for-linux/pull/2193) ready | Tiny | v2.7.8 |
| **Merge** | App menu tray fix ([#2186](https://github.com/IsmaelMartinez/teams-for-linux/issues/2186)) | PR [#2195](https://github.com/IsmaelMartinez/teams-for-linux/pull/2195) ready | Small | v2.7.8 |
| **Merge** | Second ringer fix ([#2025](https://github.com/IsmaelMartinez/teams-for-linux/issues/2025)) | PR [#2194](https://github.com/IsmaelMartinez/teams-for-linux/pull/2194) ready | Tiny | v2.7.8 |
| **Merge** | Quick Chat shortcut fix ([#2184](https://github.com/IsmaelMartinez/teams-for-linux/issues/2184)) | PR [#2188](https://github.com/IsmaelMartinez/teams-for-linux/pull/2188) ready | Small | v2.7.8 |
| **Blocked** | MQTT status regression ([#2131](https://github.com/IsmaelMartinez/teams-for-linux/issues/2131)) | Diagnostic build in PR [#2197](https://github.com/IsmaelMartinez/teams-for-linux/pull/2197), needs user logs | Medium | v2.7.8+ |
| **Ready** | Electron 40 upgrade | Research complete | Medium | v2.8.0 |
| **Done** | ESLint 10 upgrade | Shipped in v2.7.8 | Small | Done |
| **Ready** | Notification sound overhaul | [Research complete](../research/notification-sound-overhaul-research.md) | Medium | v2.8.0+ |
| **Done** | XWayland camera fix ([#2169](https://github.com/IsmaelMartinez/teams-for-linux/issues/2169)) | Shipped in v2.7.7 | Small | Done |
| **Done** | AppImage auto-update ([#2157](https://github.com/IsmaelMartinez/teams-for-linux/issues/2157)) | Shipped in v2.7.6 | Medium | Done |
| **Done** | Code quality hardening | Complete (Phases 1-3) | Small | Done |
| **Low** | MQTT Extended Status Phase 2 | Awaiting user feedback | Small | — |

---

## Next Patch Release (v2.7.8)

### Ready to Merge

These PRs have been implemented and builds pass. Awaiting user testing/merge.

| Item | PR | Description |
|------|----|-------------|
| [**#2107**](https://github.com/IsmaelMartinez/teams-for-linux/issues/2107) | [#2193](https://github.com/IsmaelMartinez/teams-for-linux/pull/2193) | MQTT Screen Sharing — fix null sourceId crash on start event |
| [**#2186**](https://github.com/IsmaelMartinez/teams-for-linux/issues/2186) | [#2195](https://github.com/IsmaelMartinez/teams-for-linux/pull/2195) | App menu — ensure full menu when tray icon disabled |
| [**#2025**](https://github.com/IsmaelMartinez/teams-for-linux/issues/2025) | [#2194](https://github.com/IsmaelMartinez/teams-for-linux/pull/2194) | Second ringer — add error handler to prevent exception |
| [**#2184**](https://github.com/IsmaelMartinez/teams-for-linux/issues/2184) | [#2188](https://github.com/IsmaelMartinez/teams-for-linux/pull/2188) | Quick Chat shortcut — improve messaging and menu integration |

### Blocked — Needs User Logs

| Item | PR | Description |
|------|----|-------------|
| [**#2131**](https://github.com/IsmaelMartinez/teams-for-linux/issues/2131) | [#2197](https://github.com/IsmaelMartinez/teams-for-linux/pull/2197) | MQTT status regression — diagnostic build with enhanced logging and restored CSS selectors. Needs user to run the build and share console output so we can identify the correct React service paths for presence detection. |

### Closed / Won't Fix

These issues have been closed since the last roadmap update.

| Issue | Resolution |
|-------|------------|
| [**#2169**](https://github.com/IsmaelMartinez/teams-for-linux/issues/2169) | Fixed in v2.7.7 — XWayland camera crash resolved by skipping fake media UI flag |
| [**#2143**](https://github.com/IsmaelMartinez/teams-for-linux/issues/2143) | Closed — --appTitle/--appIcon issue resolved |
| [**#2152**](https://github.com/IsmaelMartinez/teams-for-linux/issues/2152) | Closed — meeting ID join is a Microsoft Teams limitation, related to [#675](https://github.com/IsmaelMartinez/teams-for-linux/issues/675) |
| [**#2140**](https://github.com/IsmaelMartinez/teams-for-linux/issues/2140) | Closed — new meeting link format |
| [**#2137**](https://github.com/IsmaelMartinez/teams-for-linux/issues/2137) | Closed — chat scrollbar; workaround via `customCSSLocation` config |
| [**#2106**](https://github.com/IsmaelMartinez/teams-for-linux/issues/2106) | Closed — screen lock media privacy; no user interest. PR [#2110](https://github.com/IsmaelMartinez/teams-for-linux/pull/2110) also closed. |

---

## Next Minor Release (v2.8.0)

Electron 40 is a major dependency upgrade (new Chromium, new Node.js, new V8). It warrants a minor version bump.

### Ready to Implement

| Item | Description | Notes |
|------|-------------|-------|
| **Electron 40** | Electron 39.5.1 → 40.4.0 (Chromium 144, Node.js 24, V8 14.4) | [Research](../research/electron-40-migration-research.md); no blocking breaking changes |
| **Notification sound overhaul** | Replace `node-sound` native addon, add custom sound config, consolidate notification options | [Research](../research/notification-sound-overhaul-research.md); phased approach |

**Routine dependency updates completed in v2.7.8:** `@homebridge/dbus-native` 0.7.3, `electron-updater` 6.8.3, `electron-builder` 26.8.1, `eslint`/`@eslint/js` 10.0.1 (ESLint 10).

**Still pending:** Docusaurus 3.9.2, React 19.2.4, TypeScript 5.9.3 (docs-site only).

### Closed Since Last Update

| Item | Description | Resolution |
|------|-------------|------------|
| [**#2095**](https://github.com/IsmaelMartinez/teams-for-linux/issues/2095) | `--appIcon` not working in KDE window list | Closed |
| [**#1860**](https://github.com/IsmaelMartinez/teams-for-linux/issues/1860) | Camera resolution/aspect ratio issues | Closed |

### Previously Blocked (Now Closed)

All previously blocked external dependency issues have been closed.

| Issue | Description | Resolution |
|-------|-------------|------------|
| [**#2094**](https://github.com/IsmaelMartinez/teams-for-linux/issues/2094) | Maximized window gap/shrink on focus loss | Closed |
| [**#2074**](https://github.com/IsmaelMartinez/teams-for-linux/issues/2074) | Window restore from tray appears tiny | Closed |
| [**#2047**](https://github.com/IsmaelMartinez/teams-for-linux/issues/2047) | Intune SSO regression (broker v2.0.2+) | Closed |
| [**#1972**](https://github.com/IsmaelMartinez/teams-for-linux/issues/1972) | Microphone doesn't work in meetings | Closed |
| [**#1923**](https://github.com/IsmaelMartinez/teams-for-linux/issues/1923) | Wayland screen sharing with snap | Closed |
| [**#1879**](https://github.com/IsmaelMartinez/teams-for-linux/issues/1879) | App prevents sleep | Closed |
| [**#2036**](https://github.com/IsmaelMartinez/teams-for-linux/issues/2036) | GNOME 49 notification focus | Closed |

---

## Feature Details

### MQTT Screen Sharing Status

**Issue:** [#2107](https://github.com/IsmaelMartinez/teams-for-linux/issues/2107)
**Original Request:** [#1938](https://github.com/IsmaelMartinez/teams-for-linux/issues/1938) by @vbartik
**Related:** [mqtt-extended-status-investigation.md](../research/mqtt-extended-status-investigation.md)
**Effort:** Tiny
**Status:** Fix ready in PR [#2193](https://github.com/IsmaelMartinez/teams-for-linux/pull/2193) (fixes null sourceId crash on start event). Original PR [#2144](https://github.com/IsmaelMartinez/teams-for-linux/pull/2144) still open for the broader feature.

**Description:** Wire existing `screen-sharing-started` and `screen-sharing-stopped` IPC events to MQTT publish.

**Current state:** PR [#2193](https://github.com/IsmaelMartinez/teams-for-linux/pull/2193) fixes the start event crash (null sourceId was being passed to `desktopCapturer.getSources` which threw). Both start and stop events should now work once merged.

---

### Custom Notification System Phase 2

**Issue:** [#2108](https://github.com/IsmaelMartinez/teams-for-linux/issues/2108)
**Research:** [custom-notification-system-research.md](../research/custom-notification-system-research.md)
**Feedback:** [#2039](https://github.com/IsmaelMartinez/teams-for-linux/issues/2039)
**Branch:** `claude/custom-notifications-phase-2-wirLH`
**Status:** Dropped — implementation did not work for the user; PR [#2112](https://github.com/IsmaelMartinez/teams-for-linux/pull/2112) closed

**MVP Delivered (v2.6.16):**

- Meeting notifications (meeting started) - working with Quickshell/Noctalia
- Toast notifications with auto-dismiss
- Click-to-focus functionality
- Configuration via `notificationMethod: "custom"`

**Phase 2 was attempted but dropped:** The chat, calendar, and activity notification routing worked on the maintainer's machine but the requesting user reported receiving no notifications at all. It remains unclear whether the implementation failed in their environment or whether their expectations differed from what was built. Issue [#2039](https://github.com/IsmaelMartinez/teams-for-linux/issues/2039) has been closed. PR [#2112](https://github.com/IsmaelMartinez/teams-for-linux/pull/2112) has been closed. The MVP from v2.6.16 remains available. Phase 2 may be revisited if a new user requests it, with better diagnostic tooling to understand environment-specific behaviour first.

**Phase 2 Nice-to-Have (future, if revisited):**

- Notification center drawer
- Mark as read/unread
- Badge count on tray icon

---

## Strategic / Future

### Code Quality Hardening

**Status:** Complete
**Priority:** Done

**Description:** A comprehensive codebase review identified incremental improvements across input handling, logging hygiene, resilience, CI/CD, and workflow security. All items have been implemented across three phases.

**Phase 1 (Completed):**

1. ✅ **Logging hygiene** — Removed PII from debug logs in `mutationTitle`, `notificationSystem`, `certificate` modules (aligning with ADR-013). Certificate fingerprint preserved (not PII, needed for config).
2. ✅ **Resilience improvements** — Added `uncaughtException`/`unhandledRejection` handlers, wrapped `handleAppReady()`, added try/catch to all Graph API IPC handlers
3. ✅ **Input handling** — Added argument sanitization for incoming call notification command. SSO `execSync` kept (user-controlled config, shell features expected; see research doc for details).
4. ✅ **Renderer cleanup** — Removed unused `globalThis.nodeRequire` and `globalThis.nodeProcess` from preload
5. ✅ **IPC validator** — Added recursive prototype pollution sanitization for nested payloads
6. ✅ **SECURITY.md** — Updated with accurate version numbers (2.7.x) and reporting instructions

**Phase 2 (Completed):**

7. ✅ **CI/CD lint gate** — Added `lint_and_audit` job to build workflow; all platform builds depend on it
8. ✅ **CI/CD dependency audit** — `npm audit --audit-level=moderate` runs in CI before packaging
9. ✅ **Dependabot** — Configured for weekly npm updates (minor/patch grouped) and monthly GitHub Actions updates

**Phase 3 (Completed):**

10. ✅ **Workflow permissions** — Added least-privilege `permissions` to all 9 workflow files
11. ✅ **CODEOWNERS** — Require maintainer review for workflows, Dependabot config, security code, and SECURITY.md
12. ✅ **npm audit scope** — Evaluated `--omit=dev`; decided to keep auditing all deps (supply chain risk)

---

### AppImage Auto-Update

**Issue:** [#2157](https://github.com/IsmaelMartinez/teams-for-linux/issues/2157)
**Research:** [electron-updater-auto-update-research.md](../research/electron-updater-auto-update-research.md)
**Status:** ✅ Shipped in v2.7.6
**Priority:** Done

In-app auto-update via `electron-updater` for AppImage distributions. Supersedes the earlier ADR-011 `appimagetool` post-processing approach.

---

### GitHub Issue Bot

**Research:** [github-issue-bot-investigation.md](../research/github-issue-bot-investigation.md)
**Status:** Phase 1 ✅ Merged (v2.7.4), Phase 2 ✅ Shipped
**Priority:** Medium

**Phase 1 Delivered:** Information request bot — detects missing reproduction steps, debug output, and expected behaviour in bug reports.

**Phase 2 Delivered:** Solution suggester — AI-powered matching against troubleshooting guide and configuration docs using Gemini. Posts a single consolidated comment combining missing info requests and solution suggestions.

**Future phases:**

- Phase 3: Duplicate detection via embeddings (RAG system)
- Phase 4: Enhancement context from roadmap/research/ADRs (AI-assisted)

---

### Configuration Organization

**Research:** [configuration-organization-research.md](../research/configuration-organization-research.md)
**Status:** Ongoing — new features use nested patterns from day one

**Already Using Nested Patterns:** `mqtt.*`, `graphApi.*`, `customNotification.*`, `cacheManagement.*`, `screenSharingThumbnail.*`, `quickChat.*`

Existing flat options migrate opportunistically when modules are refactored.

---

## Awaiting User Feedback

These features have completed initial implementation. Further phases depend on user requests.

### Quick Chat Access

**Issue:** [#2109](https://github.com/IsmaelMartinez/teams-for-linux/issues/2109)
**Status:** Shipped in v2.7.4

**Delivered:** People API search, deep link chat navigation, inline messaging via Teams React internals, keyboard shortcut (Ctrl+Alt+Q), menu item integration.

**Phase 2 (If Requested):** Enhance notification clicks to open chat with sender, cache recent contacts, favorites list.

---

### MQTT Extended Status Phase 2

**Research:** [mqtt-extended-status-investigation.md](../research/mqtt-extended-status-investigation.md)
**Status:** Phase 1 Complete

**Phase 1 Delivered:** Generic `publish()` method, LWT for connection state, call state (`in-call`) publishing.

**Phase 2 (If Requested):** WebRTC monitoring for camera/microphone state, granular media state (`camera`, `microphone` topics).

**Trigger:** User confirms they need granular camera/mic state in addition to call state for RGB LED automation.

---

### Graph API Enhanced Features

**Research:** [graph-api-integration-research.md](../research/graph-api-integration-research.md)
**Status:** Phase 1 POC Complete

**Phase 1 Delivered:** Token acquisition, calendar endpoints, mail endpoints, IPC handlers.

**Phase 2 (If Requested):** Calendar sync with desktop notifications, mail preview notifications, retry logic with exponential backoff.

**Note:** Presence endpoint returns 403 Forbidden — Teams token lacks `Presence.Read` scope.

---

## Not Planned / Not Feasible

| Feature | Issue | Reason | Notes |
|---------|-------|--------|-------|
| Screen Lock Media Privacy | [#2106](https://github.com/IsmaelMartinez/teams-for-linux/issues/2106) | Closed — no user interest | Implementation complete in branch `claude/screen-lock-media-privacy-HMTPA`; reopen if requested |
| Meeting Join with ID | [#2152](https://github.com/IsmaelMartinez/teams-for-linux/issues/2152) | Microsoft limitation | Related to [#675](https://github.com/IsmaelMartinez/teams-for-linux/issues/675); workaround: use meeting link via clipboard |
| Custom Notifications Phase 2 | [#2108](https://github.com/IsmaelMartinez/teams-for-linux/issues/2108) | Dropped — worked on maintainer's machine but not for user | MVP (v2.6.16) remains; revisit with diagnostic tooling if requested again |
| Tray Icon Logout Indicator | [#1987](https://github.com/IsmaelMartinez/teams-for-linux/issues/1987) | Archived — user not responding | Work preserved in branch; reopen if requested |
| GNOME Search Provider | [#2075](https://github.com/IsmaelMartinez/teams-for-linux/issues/2075) | Latency too high (~300-1100ms) | Technically feasible via MQTT but poor UX |
| External Browser Auth | [#2017](https://github.com/IsmaelMartinez/teams-for-linux/issues/2017) | Not feasible | Teams manages OAuth internally; no exposed APIs |
| Multiple Windows | [#1984](https://github.com/IsmaelMartinez/teams-for-linux/issues/1984) | Rejected ([ADR-010](../adr/010-multiple-windows-support.md)) | Teams single React context; Quick Chat is the alternative |
| useSystemPicker | — | Rejected ([ADR-008](../adr/008-usesystempicker-electron-38.md)) | Incomplete Linux Wayland/PipeWire support in Electron; reconsider when improved |

---

## Implementation Priorities

### v2.7.7 (Shipped 2026-02-19)

Included the XWayland camera fix ([#2169](https://github.com/IsmaelMartinez/teams-for-linux/issues/2169)) via PR [#2190](https://github.com/IsmaelMartinez/teams-for-linux/pull/2190), the CI audit level fix ([#2196](https://github.com/IsmaelMartinez/teams-for-linux/pull/2196)), and cleanup ([#2191](https://github.com/IsmaelMartinez/teams-for-linux/pull/2191)).

### v2.7.8 Release Plan

1. **Merge 4 ready PRs** — [#2193](https://github.com/IsmaelMartinez/teams-for-linux/pull/2193) (MQTT screen sharing), [#2195](https://github.com/IsmaelMartinez/teams-for-linux/pull/2195) (app menu), [#2194](https://github.com/IsmaelMartinez/teams-for-linux/pull/2194) (second ringer), [#2188](https://github.com/IsmaelMartinez/teams-for-linux/pull/2188) (Quick Chat shortcut)
2. **Collect user logs for MQTT status** — PR [#2197](https://github.com/IsmaelMartinez/teams-for-linux/pull/2197) has a diagnostic build; once user shares logs, determine fix approach
3. **Release v2.7.8**

### v2.8.0 Release Plan

1. **Electron 40 upgrade** — Major version bump (39.5.1 → 40.4.0); [research complete](../research/electron-40-migration-research.md)
2. **Release v2.8.0**

### Future Priorities

- **GitHub Issue Bot Phases 3-4** — Duplicate detection (embeddings), enhancement context (PR [#2192](https://github.com/IsmaelMartinez/teams-for-linux/pull/2192) open for Phase 3)

### Principles

- **Validate first:** Run spikes before implementing complex features
- **Start simple:** Build MVP, add complexity only if needed
- **User-driven:** Implement Phase 2 features only when users request them
- **Linux-first:** Embrace Unix philosophy — composable tools over monolithic features
- **Archive stale work:** Don't keep unvalidated features alive indefinitely

---

## Related Documentation

- [Research Index](../research/README.md) - Detailed research documents
- [ADR Index](../adr/README.md) - Architecture decision records
- [Contributing Guide](../contributing.md) - Development guidelines
- [Module Index](../module-index.md) - Codebase structure

### Recent ADRs

- [ADR-012: Intune SSO Broker Compatibility](../adr/012-intune-sso-broker-compatibility.md) - Microsoft Identity Broker v2.0.2+ compatibility
- [ADR-013: PII Log Sanitization](../adr/013-pii-log-sanitization.md) - Automatic PII sanitization for all logs
- [ADR-014: Quick Chat Deep Link Approach](../adr/014-quick-chat-deep-link-approach.md) - Deep links for chat navigation
- [ADR-015: Quick Chat Inline Messaging](../adr/015-quick-chat-inline-messaging.md) - Inline messaging via Teams React internals
