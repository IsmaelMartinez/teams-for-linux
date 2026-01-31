# Development Roadmap

**Last Updated:** 2026-01-31
**Current Version:** v2.7.2
**Status:** Living Document

This document outlines the future development direction for Teams for Linux, organized by priority and readiness for implementation.

## Quick Reference

| Priority | Feature | Status | Effort |
|----------|---------|--------|--------|
| **High** | PR #2082 Join Meeting Dialog | In progress | Nearly done |
| **High** | PR #2101 MCAS Domain Handling | Pending final checks | Tiny |
| **High** | [#2106](https://github.com/IsmaelMartinez/teams-for-linux/issues/2106) Screen Lock Media Privacy | Ready to implement | Small |
| **Low** | [#2107](https://github.com/IsmaelMartinez/teams-for-linux/issues/2107) MQTT Screen Sharing Status | Awaiting user feedback | Tiny |
| **Medium** | [#2108](https://github.com/IsmaelMartinez/teams-for-linux/issues/2108) Custom Notifications Phase 2 | User feedback confirms gaps | Medium |
| **Medium** | [#2109](https://github.com/IsmaelMartinez/teams-for-linux/issues/2109) Quick Chat Access | Spikes complete - deep link approach ready | Small |
| **Medium** | #2095 appIcon KDE regression | PR #2104 awaiting validation | - |
| **Medium** | #2065 AppImage update info | PR #2102 awaiting validation | - |
| **Low** | PR #2033 Logout Indicator | Parked - user not responding | - |
| **Low** | PR #2060 Camera Resolution | Parked - user not responding | - |
| **Low** | MQTT Extended Status Phase 2 | Awaiting user feedback | Small |

---

## Current Focus (v2.7.3)

### In Progress

| Item | Description | Status |
|------|-------------|--------|
| **PR #2082** | Replace clipboard monitoring with join meeting dialog (fixes Wayland/Flatpak) | In branch |
| **PR #2101** | MCAS domain suffix in hostname validation | Pending final checks |

### Awaiting User Validation

| Item | Description | Notes |
|------|-------------|-------|
| **#2095** | `--appIcon` not working in KDE window list | PR #2104 submitted as fix; awaiting user feedback |
| **#2065** | AppImage update info not working | PR #2102 merged; awaiting user validation of fix |

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
| **PR #2033** | Logout indicator to tray icon | User not responding |
| **PR #2060** | Camera resolution/aspect ratio | User not responding |
| **#2048** | Uninstall instructions | Good first issue for contributors |
| **#2036** | GNOME 49 notification focus | Likely window manager issue |

---

## Ready for Implementation

These features have completed research and are ready to be built.

### Screen Lock Media Privacy

**Issue:** [#2106](https://github.com/IsmaelMartinez/teams-for-linux/issues/2106) (replaces [#2015](https://github.com/IsmaelMartinez/teams-for-linux/issues/2015))
**Research:** [screen-lock-media-privacy-investigation.md](../research/screen-lock-media-privacy-investigation.md)
**Effort:** Small

**Description:** Add MQTT commands (`disable-media`, `enable-media`) that users can invoke from their own screen lock scripts to disable camera and microphone when the screen locks.

**Implementation:**

1. Add `disable-media` and `enable-media` to MQTT allowed actions
2. Create browser tool (`app/browser/tools/mediaPrivacy.js`) to track and control media streams
3. Wire MQTT commands to media control functions
4. Update documentation with user scripts for GNOME, KDE, Cinnamon, i3/sway

**Philosophy:** Linux-first approach - expose commands that users wire into their own D-Bus listeners or systemd hooks. This is more flexible than trying to detect screen lock across all desktop environments.

**Value:**

- Privacy protection during meetings
- Matches Windows Teams client behavior
- Leverages existing MQTT infrastructure

---

### Quick Chat Access

**Issue:** [#2109](https://github.com/IsmaelMartinez/teams-for-linux/issues/2109), [#1984](https://github.com/IsmaelMartinez/teams-for-linux/issues/1984) (Original request)
**Research:** [chat-modal-investigation.md](../research/chat-modal-investigation.md), [chat-modal-spike-results.md](../research/chat-modal-spike-results.md)
**Effort:** Small
**Status:** ✅ Spikes complete - ready for implementation

**Spike Results (2025-01-31):**

- ❌ Chat API (`/me/chats`) - 403 Forbidden (Teams token lacks permissions)
- ✅ People API (`/me/people`) - Works, returns contacts ranked by interaction
- ✅ Deep links (`/l/chat/0/0?users=email`) - Works, navigates Teams to chat

**Revised Implementation (Deep Link Approach):**

1. Add `searchPeople` method to GraphApiClient
2. Create QuickChatModal with user search UI
3. On user selection, navigate via deep link (`openChatWithUser`)
4. Add keyboard shortcut to show modal (e.g., Ctrl+Shift+C)
5. Optional: enhance notification clicks to open chat with sender

**Already Implemented:**

- `window.electronAPI.openChatWithUser(email)` - deep link navigation helper

**Scope (Simplified):**

- Search for contacts via People API
- Click to open chat (navigates Teams, no inline messaging)
- No message history display (API blocked)
- No inline message sending (API blocked)

**Value:**

- Quick access to start/open chat without navigating Teams UI
- Practical alternative to rejected multiple windows feature ([ADR-010](../adr/010-multiple-windows-support.md))
- Can enhance notification clicks to open chat with sender

---

### MQTT Screen Sharing Status

**Issue:** [#2107](https://github.com/IsmaelMartinez/teams-for-linux/issues/2107)
**Original Request:** [#1938](https://github.com/IsmaelMartinez/teams-for-linux/issues/1938) by @vbartik
**Related:** [mqtt-extended-status-investigation.md](../research/mqtt-extended-status-investigation.md)
**Effort:** Tiny
**Status:** ⏸️ Awaiting user feedback (original requester inactive since Nov 2025)

**Description:** Wire existing `screen-sharing-started` and `screen-sharing-stopped` IPC events to MQTT publish.

**Implementation:**

1. Add MQTT publish call when screen sharing starts/stops
2. Publish to `{topicPrefix}/screen-sharing` topic with "true"/"false" values
3. Update documentation

**Value:**

- Completes media status picture for home automation
- IPC events already exist - just needs wiring

---

## Parked - Awaiting User Response

### Tray Icon Logout Indicator

**Issue:** [#1987](https://github.com/IsmaelMartinez/teams-for-linux/issues/1987)
**PR:** [#2033](https://github.com/IsmaelMartinez/teams-for-linux/pull/2033)
**Research:** [logout-indicator-investigation.md](../research/logout-indicator-investigation.md)
**Branch:** `origin/claude/analyze-research-spikes-XbYVZ`
**Status:** ⏸️ PARKED - User not responding to PR

**Description:** Visual indicator on tray icon when logged out of Teams, plus optional notification.

**Work Completed (~50%):**

- ✅ Validation spikes implemented (`authSpikes.js` - 1095 lines)
- ✅ Auth detection methods added to `reactHandler.js`
- ✅ Tray icon overlay rendering (`trayIconRenderer.js`)
- ✅ Configuration structure added
- ✅ Documentation updated with spike results
- ❓ Awaiting user testing/validation of the approach

**Work Summary:** Auth detection spike code, tray icon overlay rendering, and configuration structure. See branch for details.

**Next Steps:**

- If no response by end of February 2026, consider closing issue and archiving branch
- Alternative: Merge as experimental feature behind config flag

---

## Requires Validation First

These features need validation spikes before implementation to prove the approach works.

(No features currently in this section - all pending spikes have been completed.)

---

## User Feedback Received - Improvements Needed

These features have MVP implementations and real user feedback identifying gaps.

### Custom Notification System Phase 2

**Issue:** [#2108](https://github.com/IsmaelMartinez/teams-for-linux/issues/2108)
**Research:** [custom-notification-system-research.md](../research/custom-notification-system-research.md)
**Feedback:** [#2039](https://github.com/IsmaelMartinez/teams-for-linux/issues/2039)
**Current Status:** MVP Complete (v2.6.16) - User feedback confirms gaps
**Priority:** Medium

**MVP Delivered:**

- ✅ Meeting notifications (meeting started) - working with Quickshell/Noctalia
- ✅ Toast notifications with auto-dismiss
- ✅ Click-to-focus functionality
- ✅ Configuration via `notificationMethod: "custom"`

**Known Gaps (from #2039):**

- ❌ **Chat notifications** - Private/group chat messages only appear in internal notification, not system
- ❌ **Calendar invitations** - Meeting invites bypass system notification handler
- Different notification types use separate code paths

**Phase 2 Priority Items:**

1. Route chat notifications through custom notification system
2. Route calendar invitation notifications through custom notification system
3. Investigate unified notification handling

**Phase 2 Nice-to-Have:**

- Notification center drawer
- Mark as read/unread
- Badge count on tray icon

**Status:** User actively using feature, confirmed it helps but incomplete coverage.

---

## Awaiting User Feedback

These features have completed initial implementation. Further phases depend on user requests.

### MQTT Extended Status Phase 2

**Research:** [mqtt-extended-status-investigation.md](../research/mqtt-extended-status-investigation.md)
**Current Status:** Phase 1 Complete

**Phase 1 Delivered:**

- Generic `publish()` method for MQTT
- Infrastructure for media status publishing
- Last Will and Testament (LWT) for connection state
- Call state (`in-call`) publishing

**Phase 2 (If Requested):**

- WebRTC monitoring for camera/microphone state
- Granular media state (`camera`, `microphone` topics)

**Trigger:** User confirms they need granular camera/mic state in addition to call state for RGB LED automation.

---

### Graph API Enhanced Features

**Research:** [graph-api-integration-research.md](../research/graph-api-integration-research.md)
**Current Status:** Phase 1 POC Complete

**Phase 1 Delivered:**

- Token acquisition via Teams React authentication provider
- Calendar endpoints (`GET /me/calendar/events`, `GET /me/calendar/calendarView`)
- Mail endpoints (`GET /me/messages`)
- IPC handlers for renderer access

**Phase 2 (Future):**

- Calendar sync with desktop notifications
- Mail preview notifications
- Error handling improvements
- Retry logic with exponential backoff

**Phase 3 (Future):**

- Calendar widget/panel
- Quick actions for meetings
- Settings UI for Graph API options

**Note:** Presence endpoint returns 403 Forbidden - Teams token lacks `Presence.Read` scope.

---

## Strategic / Incremental

These are long-term improvements that happen incrementally.

### Configuration Organization

**Research:** [configuration-organization-research.md](../research/configuration-organization-research.md)
**Current Status:** Phase 1 Complete

**Approach:** New features use nested configuration patterns from day one (e.g., `mqtt`, `graphApi`, `customNotification`). Existing flat options migrate opportunistically when modules are refactored.

**No Planned:**

- Comprehensive auto-migration tooling
- Coordinated migration effort

**Already Using Nested Patterns:**

- `mqtt.*` - MQTT integration
- `graphApi.*` - Graph API integration
- `customNotification.*` - Custom notification system
- `cacheManagement.*` - Cache management
- `screenSharingThumbnail.*` - Screen sharing thumbnail

---

## Not Planned / Not Feasible

### GNOME Search Provider

**Issue:** [#2075](https://github.com/IsmaelMartinez/teams-for-linux/issues/2075)
**Research:** [gnome-search-provider-investigation.md](../research/gnome-search-provider-investigation.md)
**Status:** Not Recommended

**Reason:** Technically feasible via MQTT if Teams is running, but latency (~300-1100ms) makes UX poor for search provider use case.

---

### External Browser Authentication

**Issue:** [#2017](https://github.com/IsmaelMartinez/teams-for-linux/issues/2017)
**Research:** [external-browser-authentication-investigation.md](../research/external-browser-authentication-investigation.md)
**Status:** Not Feasible

**Reason:** Teams web app manages OAuth internally without exposed APIs. Externally-obtained tokens won't work with Teams.

**Note:** `ssoBasicAuthPasswordCommand` is for proxy/network auth only, NOT Teams login.

---

### Multiple Windows Support

**Issue:** [#1984](https://github.com/IsmaelMartinez/teams-for-linux/issues/1984)
**ADR:** [ADR-010](../adr/010-multiple-windows-support.md)
**Status:** Rejected

**Reason:** Technically infeasible due to how Teams manages state and authentication in a single React application context.

**Alternative:** Chat modal provides a simpler approach for quick access to chat functionality.

---

### useSystemPicker (Native Screen Picker)

**ADR:** [ADR-008](../adr/008-usesystempicker-electron-38.md)
**Status:** Rejected

**Reason:** Incomplete Linux Wayland/PipeWire support in Electron 38. Will reconsider when Linux support improves.

---

## Implementation Priorities

### Suggested Order (v2.7.3)

1. **Finish PR #2082** - Join meeting dialog (in progress)
2. **Merge PR #2101** - MCAS domain suffix handling (pending final checks)
3. **Merge PR #2104** - appIcon KDE fix (awaiting user validation)
4. **#2106 Screen Lock Media Privacy** - Low risk, high value, builds on existing MQTT
5. **#2109 Quick Chat Access** - Spikes complete, deep link approach ready to build
6. **#2108 Custom Notifications Phase 2** - Address user-confirmed gaps

### Future Priorities

7. **Logout Indicator** - Parked; resume only if user responds to PR #2033
8. **#2107 MQTT Screen Sharing Status** - Awaiting user feedback from original requester

### Principles

- **Validate first:** Run spikes before implementing complex features
- **Start simple:** Build MVP, add complexity only if needed
- **User-driven:** Implement Phase 2 features only when users request them
- **Linux-first:** Embrace Unix philosophy - composable tools over monolithic features

---

## Related Documentation

- [Research Index](../research/README.md) - Detailed research documents
- [ADR Index](../adr/README.md) - Architecture decision records
- [Contributing Guide](../contributing.md) - Development guidelines
- [Module Index](../module-index.md) - Codebase structure

### Recent ADRs

- [ADR-011: AppImage Update Info](../adr/011-appimage-update-info.md) - AppImage auto-update configuration
- [ADR-012: Intune SSO Broker Compatibility](../adr/012-intune-sso-broker-compatibility.md) - Microsoft Identity Broker v2.0.2+ compatibility
