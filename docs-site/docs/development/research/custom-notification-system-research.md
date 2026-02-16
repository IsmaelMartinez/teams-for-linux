# Custom Notification System Research & Implementation Plan

**Status:** Phase 2.1 - DOM Observer for Notification Interception
**Date:** February 2026
**Issue:** Investigation for alternative notification modal system
**Author:** Claude AI Assistant
**Dependencies:** Incremental Refactoring Plan Phase 1 (Completed)

---

## Executive Summary

This document tracks the development of a **custom notification modal system** for Teams for Linux as an alternative to OS-level notifications. The MVP (toast notifications) has been successfully implemented and released in v2.6.16, with Phase 2 (chat and calendar notifications) completed in v2.7.3.

### Current Status

- ✅ **MVP Complete** (v2.6.16): Toast notifications with auto-dismiss and click-to-focus
- ✅ **Phase 2 Complete** (v2.7.3): Chat and calendar notification routing via `commandChangeReportingService`
- ✅ **Phase 2.1** (v2.7.5+): DOM MutationObserver for notification banner interception
- ✅ **Documentation**: Configuration and usage guides updated
- 🔄 **Next Phase**: Monitoring user feedback for further enhancements

### Key Findings

- Custom BrowserWindow approach works well following the `IncomingCallToast` pattern
- No critical bugs reported since release
- System provides reliable alternative for users with OS notification issues
- Phase 2 adds notification routing for chat messages, calendar invites, and activity notifications
- **Phase 2.1 finding**: Teams does NOT call `new Notification()` for chat messages in production, and `commandChangeReportingService` entity commands arrive with empty title/text for chat messages. Teams renders in-app banners at `[data-testid='notification-wrapper']` instead, which a DOM MutationObserver can intercept.

---

## 1. MVP Implementation Summary (Completed)

### What Was Implemented

The MVP delivered toast notifications as an opt-in alternative (`notificationMethod: "custom"`):

**Files Created:**
```
app/notificationSystem/
├── index.js                     # CustomNotificationManager class + IPC handlers
├── NotificationToast.js         # Toast BrowserWindow class
├── notificationToast.html       # Toast UI (Teams design)
├── notificationToastPreload.js  # Toast preload script
└── README.md                    # Module documentation
```

**Features Delivered:**
- Toast notifications appear for Teams notifications
- Auto-dismiss after configurable duration (default 5 seconds)
- Click toast to focus main window
- Teams design language applied
- Cross-platform compatibility (Linux, Windows, macOS)
- Secure implementation (contextIsolation, IPC validation)

**Configuration:**
```json
{
  "notificationMethod": "custom",
  "customNotification": {
    "toastDuration": 5000
  }
}
```

---

## 2. Phase 2 Implementation Summary (Completed)

### What Was Implemented

Phase 2 addressed user feedback from #2039 regarding missing chat and calendar notifications when using custom notification mode:

**Files Created/Modified:**

```
app/browser/tools/notificationObserver.js  # NEW: Observer for Teams internal notification events
app/browser/tools/activityHub.js           # MODIFIED: Added chat/calendar event handlers
app/browser/notifications/activityManager.js # MODIFIED: Routing to custom notification system
app/browser/preload.js                     # MODIFIED: Added notificationObserver module
```

**Features Delivered:**

- Chat message notifications now route through custom notification system
- Calendar/meeting invite notifications now route through custom notification system
- Activity notifications (mentions, reactions) now route through custom notification system
- All notification types maintain consistent appearance and click-to-focus behavior

**Technical Approach:**

1. **NotificationObserver Module**: New module that observes Teams' internal `commandChangeReportingService` for notification events beyond call notifications
2. **Extended ActivityHub**: Added detection for chat, calendar, and activity notification events based on entity command patterns
3. **Enhanced ActivityManager**: Added handlers that route detected notifications through the custom notification system via IPC

**How It Works:**

1. Teams generates internal events via `commandChangeReportingService.observeChanges()`
2. `activityHub.js` detects notification patterns in entity commands
3. Events are emitted as `chat-notification`, `calendar-notification`, or `activity-notification`
4. `activityManager.js` handles these events and sends them to main process via `notification-show-toast` IPC
5. `CustomNotificationManager` displays the toast notification

---

## 2.1. Phase 2.1: DOM Observer for Notification Interception

### Problem Discovery

User testing with a full-day production log revealed that the Phase 2 implementation (chat/calendar routing via `commandChangeReportingService`) fails to show chat notifications in practice. Three root causes were identified:

1. Teams does NOT call `new Notification()` for chat messages. The `window.Notification` override in preload.js never fires for chat messages — it only fires for certain system notifications.

2. `commandChangeReportingService` entity commands arrive with `hasText:false, hasTitle:false` for most chat messages. The entity options contain only system keys like `reportDismissError`, so our `activityHub.js` detection finds nothing to display.

3. Teams DOES render in-app notification banners at `[data-testid='notification-wrapper']`, but our custom notification CSS immediately hides them with `display:none !important`. The user sees zero notifications despite receiving many messages.

### Solution: DOM MutationObserver

A new `notificationDomObserver.js` module watches for Teams notification wrapper elements being added to the DOM. When detected, it extracts the notification content (sender, message, icon) before CSS hides the element, and sends it through the existing custom toast system.

**Files Created:**
```
app/browser/tools/notificationDomObserver.js  # DOM MutationObserver module
```

**How It Works:**

1. A MutationObserver on `document.body` (with `childList: true, subtree: true`) watches for added nodes
2. When an added node matches or contains `[data-testid='notification-wrapper']`, extraction is scheduled via `requestAnimationFrame` (gives React one frame to populate content)
3. Text content is extracted heuristically: spans and text-bearing divs are collected, first part becomes title, rest becomes body. An `img` element provides the icon.
4. The notification is sent via `globalThis.electronAPI.sendNotificationToast()` to the main process
5. Lightweight 2-second dedup within the observer prevents sending the same notification twice from this source
6. The existing `CustomNotificationManager.#isDuplicate()` (3-second title-based dedup) prevents duplicates when multiple sources fire for the same notification

**Diagnostic Logging:**

The observer logs raw DOM structure at debug level (`[NotificationDomObserver]` prefix). This helps refine selectors from user-submitted logs without requiring code changes.

**Service Discovery:**

The `logAvailableServices()` function in `activityHub.js` now also inspects the `notificationsHandler` core service (confirmed present in user logs) and logs its available methods/properties. This diagnostic data may reveal additional subscription points for future improvements.

---

## 3. Next Steps Investigation

### 3.1 Recommended Next Phase: Notification Center (Session-Based)

Based on the original research and common user needs, the most valuable next enhancement would be a **Notification Center** - a drawer showing current session's notifications.

**Why This Phase:**
- Users cannot review missed notifications with toast-only system
- Provides context when returning to the application
- Follows established patterns (Teams, Slack, Discord all have notification panels)
- Session-based (no persistence) keeps implementation simple

**Proposed Features:**
- Slide-in drawer showing current session's notifications
- Mark as read/unread status
- Badge count on tray icon
- Clear all functionality
- In-memory storage (NotificationStore class)

**Estimated Effort:** 1-2 weeks

### 3.2 Alternative: Enhanced Toast Features

If user feedback indicates toast improvements are more valuable than a notification center:

**Potential Enhancements:**
- Toast queue management (limit visible toasts, e.g., max 3)
- Action buttons (View, Dismiss, Reply)
- Hover to pause auto-dismiss
- Notification stacking (vertical arrangement)

**Estimated Effort:** 3-5 days

### 3.3 Integration Options

These could be done alongside either phase:

- **Tray integration** - Badge count showing unread notifications
- **DND mode** - Respect user availability status
- **Keyboard shortcut** - Toggle notification center (e.g., `Ctrl+Shift+N`)

---

## 4. Decision Criteria for Next Phase

### User Feedback Signals

Before proceeding with Phase 2, evaluate:

1. **Feature requests**: Are users asking for notification history/center?
2. **Toast issues**: Are there reports of problems with current implementation?
3. **Adoption rate**: How many users have switched to `notificationMethod: "custom"`?

### Technical Considerations

1. **Complexity vs Value**: Notification center adds significant complexity
2. **Maintenance burden**: More code to maintain and test
3. **Integration points**: Tray icon, main window focus handling

### Recommendation

**Wait for user feedback** before implementing Phase 2. The MVP provides a working alternative for users with notification issues. Additional features should be driven by actual user needs rather than speculative development.

**Suggested approach:**
1. Monitor GitHub issues for 2-4 weeks post-release
2. Create a discussion or issue asking users what they'd find most valuable
3. Prioritize based on actual feedback

---

## 5. Future Phase Implementation Plan (When Ready)

### 5.1 Notification Center Architecture

```
┌──────────────────────────────────────────────────┐
│              Main Process                        │
│                                                  │
│  ┌─────────────────────────────────────────┐    │
│  │   CustomNotificationManager             │    │
│  │   ├── NotificationToast (existing)      │    │
│  │   ├── NotificationCenter (new)          │    │
│  │   └── NotificationStore (new)           │    │
│  └─────────────────────────────────────────┘    │
└──────────────────────────────────────────────────┘
```

### 5.2 New Files Required

```
app/notificationSystem/
├── center/
│   ├── NotificationCenter.js      # Center BrowserWindow
│   ├── notificationCenter.html    # Center UI
│   └── notificationCenterPreload.js
├── store/
│   └── NotificationStore.js       # In-memory storage
```

### 5.3 New IPC Channels

- `notification-open-center` - Open notification center drawer
- `notification-close-center` - Close notification center
- `notification-mark-read` - Mark notification as read
- `notification-clear-all` - Clear all notifications
- `notification-get-all` - Get all notifications for display

### 5.4 Configuration Additions

```javascript
customNotification: {
  toastDuration: 5000,
  // New Phase 2 options:
  centerEnabled: true,
  maxStoredNotifications: 100,
  showBadgeCount: true
}
```

---

## 6. Long-Term Roadmap

### Phase 3: Enhanced Toast Features
- Toast queue management
- Action buttons
- Hover to pause

### Phase 4: Integration & Polish
- Incoming call toast integration
- Unified notification system
- Performance optimizations

### Phase 5: Advanced Features (If Requested)
- Persistent storage (IndexedDB)
- Search & filter
- Custom sounds per type
- Reply actions
- Snooze functionality

**Philosophy:** Each phase should be validated before proceeding to the next. Add features only when users request them.

---

## 7. Background & Context

### Problem Statement

Users reported OS-level notifications don't work reliably, especially on Linux:
- Application freezes when no notification daemon is running
- Inconsistent behavior across desktop environments
- No notification history or actionable notifications

### Why Custom BrowserWindow Approach

- **No viable third-party libraries** - All existing packages are 5-9 years old
- **React libraries incompatible** - Teams for Linux is an Electron wrapper, not a React app
- **Proven pattern** - `IncomingCallToast` demonstrates this approach works
- **Full control** - Consistent experience across all platforms

### Architectural Constraints

- Cannot modify Teams DOM directly
- Must use separate BrowserWindows for custom UI
- Security requirements: contextIsolation, nodeIntegration disabled
- All IPC channels must be allowlisted

---

## 8. Related Documentation

### Internal References
- **Module README** (`app/notificationSystem/README.md`) - Implementation details
- **[Contributing Guide](../contributing.md)** - Architecture overview
- **[IPC API Documentation](../ipc-api.md)** - IPC channel reference
- **[Configuration Reference](../../configuration.md)** - Config options

### External References
- **[Electron BrowserWindow API](https://www.electronjs.org/docs/latest/api/browser-window)**
- **[Microsoft Fluent Design](https://fluent2.microsoft.design/)**

### Related Issues
- **#1979** - Implement notifications modal MVP
- **#1981** - Add custom notification system to docs
- **#1935** - Build notification modal component research

---

## 9. Conclusion

The custom notification system Phase 2 is complete, addressing user feedback about missing chat and calendar notifications. The system now provides comprehensive notification routing for all Teams notification types when using custom notification mode.

**Completed:**
1. ✅ MVP (v2.6.16): Toast notifications with auto-dismiss and click-to-focus
2. ✅ Phase 2 (v2.7.3): Chat, calendar, and activity notification routing
3. ✅ Phase 2.1 (v2.7.5+): DOM MutationObserver for notification banner interception

**Next Actions:**
1. Monitor user feedback on Phase 2.1 — check for `[NotificationDomObserver]` entries in user logs
2. Refine DOM selectors based on real-world log data
3. Consider Notification Center (Phase 3) based on user demand
4. Investigate `notificationsHandler` service methods for native subscription API

**Key Principle:** Continue the "start simple, iterate based on feedback" approach that has proven successful.

---

**Document Status:** ✅ Phase 2.1 Complete - DOM Observer Added
**Current Version:** v2.7.5+
**Related Issue:** #2108 (Phase 2), #2039 (User Feedback)
