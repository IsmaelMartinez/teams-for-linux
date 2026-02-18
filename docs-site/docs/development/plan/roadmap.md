# Development Roadmap

**Last Updated:** 2026-02-17
**Current Version:** v2.7.6
**Status:** Living Document — planning v2.7.7 and v2.8.0

This document outlines the future development direction for Teams for Linux, organized by priority and readiness for implementation.

## Quick Reference

| Priority | Feature | Status | Effort | Target |
|----------|---------|--------|--------|--------|
| **Next** | MQTT Screen Sharing Status (#2107) | PR in progress (partial) | Tiny | v2.7.7 |
| **Verify** | XWayland GPU fix (#2169) | Awaiting user confirmation | Small | v2.7.7 |
| **Verify** | --appTitle/--appIcon fix (#2143) | Awaiting user confirmation | Small | v2.7.7 |
| **Ready** | Electron 40 upgrade | Research complete | Medium | v2.8.0 |
| **Ready** | ESLint 10 upgrade | Ready to implement | Small | v2.8.0 |
| **Done** | AppImage auto-update (#2157) | Shipped in v2.7.6 | Medium | Done |
| **Done** | Code quality hardening | Complete (Phases 1-3) | Small | Done |
| **Low** | Screen Lock Media Privacy (#2106) | Awaiting user feedback | Small | — |
| **Low** | MQTT Extended Status Phase 2 | Awaiting user feedback | Small | — |

---

## Next Patch Release (v2.7.7)

### In Progress

| Item | Description | Branch | Status |
|------|-------------|--------|--------|
| **#2107/#2144** | MQTT Screen Sharing Status — publish to `{topicPrefix}/screen-sharing` | PR #2144 | Stop event works; start event not firing yet |

### Awaiting User Confirmation

These fixes are believed to be resolved but need user validation before closing.

| Item | Description | Status |
|------|-------------|--------|
| **#2169/#2170** | XWayland GPU fix — camera broken on Wayland sessions | PR #2170 submitted, likely fixed, awaiting user confirmation |
| **#2143** | --appTitle and --appIcon not working | Believed fixed, user pinged 2026-02-16, awaiting response |

### Open Bugs (candidates for v2.7.7)

| Issue | Description | Notes |
|-------|-------------|-------|
| **#2184** | Can't register Quick Chat keyboard shortcut | Reported 2026-02-17 |
| **#2186** | App menu incomplete when tray icon disabled | Reported 2026-02-17 |
| **#2152** | Cannot join meeting with ID and passcode | Meeting join flow broken |
| **#2131** | MQTT status no longer being detected | MQTT integration regression |
| **#2140** | New meeting link format (`teams.microsoft.com/meet/...?p=...`) | Microsoft changed URL format |
| **#2137** | Chat message gets scroll bar | UI rendering issue |
| **#2025** | Second ringer option causes exception | Incoming call exception |

---

## Next Minor Release (v2.8.0)

Electron 40 is a major dependency upgrade (new Chromium, new Node.js, new V8). It warrants a minor version bump.

### Ready to Implement

| Item | Description | Notes |
|------|-------------|-------|
| **Electron 40** | Electron 39.5.1 → 40.4.0 (Chromium 144, Node.js 24, V8 14.4) | [Research](../research/electron-40-migration-research.md); no blocking breaking changes |
| **ESLint 10** | ESLint/`@eslint/js` 9.39.2 → 10.0.x | Major version bump — flat config already in use, minimal impact |

**Routine dependency updates** (patch/minor, low risk): `@homebridge/dbus-native` 0.7.3, Docusaurus 3.9.2, React 19.2.4, TypeScript 5.9.3.

### Awaiting User Validation

| Item | Description | Notes |
|------|-------------|-------|
| **#2095** | `--appIcon` not working in KDE window list | PR #2104 merged in v2.7.3; may still be blocked by Electron |
| **#1860** | Camera resolution/aspect ratio issues | PR #2060 merged in v2.7.3; needs user testing to confirm fix |

### Blocked (External Dependencies)

| Issue | Description | Blocker |
|-------|-------------|---------|
| **#2094** | Maximized window gap/shrink on focus loss | Electron |
| **#2074** | Window restore from tray appears tiny | Electron |
| **#2047** | Intune SSO regression (broker v2.0.2+) | Microsoft broker; see [ADR-012](../adr/012-intune-sso-broker-compatibility.md) |
| **#1972** | Microphone doesn't work in meetings | External |
| **#1923** | Wayland screen sharing with snap | External |
| **#1879** | App prevents sleep | External |

### Parked (Awaiting User Response)

| Item | Description | Notes |
|------|-------------|-------|
| **#2036** | GNOME 49 notification focus | Likely window manager issue |

---

## Feature Details

### MQTT Screen Sharing Status

**Issue:** [#2107](https://github.com/IsmaelMartinez/teams-for-linux/issues/2107)
**Original Request:** [#1938](https://github.com/IsmaelMartinez/teams-for-linux/issues/1938) by @vbartik
**Related:** [mqtt-extended-status-investigation.md](../research/mqtt-extended-status-investigation.md)
**Effort:** Tiny
**Status:** PR #2144 in progress — stop event publishes correctly, start event not yet firing

**Description:** Wire existing `screen-sharing-started` and `screen-sharing-stopped` IPC events to MQTT publish.

**Implementation:**

1. Add MQTT publish call when screen sharing starts/stops
2. Publish to `{topicPrefix}/screen-sharing` topic with "true"/"false" values
3. Update documentation

**Current state:** The `screen-sharing-stopped` event fires and publishes correctly. The `screen-sharing-started` event is not being detected yet and needs further investigation.

---

### Screen Lock Media Privacy

**Issue:** [#2106](https://github.com/IsmaelMartinez/teams-for-linux/issues/2106) (replaces [#2015](https://github.com/IsmaelMartinez/teams-for-linux/issues/2015))
**Research:** [screen-lock-media-privacy-investigation.md](../research/screen-lock-media-privacy-investigation.md)
**Branch:** `claude/screen-lock-media-privacy-HMTPA`
**Effort:** Small
**Status:** Awaiting user feedback — PR #2110 open but no user traction

**Description:** Add MQTT commands (`disable-media`, `enable-media`) that users can invoke from their own screen lock scripts to disable camera and microphone when the screen locks.

**Implementation:**

1. Add `disable-media` and `enable-media` to MQTT allowed actions
2. Create browser tool (`app/browser/tools/mediaPrivacy.js`) to track and control media streams
3. Wire MQTT commands to media control functions
4. Update documentation with user scripts for GNOME, KDE, Cinnamon, i3/sway

**Philosophy:** Linux-first approach - expose commands that users wire into their own D-Bus listeners or systemd hooks. More flexible than trying to detect screen lock across all desktop environments.

---

### Custom Notification System Phase 2

**Issue:** [#2108](https://github.com/IsmaelMartinez/teams-for-linux/issues/2108)
**Research:** [custom-notification-system-research.md](../research/custom-notification-system-research.md)
**Feedback:** [#2039](https://github.com/IsmaelMartinez/teams-for-linux/issues/2039)
**Branch:** `claude/custom-notifications-phase-2-wirLH`
**Status:** Dropped — implementation did not work for the user; PR #2112 closed

**MVP Delivered (v2.6.16):**

- Meeting notifications (meeting started) - working with Quickshell/Noctalia
- Toast notifications with auto-dismiss
- Click-to-focus functionality
- Configuration via `notificationMethod: "custom"`

**Phase 2 was attempted but dropped:** The chat, calendar, and activity notification routing did not work correctly for the user. The PR (#2112) has been closed. The MVP from v2.6.16 remains available. Phase 2 may be revisited in the future if there is renewed interest or a different approach is identified.

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

### Screen Lock Media Privacy

**Issue:** [#2106](https://github.com/IsmaelMartinez/teams-for-linux/issues/2106)
**PR:** #2110 (open, no user traction)
**Status:** Awaiting user feedback — feature implemented but no users have tested or requested it

---

### Quick Chat Access

**Issue:** [#2109](https://github.com/IsmaelMartinez/teams-for-linux/issues/2109)
**Status:** ✅ Shipped in v2.7.4

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
| Custom Notifications Phase 2 | [#2108](https://github.com/IsmaelMartinez/teams-for-linux/issues/2108) | Dropped — did not work for user | MVP (v2.6.16) remains; may revisit with different approach |
| Tray Icon Logout Indicator | [#1987](https://github.com/IsmaelMartinez/teams-for-linux/issues/1987) | Archived — user not responding | Work preserved in branch `claude/analyze-research-spikes-XbYVZ`; reopen if requested |
| GNOME Search Provider | [#2075](https://github.com/IsmaelMartinez/teams-for-linux/issues/2075) | Latency too high (~300-1100ms) | Technically feasible via MQTT but poor UX |
| External Browser Auth | [#2017](https://github.com/IsmaelMartinez/teams-for-linux/issues/2017) | Not feasible | Teams manages OAuth internally; no exposed APIs |
| Multiple Windows | [#1984](https://github.com/IsmaelMartinez/teams-for-linux/issues/1984) | Rejected ([ADR-010](../adr/010-multiple-windows-support.md)) | Teams single React context; Quick Chat is the alternative |
| useSystemPicker | — | Rejected ([ADR-008](../adr/008-usesystempicker-electron-38.md)) | Incomplete Linux Wayland/PipeWire support in Electron; reconsider when improved |

---

## Implementation Priorities

### v2.7.7 Release Plan

1. **Fix MQTT Screen Sharing start event** — Complete #2144 so both start and stop publish correctly (#2107)
2. **Confirm user fixes** — Validate #2170 (XWayland GPU/camera) and #2143 (--appTitle/--appIcon) with users
3. **Triage new bugs** — Assess #2184 (Quick Chat shortcut), #2186 (app menu), #2152 (meeting join), #2131 (MQTT status), #2140 (new meeting links)
4. **Release v2.7.7**

### v2.8.0 Release Plan

1. **Electron 40 upgrade** — Major version bump (39.5.1 → 40.4.0); [research complete](../research/electron-40-migration-research.md)
2. **ESLint 10 upgrade** — Major version bump, flat config already in use
3. **Routine dependency updates** — `@homebridge/dbus-native` 0.7.3 and other patch/minor bumps
4. **Release v2.8.0**

### Future Priorities

- ~~**Code quality hardening**~~ — Complete (Phases 1-3)
- ~~**AppImage auto-update**~~ — Shipped in v2.7.6
- **#2107 MQTT Screen Sharing Status** — In progress (PR #2144)
- **GitHub Issue Bot Phases 3-4** — Duplicate detection (embeddings), enhancement context

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
