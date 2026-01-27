# Development Roadmap

**Last Updated:** 2026-01-27
**Status:** Living Document

This document outlines the future development direction for Teams for Linux, organized by priority and readiness for implementation.

## Quick Reference

| Priority | Feature | Status | Effort |
|----------|---------|--------|--------|
| **High** | Screen Lock Media Privacy | Ready to implement | 2-3 hours |
| **High** | MQTT Screen Sharing Status | Ready to implement | 1 hour |
| **Medium** | Logout Indicator | Requires validation spikes | 14-22 hours |
| **Medium** | Chat Modal | Requires validation spikes | 8-12 hours |
| **Low** | Custom Notifications Phase 2 | Awaiting user feedback | TBD |
| **Low** | MQTT Extended Status Phase 2 | Awaiting user feedback | TBD |

---

## Ready for Implementation

These features have completed research and are ready to be built.

### Screen Lock Media Privacy

**Issue:** [#2015](https://github.com/IsmaelMartinez/teams-for-linux/issues/2015)
**Research:** [screen-lock-media-privacy-investigation.md](../research/screen-lock-media-privacy-investigation.md)
**Effort:** 2-3 hours

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

### MQTT Screen Sharing Status

**Related:** [mqtt-extended-status-investigation.md](../research/mqtt-extended-status-investigation.md)
**Effort:** ~1 hour

**Description:** Wire existing `screen-sharing-started` and `screen-sharing-stopped` IPC events to MQTT publish.

**Implementation:**

1. Add MQTT publish call when screen sharing starts/stops
2. Publish to `{topicPrefix}/screen-sharing` topic with "true"/"false" values
3. Update documentation

**Value:**

- Completes media status picture for home automation
- IPC events already exist - just needs wiring

---

## Requires Validation First

These features need validation spikes before implementation to prove the approach works.

### Tray Icon Logout Indicator

**Issue:** [#1987](https://github.com/IsmaelMartinez/teams-for-linux/issues/1987)
**Research:** [logout-indicator-investigation.md](../research/logout-indicator-investigation.md)
**Effort:** 14-22 hours (if spikes succeed)

**Description:** Visual indicator on tray icon when logged out of Teams, plus optional notification.

**Required Spikes:**

1. **Spike 1 (CRITICAL):** Can we detect logout via `authProvider._account`? (2-3 hours)
2. **Spike 2 (CRITICAL):** Can we avoid false positives during app startup? (1-2 hours)
3. **Spike 3 (Optional):** Test multi-device logout scenario (1 hour)

**Decision Tree:**

- If Spike 1 fails → Feature not feasible
- If Spike 2 fails → Feature will annoy users, stop
- If both pass → Implement simple version

**Implementation (if spikes pass):**

1. Add auth detection method to ReactHandler
2. Add visual overlay to tray icon when logged out
3. Add notification on logout (configurable)
4. Configuration options for both features

---

### Chat Modal Feature

**Issue:** [#1984](https://github.com/IsmaelMartinez/teams-for-linux/issues/1984)
**Research:** [chat-modal-investigation.md](../research/chat-modal-investigation.md), [chat-modal-spikes-and-gaps.md](../research/chat-modal-spikes-and-gaps.md)
**Effort:** 8-12 hours for Phase 1 (if spikes succeed)

**Description:** Lightweight chat modal for quick messaging without navigating away from current Teams view.

**Required Spikes:**

1. **Spike 1 (CRITICAL):** Test if `Chat.Read`/`Chat.ReadWrite` permissions are available in Teams token
2. **Spike 2 (CRITICAL):** Test chat discovery for 1:1 conversations
3. **Spike 3:** Test first-time message sending (chat creation)
4. **Spike 4:** Test user search API permissions

**Decision Tree:**

- If Spike 1 returns 403 Forbidden → Feature cannot be implemented as designed
- Alternative if blocked: Use Teams deep links instead of API

**Implementation (if spikes pass):**

1. Extend GraphApiClient with chat methods
2. Create ChatModal and ChatModalManager classes
3. Build UI (search + send)
4. Add keyboard shortcut to show modal

---

## Awaiting User Feedback

These features have completed initial implementation. Further phases depend on user requests.

### Custom Notification System Phase 2

**Research:** [custom-notification-system-research.md](../research/custom-notification-system-research.md)
**Current Status:** MVP Complete (v2.6.16)

**MVP Delivered:**

- Toast notifications with auto-dismiss
- Click-to-focus functionality
- Configuration via `notificationMethod: "custom"`

**Phase 2 (If Requested):**

- Notification center drawer
- Mark as read/unread
- Badge count on tray icon
- Clear all functionality

**Trigger:** Monitor GitHub issues for 2-4 weeks; implement if users request notification history/center features.

---

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

### Suggested Order

1. **Screen Lock Media Privacy** - Low risk, high value, builds on existing MQTT
2. **MQTT Screen Sharing Status** - Minimal effort, completes media status
3. **Logout Indicator Spikes** - Validate before committing to implementation
4. **Chat Modal Spikes** - Validate API permissions before building

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
