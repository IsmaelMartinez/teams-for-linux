# Custom Notification System Research & Implementation Plan

:::warning Phase 2 Dropped
MVP shipped in v2.6.16. Phase 2 (chat, calendar, activity notifications) was attempted but dropped — notifications worked on the maintainer's machine but the user reported receiving no notifications at all. It remains unclear whether the implementation failed in their environment or whether the user's expectations differed from what was delivered. See [#2108](https://github.com/IsmaelMartinez/teams-for-linux/issues/2108), [#2039](https://github.com/IsmaelMartinez/teams-for-linux/issues/2039).
:::

**Status:** MVP Complete (v2.6.16) | Phase 2 Dropped
**Date:** November 2025
**Issue:** Investigation for alternative notification modal system
**Author:** Claude AI Assistant
**Dependencies:** Incremental Refactoring Plan Phase 1 (Completed)

---

## Executive Summary

This document tracks the development of a **custom notification modal system** for Teams for Linux as an alternative to OS-level notifications. The MVP (toast notifications) has been successfully implemented and released in v2.6.16.

### Current Status

- ✅ **MVP Complete** (v2.6.16): Toast notifications with auto-dismiss and click-to-focus
- ✅ **Documentation**: Configuration and usage guides updated
- ❌ **Phase 2 Dropped**: Chat/calendar/activity notification routing did not work for the requesting user

### Key Findings

- Custom BrowserWindow approach works well following the `IncomingCallToast` pattern for meeting notifications
- Phase 2 notification routing worked reliably on the maintainer's machine during development and testing
- The requesting user ([#2039](https://github.com/IsmaelMartinez/teams-for-linux/issues/2039)) reported receiving no notifications, or their expectations may have differed from what the implementation delivered
- Root cause is unclear: could be environment-specific (desktop environment, notification daemon, Teams account type) or a mismatch between what was built and what the user needed
- Issue [#2039](https://github.com/IsmaelMartinez/teams-for-linux/issues/2039) closed as not feasible given the ambiguity

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

## 2. Next Steps Investigation

### 2.1 Recommended Next Phase: Notification Center (Session-Based)

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

### 2.2 Alternative: Enhanced Toast Features

If user feedback indicates toast improvements are more valuable than a notification center:

**Potential Enhancements:**
- Toast queue management (limit visible toasts, e.g., max 3)
- Action buttons (View, Dismiss, Reply)
- Hover to pause auto-dismiss
- Notification stacking (vertical arrangement)

**Estimated Effort:** 3-5 days

### 2.3 Integration Options

These could be done alongside either phase:

- **Tray integration** - Badge count showing unread notifications
- **DND mode** - Respect user availability status
- **Keyboard shortcut** - Toggle notification center (e.g., `Ctrl+Shift+N`)

---

## 3. Decision Criteria for Next Phase

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

## 4. Phase 2 Implementation Plan (When Ready)

### 4.1 Notification Center Architecture

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

### 4.2 New Files Required

```
app/notificationSystem/
├── center/
│   ├── NotificationCenter.js      # Center BrowserWindow
│   ├── notificationCenter.html    # Center UI
│   └── notificationCenterPreload.js
├── store/
│   └── NotificationStore.js       # In-memory storage
```

### 4.3 New IPC Channels

- `notification-open-center` - Open notification center drawer
- `notification-close-center` - Close notification center
- `notification-mark-read` - Mark notification as read
- `notification-clear-all` - Clear all notifications
- `notification-get-all` - Get all notifications for display

### 4.4 Configuration Additions

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

## 5. Long-Term Roadmap

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

## 6. Background & Context

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

## 7. Related Documentation

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

## 8. Conclusion

The custom notification system MVP is complete and provides a working alternative for users experiencing OS notification issues.

**Lessons Learned:**

Phase 2 highlighted the difficulty of testing notification routing end-to-end. The implementation worked on the maintainer's machine but failed (or appeared to fail) for the requesting user. Possible explanations include differences in desktop environment notification handling, Teams account type affecting DOM mutation behaviour, or a gap between the user's expectations and the feature's scope. Without clearer diagnostics or more users requesting the feature, further investment is not justified.

**Next Actions:**

If custom notifications beyond meeting toasts are requested again by a different user, the recommended approach would be to first establish a shared understanding of what notifications the user expects, then provide a debug build with diagnostic logging so the user can report exactly what events fire in their environment before writing any routing logic.

---

**Document Status:** ✅ MVP Complete | ❌ Phase 2 Dropped
**Current Version:** v2.7.6
**Last Updated:** 2026-02-18
