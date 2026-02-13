# Development Roadmap

**Last Updated:** 2026-02-13
**Current Version:** v2.7.4
**Status:** Living Document — planning v2.7.5

This document outlines the future development direction for Teams for Linux, organized by priority and readiness for implementation.

## Quick Reference

| Priority | Feature | Status | Effort |
|----------|---------|--------|--------|
| **Next** | Screen Lock Media Privacy (#2106) | PR in review | Small |
| **Next** | Custom Notifications Phase 2 (#2108) | PR in review | Medium |
| **Ready** | AppImage auto-update (#2157) | Ready to implement | Medium |
| **Ready** | Electron 40 upgrade | Ready to implement | Medium |
| **Ready** | ESLint 10 upgrade | Ready to implement | Small |
| **Low** | [#2107](https://github.com/IsmaelMartinez/teams-for-linux/issues/2107) MQTT Screen Sharing Status | Awaiting user feedback | Tiny |
| **Low** | MQTT Extended Status Phase 2 | Awaiting user feedback | Small |

---

## Next Release (v2.7.5)

### PRs in Review

| Item | Description | Branch | Status |
|------|-------------|--------|--------|
| **#2106** | Screen Lock Media Privacy - MQTT `disable-media`/`enable-media` commands | `claude/screen-lock-media-privacy-HMTPA` | PR in review |
| **#2108/#2112** | Custom Notifications Phase 2 - chat, calendar, activity events | `claude/custom-notifications-phase-2-wirLH` | PR in review |

### Ready to Implement

| Item | Description | Notes |
|------|-------------|-------|
| **[#2157](https://github.com/IsmaelMartinez/teams-for-linux/issues/2157)** | In-app auto-update via electron-updater for AppImage | [Research](../research/electron-updater-auto-update-research.md); supersedes #2065 |
| **Electron 40** | Electron 39.5.1 → 40.4.0 | Major version bump — requires testing |
| **ESLint 10** | ESLint/`@eslint/js` 9.39.2 → 10.0.x | Major version bump — config changes likely |

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

### Screen Lock Media Privacy

**Issue:** [#2106](https://github.com/IsmaelMartinez/teams-for-linux/issues/2106) (replaces [#2015](https://github.com/IsmaelMartinez/teams-for-linux/issues/2015))
**Research:** [screen-lock-media-privacy-investigation.md](../research/screen-lock-media-privacy-investigation.md)
**Branch:** `claude/screen-lock-media-privacy-HMTPA`
**Effort:** Small
**Status:** PR in review

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
**Current Status:** PR in review
**Priority:** High

**MVP Delivered (v2.6.16):**

- Meeting notifications (meeting started) - working with Quickshell/Noctalia
- Toast notifications with auto-dismiss
- Click-to-focus functionality
- Configuration via `notificationMethod: "custom"`

**Phase 2 Implementation (in branch):**

- Route chat notifications through custom notification system
- Route calendar invitation notifications through custom notification system
- Route activity notifications through custom notification system
- Fix notification lifecycle and hide native Teams toasts
- Fix spurious notifications on chat navigation

**Phase 2 Nice-to-Have (future):**

- Notification center drawer
- Mark as read/unread
- Badge count on tray icon

**Status:** User actively using feature, confirmed it helps but incomplete coverage.

---

### MQTT Screen Sharing Status

**Issue:** [#2107](https://github.com/IsmaelMartinez/teams-for-linux/issues/2107)
**Original Request:** [#1938](https://github.com/IsmaelMartinez/teams-for-linux/issues/1938) by @vbartik
**Related:** [mqtt-extended-status-investigation.md](../research/mqtt-extended-status-investigation.md)
**Effort:** Tiny
**Status:** Awaiting user feedback (original requester inactive since Nov 2025)

**Description:** Wire existing `screen-sharing-started` and `screen-sharing-stopped` IPC events to MQTT publish.

**Implementation:**

1. Add MQTT publish call when screen sharing starts/stops
2. Publish to `{topicPrefix}/screen-sharing` topic with "true"/"false" values
3. Update documentation

---

## Strategic / Future

### GitHub Issue Bot

**Research:** [github-issue-bot-investigation.md](../research/github-issue-bot-investigation.md)
**Status:** Phase 1 ✅ Merged (v2.7.4), Phase 2+ planned
**Priority:** Medium

**Phase 1 Delivered:** Information request bot — detects missing reproduction steps, debug output, and expected behavior in bug reports. Posts helpful comment with checklist.

**Future phases:**

- Phase 2: Solution suggestions from troubleshooting docs (AI-powered with Gemini)
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
| Tray Icon Logout Indicator | [#1987](https://github.com/IsmaelMartinez/teams-for-linux/issues/1987) | Archived — user not responding | Work preserved in branch `claude/analyze-research-spikes-XbYVZ`; reopen if requested |
| GNOME Search Provider | [#2075](https://github.com/IsmaelMartinez/teams-for-linux/issues/2075) | Latency too high (~300-1100ms) | Technically feasible via MQTT but poor UX |
| External Browser Auth | [#2017](https://github.com/IsmaelMartinez/teams-for-linux/issues/2017) | Not feasible | Teams manages OAuth internally; no exposed APIs |
| Multiple Windows | [#1984](https://github.com/IsmaelMartinez/teams-for-linux/issues/1984) | Rejected ([ADR-010](../adr/010-multiple-windows-support.md)) | Teams single React context; Quick Chat is the alternative |
| useSystemPicker | — | Rejected ([ADR-008](../adr/008-usesystempicker-electron-38.md)) | Incomplete Linux Wayland/PipeWire support in Electron; reconsider when improved |

---

## Implementation Priorities

### v2.7.5 Release Plan

1. **Merge Screen Lock Media Privacy PR** — MQTT `disable-media`/`enable-media` commands (#2106)
2. **Merge Custom Notifications Phase 2 PR** — Chat, calendar, activity notifications (#2108)
3. **Electron 40 upgrade** — Major version bump (39.5.1 → 40.4.0), requires testing
4. **ESLint 10 upgrade** — Major version bump, config changes likely
5. **Routine dependency updates** — Patch/minor bumps
6. **Release v2.7.5**

### Future Priorities

- **#2107 MQTT Screen Sharing Status** — Implement if user feedback received
- **GitHub Issue Bot Phases 2-4** — Solution suggestions (AI), duplicate detection (embeddings), enhancement context

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
