# Development Roadmap

**Last Updated:** 2026-02-07
**Current Version:** v2.7.3
**Status:** Living Document

This document outlines the future development direction for Teams for Linux, organized by priority and readiness for implementation.

## Quick Reference

| Priority | Feature | Status | Effort |
|----------|---------|--------|--------|
| **High** | Screen Lock Media Privacy (#2106) | PR in review | Small |
| **High** | Custom Notifications Phase 2 (#2108) | PR in review | Medium |
| **High** | Quick Chat Access (#2109/PR #2119) | PR in review - mostly working | Small |
| **Medium** | GitHub Issue Bot (#2126) | Phase 1 in progress | Medium |
| **Low** | [#2107](https://github.com/IsmaelMartinez/teams-for-linux/issues/2107) MQTT Screen Sharing Status | Awaiting user feedback | Tiny |
| **Low** | MQTT Extended Status Phase 2 | Awaiting user feedback | Small |

### Planning for v2.7.4

| Item | Description | Status |
|------|-------------|--------|
| **PR #2101** | MCAS domain suffix handling in hostname validation | Ready to merge |
| **#2106** | Screen Lock Media Privacy - MQTT commands for disable/enable media | PR in review (branch ready) |
| **#2108/#2112** | Custom Notifications Phase 2 - chat, calendar, activity notifications | PR in review (branch ready) |
| **#2109/PR #2119** | Quick Chat Access - People API search, deep links, inline messaging | PR in review (mostly working) |
| **Deps** | Dependency updates and Electron upgrade (if available) | Pending |

### Recently Completed (v2.7.3)

| PR | Description | Status |
|----|-------------|--------|
| **#2082** | Replace clipboard monitoring with join meeting dialog | ✅ Merged |
| **#2118** | PII sanitizer integration with electron-log (Phase 2) | ✅ Merged |
| **#2123** | Fix Teams icon registration - CSP CDN domain allowlist | ✅ Merged |
| **#2128** | Enhanced release notes generation for release workflow | ✅ Merged |
| **#2126** | GitHub Issue Bot research and investigation document | ✅ Merged |
| **#2117** | Electron 39.4.0, electron-builder 26.7.0, globals 17.3.0 | ✅ Merged |
| **#2116** | PII log sanitizer utility (Phase 1) | ✅ Merged |
| **#2111** | Chat API validation spikes for quick chat feasibility | ✅ Merged |
| **#2104** | appIcon KDE fix - Convert window icon to nativeImage | ✅ Merged |
| **#2060** | Camera resolution and aspect ratio browser tools | ✅ Merged |
| **#2102** | AppImage extraction fix (no execute permissions) | ✅ Merged |

---

## Current Focus (v2.7.4)

### In Progress - PRs Ready for Review

| Item | Description | Branch | Status |
|------|-------------|--------|--------|
| **PR #2101** | MCAS domain suffix in hostname validation | contributor fork | Ready to merge (partial fix) |
| **#2106** | Screen Lock Media Privacy - MQTT `disable-media`/`enable-media` commands | `claude/screen-lock-media-privacy-HMTPA` | PR in review |
| **#2108/#2112** | Custom Notifications Phase 2 - chat, calendar, activity events | `claude/custom-notifications-phase-2-wirLH` | PR in review |
| **#2109/PR #2119** | Quick Chat Access - People API, deep links, inline messaging | `claude/document-chat-modal-l0Ty0` | PR in review (mostly working) |

### Ready to Implement

| Item | Description | Notes |
|------|-------------|-------|
| **Deps** | Dependency updates | Routine maintenance |

### Awaiting User Validation (Post v2.7.3)

| Item | Description | Notes |
|------|-------------|-------|
| **#2095** | `--appIcon` not working in KDE window list | PR #2104 merged; may still be blocked by Electron |
| **#2065** | AppImage update info not working | PR #2102 merged; packaging issue, may not be fixable |
| **#1860** | Camera resolution/aspect ratio issues | PR #2060 merged; needs user testing to confirm fix |

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
| **#2048** | Uninstall instructions | Good first issue for contributors |
| **#2036** | GNOME 49 notification focus | Likely window manager issue |

---

## Ready for Implementation

These features have completed research and are ready to be built.

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

**Philosophy:** Linux-first approach - expose commands that users wire into their own D-Bus listeners or systemd hooks. This is more flexible than trying to detect screen lock across all desktop environments.

**Value:**

- Privacy protection during meetings
- Matches Windows Teams client behavior
- Leverages existing MQTT infrastructure

---

### Quick Chat Access

**Issue:** [#2109](https://github.com/IsmaelMartinez/teams-for-linux/issues/2109), [#1984](https://github.com/IsmaelMartinez/teams-for-linux/issues/1984) (Original request)
**PR:** [#2119](https://github.com/IsmaelMartinez/teams-for-linux/pull/2119)
**Branch:** `claude/document-chat-modal-l0Ty0`
**Research:** [chat-modal-investigation.md](../research/chat-modal-investigation.md), [chat-modal-spike-results.md](../research/chat-modal-spike-results.md)
**ADRs:** ADR-014 (Deep Link Approach), ADR-015 (Inline Messaging) - included in PR #2119
**Effort:** Small
**Status:** PR in review - mostly working

**What's Implemented (PR #2119):**

- `app/quickChat/` module - QuickChatModal with search UI
- `app/graphApi/index.js` - GraphApiClient with `searchPeople` method
- People API search for contacts ranked by interaction
- Deep link navigation to open chats (`openChatWithUser`)
- Inline message sending via Teams React internals
- Menu item and keyboard shortcut integration
- IPC channels registered and allowlisted
- Configuration and documentation updates

**Scope:**

- Search for contacts via People API
- Click to open chat (navigates Teams via deep link)
- Inline message sending (via Teams React internals - see ADR-015)
- No message history display (API blocked)

**Value:**

- Quick access to start/open chat without navigating Teams UI
- Practical alternative to rejected multiple windows feature ([ADR-010](../adr/010-multiple-windows-support.md))
- Can enhance notification clicks to open chat with sender

---

### PII Log Sanitization - Complete

**ADR:** [ADR-013: PII Log Sanitization](../adr/013-pii-log-sanitization.md)
**Status:** ✅ All phases complete

**Key Components:**

- `app/utils/logSanitizer.js` - Core sanitizer with regex patterns for emails, IPs, tokens, UUIDs, etc.
- `app/config/logger.js` - electron-log hook that automatically sanitizes all log output
- Comprehensive unit tests covering all PII patterns and edge cases

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

**Value:**

- Completes media status picture for home automation
- IPC events already exist - just needs wiring

---

## User Feedback Received - Improvements Needed

These features have MVP implementations and real user feedback identifying gaps.

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

## Strategic / Future

### GitHub Issue Bot

**Research:** [github-issue-bot-investigation.md](../research/github-issue-bot-investigation.md)
**Status:** Phase 1 (Information Request Bot) in progress
**Priority:** Medium
**Effort:** Medium

**Description:** Intelligent GitHub issue automation to suggest solutions from documentation, detect duplicates, request missing info, and reduce maintainer workload.

**Phase 1 — Information Request Bot (in progress):**

- Workflow: `.github/workflows/issue-triage-bot.yml`
- Detects missing reproduction steps, debug output, and expected behavior in bug reports
- Notes when bug is reproducible on Teams web/PWA (may be a Microsoft issue)
- Posts helpful comment with checklist of missing info and debug instructions
- Uses humble, suggestive language; always discloses bot status
- Rate limited: one comment per issue, skips bot accounts

**Future phases:**

- Phase 2: Solution suggestions from troubleshooting docs
- Phase 3: Duplicate detection via embeddings
- Phase 4: Enhancement context from roadmap/research/ADRs

---

### Configuration Organization

**Research:** [configuration-organization-research.md](../research/configuration-organization-research.md)
**Current Status:** Phase 1 Complete

**Approach:** New features use nested configuration patterns from day one (e.g., `mqtt`, `graphApi`, `customNotification`). Existing flat options migrate opportunistically when modules are refactored.

**Already Using Nested Patterns:**

- `mqtt.*` - MQTT integration
- `graphApi.*` - Graph API integration
- `customNotification.*` - Custom notification system
- `cacheManagement.*` - Cache management
- `screenSharingThumbnail.*` - Screen sharing thumbnail

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

**Note:** Presence endpoint returns 403 Forbidden - Teams token lacks `Presence.Read` scope.

---

## Not Planned / Not Feasible

### Tray Icon Logout Indicator - Archived

**Issue:** [#1987](https://github.com/IsmaelMartinez/teams-for-linux/issues/1987)
**PR:** [#2033](https://github.com/IsmaelMartinez/teams-for-linux/pull/2033)
**Research:** [logout-indicator-investigation.md](../research/logout-indicator-investigation.md)
**Branch:** `origin/claude/analyze-research-spikes-XbYVZ`
**Status:** Archived - User not responding

**Reason:** PR #2033 was open for over 3 months with no response from the original requester. Validation spikes were implemented (~50% of the work) but could never be tested by the user who requested the feature. Without user validation, the approach (detecting logout via Teams React internals) remains unproven and risks false positives.

**Work completed (archived in branch):**

- Auth detection spikes (`authSpikes.js`)
- Tray icon overlay rendering
- Configuration structure
- Documentation

**Reopening:** If a user requests this feature again and is willing to test, the branch preserves all spike code for reuse.

---

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

### v2.7.4 Release Plan

1. **Merge PR #2101** - MCAS domain suffix handling (partial fix, user not responding)
2. **Merge Quick Chat Access PR #2119** - People API search, deep links, inline messaging (mostly working)
3. **Merge Screen Lock Media Privacy PR** - MQTT `disable-media`/`enable-media` commands (branch ready)
4. **Merge Custom Notifications Phase 2 PR** - Chat, calendar, activity notifications (branch ready)
5. **Dependency updates** - Routine maintenance, Electron upgrade if available

### Future Priorities

5. **GitHub Issue Bot Phase 1** - Information request bot (in progress)
6. **#2107 MQTT Screen Sharing Status** - Implement if user feedback received
7. **GitHub Issue Bot Phases 2-4** - Solution suggestions, duplicate detection, enhancement context

### Principles

- **Validate first:** Run spikes before implementing complex features
- **Start simple:** Build MVP, add complexity only if needed
- **User-driven:** Implement Phase 2 features only when users request them
- **Linux-first:** Embrace Unix philosophy - composable tools over monolithic features
- **Archive stale work:** Don't keep unvalidated features alive indefinitely

---

## Related Documentation

- [Research Index](../research/README.md) - Detailed research documents
- [ADR Index](../adr/README.md) - Architecture decision records
- [Contributing Guide](../contributing.md) - Development guidelines
- [Module Index](../module-index.md) - Codebase structure

### Recent ADRs

- [ADR-011: AppImage Update Info](../adr/011-appimage-update-info.md) - AppImage auto-update configuration
- [ADR-012: Intune SSO Broker Compatibility](../adr/012-intune-sso-broker-compatibility.md) - Microsoft Identity Broker v2.0.2+ compatibility
- [ADR-013: PII Log Sanitization](../adr/013-pii-log-sanitization.md) - Automatic PII sanitization for all logs
- ADR-014: Quick Chat Deep Link Approach - Deep links for chat navigation (in PR #2119)
- ADR-015: Quick Chat Inline Messaging - Inline messaging via Teams React internals (in PR #2119)
