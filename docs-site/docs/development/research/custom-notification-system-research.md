# Custom Notification System Research & Implementation Plan

**Status:** Research Complete, Ready for Implementation
**Date:** November 2025
**Issue:** Investigation for alternative notification modal system
**Author:** Claude AI Assistant

---

## Executive Summary

This document presents comprehensive research into creating a **custom notification modal system** for Teams for Linux as an alternative to the existing web and Electron notification implementations, which don't work reliably for all users—particularly on Linux systems with varying notification daemon implementations.

### Key Findings

- **Current limitations**: OS-level notifications face significant cross-platform reliability issues, especially on Linux where notification daemons can freeze the application
- **Recommended approach**: Custom BrowserWindow-based notification system following the proven `IncomingCallToast` pattern
- **No suitable libraries**: Existing npm packages (electron-notifications, electron-notify) are 5-9 years old and incompatible with modern Electron
- **Timeline**: 2-3 weeks for MVP implementation
- **Design**: Follow Microsoft Teams design language for consistency

### Decision

**Proceed with custom implementation** using separate BrowserWindows for both toast notifications and a notification center, with IndexedDB for persistence. This approach provides complete control, eliminates OS dependency, and follows existing codebase patterns.

---

## 1. Problem Statement

### Current Notification Issues

Users report that notifications don't work consistently across different platforms and configurations:

1. **Linux Notification Daemon Issues**
   - Application freezes for minutes when no notification daemon is running
   - Inconsistent behavior across different desktop environments (GNOME, KDE, Unity)
   - Ubuntu Unity requires `requireInteraction: false` workaround (#1888)
   - Different notification daemons (notify-osd, dunst, GNOME Shell) behave differently

2. **Web vs Electron Notification Mode**
   - "web" mode: Uses browser's native Notification API (default)
   - "electron" mode: Uses Electron's Notification class
   - Past issue (#1921 - now fixed): "Notifications only work once" bug when using async constructors
   - Neither mode provides notification history or actionable notifications

3. **Lack of Advanced Features**
   - No notification history or center
   - No actionable buttons (Reply, Dismiss, Snooze)
   - No notification management
   - Cannot review missed notifications

### User Impact

- Missed important messages and mentions
- Poor user experience on Linux (primary platform)
- No way to catch up on notifications after being away
- Inconsistent experience across different operating systems

---

## 2. Architectural Constraints

### Electron Wrapper Architecture

Teams for Linux is **not a React application**—it's an Electron wrapper around the Microsoft Teams web app. This creates specific constraints:

```
┌─────────────────────────────────────┐
│   Electron Main Process             │
│   (Node.js, can create windows)     │
└──────────────┬──────────────────────┘
               │
    ┌──────────┴──────────┐
    │                     │
┌───┴────────────┐  ┌────┴──────────────┐
│ Main Window    │  │ Separate Windows  │
│ (Teams Web App)│  │ (Custom HTML/CSS) │
│ - React owned  │  │ - IncomingCallToast│
│   by Microsoft │  │ - Notification*    │
│ - Cannot modify│  │ - ScreenPicker     │
│   DOM directly │  │                    │
└────────────────┘  └───────────────────┘
```

### What We CAN Do

- ✅ **Create separate BrowserWindows** (like `IncomingCallToast`)
- ✅ **Intercept browser APIs** in `preload.js` (like `window.Notification`)
- ✅ **Use vanilla JavaScript/HTML/CSS** in our windows
- ✅ **Communicate via IPC** between windows
- ✅ **Use electron-positioner** for multi-monitor support
- ✅ **Store data in IndexedDB/localStorage**

### What We CANNOT Do

- ❌ **Add React components** to the Teams interface
- ❌ **Use React-based toast libraries** (Sonner, React Hot Toast, etc.)
- ❌ **Modify Teams DOM** directly (brittle, breaks with updates)
- ❌ **Use npm packages requiring React** in the Teams context

### Security Constraints

From `CLAUDE.md` and existing codebase:

- **contextIsolation**: Must be enabled on new windows (security best practice)
- **nodeIntegration**: Must be disabled (security requirement)
- **IPC validation**: All channels must be allowlisted in `ipcValidator.js`
- **contextBridge**: Use for exposing APIs to renderer processes
- **Content Security Policy**: Applied to Teams domains as compensating control

---

## 3. Investigation of Existing Solutions

### 3.1 Third-Party Libraries

We evaluated several existing Electron notification libraries:

| Library | Last Update | Status | Verdict |
|---------|-------------|--------|---------|
| `electron-notifications` | 2017 (v1.0.0) | 🔴 8 years old | ❌ Too old, likely incompatible |
| `electron-notify` | 2016 (v0.1.0) | 🔴 9 years old | ❌ Too old, unmaintained |
| `electron-custom-notifications` | 2020 | 🟡 5 years old | ⚠️ Outdated, unmaintained |
| `node-notifier` | Active | 🟢 Maintained | ❌ Still uses OS notifications (doesn't solve our problem) |

**Testing Results:**

```bash
npm install electron-notifications
# Package shows "Inactive" maintenance status
# No releases in past 12 months
# Built for Electron 1.x era (we're on Electron 30+)
```

**Conclusion:** No viable third-party libraries. All are either too old or still rely on OS notifications that we're trying to avoid.

### 3.2 React Toast Libraries (Not Viable)

Popular React libraries we **cannot use** due to architecture:

- ❌ **Sonner** - Requires React, 500K weekly downloads, modern but incompatible
- ❌ **React Hot Toast** - Requires React, excellent API but not applicable
- ❌ **React Toastify** - Requires React, 1.8M weekly downloads, not usable
- ❌ **Notistack** - Material-UI integration, requires React

These are excellent libraries but fundamentally incompatible with our Electron wrapper architecture.

### 3.3 Native Electron Notifications (Current Approach)

**Web Notifications Mode:**
```javascript
// Intercepted in preload.js
new Notification(title, options)
// Returns actual native notification object
// Teams manages lifecycle
```

**Electron Notifications Mode:**
```javascript
// Main process creates notification
const notification = new Notification({
  title: 'Title',
  body: 'Body'
});
notification.show();
```

**Issues:**
- Both rely on OS notification systems (unreliable on Linux)
- No action buttons on Linux
- No notification history
- Limited customization
- Platform inconsistencies

---

## 4. Recommended Solution: Custom BrowserWindow System

### 4.1 Architecture Overview

We'll build a **two-component system** following the `IncomingCallToast` pattern:

```
┌──────────────────────────────────────────────────┐
│              Main Process                        │
│                                                  │
│  ┌─────────────────────────────────────────┐   │
│  │   NotificationSystemManager             │   │
│  │   - Coordinates components              │   │
│  │   - Manages IPC handlers                │   │
│  └───────┬─────────────────────┬───────────┘   │
│          │                     │                │
│  ┌───────▼────────┐    ┌──────▼──────────┐    │
│  │ NotificationToast│    │NotificationCenter│    │
│  │ - Popup windows │    │ - History panel  │    │
│  │ - Auto-dismiss  │    │ - Drawer UI      │    │
│  │ - Max 3 visible│    │ - Mark read/unread│   │
│  └────────────────┘    └─────────────────┘    │
│                                                  │
│  ┌─────────────────────────────────────────┐   │
│  │   NotificationStore (IndexedDB)         │   │
│  │   - Persistent storage                  │   │
│  │   - Last 100 notifications              │   │
│  │   - Auto-cleanup (7 days)               │   │
│  └─────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│           Renderer Process (Teams)               │
│                                                  │
│  preload.js intercepts:                          │
│  new Notification() → Send to custom system     │
└──────────────────────────────────────────────────┘
```

### 4.2 Component Design

#### NotificationToast

**Purpose:** Temporary popup notifications (bottom-right corner)

**Follows:** `IncomingCallToast.js` pattern exactly

```javascript
// app/notificationSystem/toast/NotificationToast.js
class NotificationToast {
  constructor(data, onClickCallback) {
    this.window = new BrowserWindow({
      alwaysOnTop: true,
      frame: false,
      width: 350,
      height: 100,
      transparent: true,  // Rounded corners
      skipTaskbar: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'notificationToastPreload.js'),
        contextIsolation: true,  // ✅ Security
        nodeIntegration: false   // ✅ Security
      }
    });

    this.window.loadFile('notificationToast.html');
    // electron-positioner for multi-monitor support
    this.positioner = new Positioner(this.window);
  }

  show(position) {
    this.positioner.move('bottomRight');
    this.window.show();

    // Auto-dismiss after 5 seconds
    setTimeout(() => this.close(), 5000);
  }
}
```

**Features:**
- Stack vertically (max 3 visible)
- Auto-dismiss after configurable duration
- Click to view or dismiss
- Action buttons (View, Dismiss)
- Teams design language

#### NotificationCenter

**Purpose:** Persistent panel for notification history

```javascript
// app/notificationSystem/center/NotificationCenter.js
class NotificationCenter {
  constructor(mainWindow) {
    this.centerWindow = new BrowserWindow({
      parent: mainWindow,  // Attached to main window
      width: 400,
      height: 600,
      show: false,
      frame: false,
      alwaysOnTop: true,
      webPreferences: {
        preload: path.join(__dirname, 'notificationCenterPreload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    this.centerWindow.loadFile('notificationCenter.html');
  }

  toggle() {
    if (this.centerWindow.isVisible()) {
      this.centerWindow.hide();
    } else {
      // Position next to main window (slide-in from right)
      this.positionAndShow();
    }
  }

  updateBadge(count) {
    // Send badge count to renderer for display
    this.centerWindow.webContents.send('badge-count-update', count);
  }
}
```

**Features:**
- List of all notifications (newest first)
- Mark as read/unread
- Clear all functionality
- Badge count indicator
- Slide-in drawer animation
- Teams design language

#### NotificationStore

**Purpose:** In-memory notification storage for current session

**MVP Approach:** Start with simple in-memory storage. Persistent storage (IndexedDB) can be added in Phase 2 if users need history across restarts.

```javascript
// app/notificationSystem/store/notificationStore.js
const { EventEmitter } = require('events');

class NotificationStore extends EventEmitter {
  constructor() {
    super();
    this.notifications = [];  // In-memory array for MVP
  }

  add(notification) {
    const item = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      ...notification,
      read: false
    };

    this.notifications.unshift(item);  // Add to beginning (newest first)
    this.emit('added', item);
    return item;
  }

  getRecent(limit = 50) {
    // Return most recent notifications (in-memory)
    return this.notifications.slice(0, limit);
  }

  getUnreadCount() {
    return this.notifications.filter(n => !n.read).length;
  }

  markRead(id) {
    const notification = this.notifications.find(n => n.id === id);
    if (notification) {
      notification.read = true;
      this.emit('updated', notification);
    }
  }

  clear() {
    this.notifications = [];
    this.emit('cleared');
  }
}
```

**Phase 2 Enhancement:** Add IndexedDB persistence if users request history across restarts.

### 4.3 Data Model

```javascript
// Notification object structure
{
  id: 'uuid-v4',                    // Unique identifier
  timestamp: 1730000000000,         // Unix timestamp (ms)
  title: 'John Smith',              // Notification title
  body: 'Hey, can we sync?',        // Notification body
  icon: 'https://...',              // Avatar URL
  type: 'message',                  // message|mention|meeting|call|activity
  read: false,                      // Read status
  clicked: false,                   // Clicked status
  actions: [                        // Available actions
    {
      id: 'view',
      title: 'View',
      action: 'view',
      primary: true
    },
    {
      id: 'dismiss',
      title: 'Dismiss',
      action: 'dismiss',
      primary: false
    }
  ],
  metadata: {                       // Teams-specific data
    conversationId: '...',
    senderId: '...',
    channelId: '...'
  }
}
```

### 4.4 Integration with Existing System

**Modify `preload.js` CustomNotification function:**

```javascript
// Current code (lines 186-209)
function CustomNotification(title, options) {
  if (notificationConfig?.disableNotifications) {
    return { onclick: null, onclose: null, onerror: null };
  }

  // NEW: Check if custom notification system enabled
  if (notificationConfig?.customNotificationSystem?.enabled) {
    const notificationData = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      title: title,
      body: options.body || '',
      icon: options.icon || ICON_BASE64,
      type: detectNotificationType(title, options),
      read: false,
      actions: generateActions()
    };

    // Send to custom notification system
    ipcRenderer.invoke('notification-add', notificationData);

    // Play sound (reuse existing logic)
    playNotificationSound({ type: options.type, ... });

    // Return stub (handled by custom system)
    return { onclick: null, onclose: null, onerror: null };
  }

  // EXISTING: Fallback to web/electron notifications
  const method = notificationConfig?.notificationMethod || "web";
  // ... existing code
}
```

---

## 5. Design Decisions

### 5.1 UI Design Language

**Decision:** Follow Microsoft Teams design language

**Rationale:**
- Consistency with the wrapped application
- Users expect Teams-like appearance
- Proven design patterns from Microsoft Fluent Design

**Color Palette:**
```css
--teams-purple: #6264A7;
--teams-purple-dark: #464775;
--bg-primary: #1F1F1F;
--bg-secondary: #2D2C2C;
--text-primary: #FFFFFF;
--text-secondary: #B3B3B3;
```

**Typography:**
```css
font-family: 'Segoe UI', -apple-system, sans-serif;
/* Font sizes: 13px (body), 14px (title), 11px (caption) */
```

### 5.2 Notification Actions

**Decision:** Start simple, iterate based on feedback

**Phase 1 (MVP):**
- ✅ **View** - Focus main window, navigate to notification source
- ✅ **Dismiss** - Mark as read, hide notification

**Phase 2 (Future):**
- Reply - Quick reply to messages
- Snooze - Remind later
- Mark Unread - Mark for follow-up

**Rationale:**
- Minimize initial complexity
- Test user adoption before investing in advanced features
- Easier to maintain and debug

### 5.3 Keyboard Shortcuts

**Decision:** No keyboard shortcuts initially

**Rationale:**
- Avoid conflicts with Teams shortcuts
- Keep MVP simple
- Add in Phase 2 based on user requests

**Future consideration:** `Ctrl+Shift+N` for notification center toggle

### 5.4 Sound Integration

**Decision:** Reuse existing notification sounds

**Current sounds:**
- `new_message.wav` - For messages, mentions, activity
- `meeting_started.wav` - For meeting notifications

**Rationale:**
- No need for new audio assets
- Consistent with current user experience
- Respects existing `disableNotificationSound` config

**Sound mapping:**
```javascript
const soundMap = {
  'message': 'new_message.wav',
  'mention': 'new_message.wav',
  'activity': 'new_message.wav',
  'meeting': 'meeting_started.wav',
  'call': null  // Handled by IncomingCallToast
};
```

### 5.5 Tray Integration

**Decision:** No tray integration initially

**Rationale:**
- Keep notification system independent
- Avoid complexity of coordinating with existing tray icon logic
- Focus on in-app experience first

**Note:** Existing `trayIconRenderer.js` already shows badge counts from `mutationTitle.js`—this system can coexist.

### 5.6 Do Not Disturb Mode

**Decision:** Phase 2 feature, linked to existing status detection

**Existing system:**
- `disableNotificationSoundIfNotAvailable` config option
- User status tracking (`userStatus`, `idleTimeUserStatus`)
- Respects "Busy", "In a call", etc. statuses

**Future integration:**
- Check user status before showing toast
- Still store in notification center (for review later)
- Respect focus mode/DND settings

---

## 6. IPC Security & Channels

### 6.1 New IPC Channels

All channels must be added to `app/security/ipcValidator.js`:

```javascript
// Notification system channels
'notification-add',                 // Add new notification
'notification-show-toast',          // Show toast window
'notification-toast-clicked',       // Toast clicked

'notification-center-toggle',       // Toggle center
'notification-load-history',        // Load notification list
'notification-mark-read',           // Mark as read
'notification-mark-all-read',       // Mark all as read
'notification-clear-all',           // Clear all

'notification-badge-update',        // Update badge count
'notification-action',              // User clicked action button
```

### 6.2 IPC Handler Registration

```javascript
// In app/index.js or NotificationSystemManager.js

ipcMain.handle('notification-add', async (event, data) => {
  // Validate and sanitize data
  if (!validateNotificationData(data)) {
    return { error: 'Invalid notification data' };
  }

  // Add to store
  const notification = await notificationStore.add(data);

  // Show toast if enabled
  if (config.customNotificationSystem?.showToasts) {
    notificationToastQueue.show(notification);
  }

  // Update badge count
  const unreadCount = await notificationStore.getUnreadCount();
  notificationCenter.updateBadge(unreadCount);

  return { success: true, id: notification.id };
});
```

### 6.3 Security Considerations

- ✅ **Input validation:** All IPC payloads validated
- ✅ **Prototype pollution prevention:** Dangerous properties removed
- ✅ **contextIsolation:** Enabled on all windows
- ✅ **nodeIntegration:** Disabled on all windows
- ✅ **contextBridge:** Used for all IPC communication
- ✅ **CSP:** Content Security Policy applied

---

## 7. Configuration

### 7.1 Unified Notification Configuration

**Approach:** Align all notification methods under a consistent structure to improve maintainability and user clarity.

**Add to `app/config/index.js`:**

```javascript
{
  // Unified notification method configuration
  notificationMethod: {
    default: "web",
    describe: "Notification method: 'web' (browser native), 'electron' (Electron API), or 'custom' (in-app system)",
    type: "string",
    choices: ["web", "electron", "custom"]
  },

  // Web notification config (existing, kept for compatibility)
  webNotification: {
    default: {},
    describe: "Web notification configuration (deprecated - kept for backward compatibility)",
    type: "object"
  },

  // Electron notification config (existing, kept for compatibility)
  electronNotification: {
    default: {},
    describe: "Electron notification configuration (deprecated - kept for backward compatibility)",
    type: "object"
  },

  // Custom notification system configuration
  customNotification: {
    default: {
      enabled: false,  // Explicitly set via notificationMethod: "custom"
      toastDuration: 5000,
      showHistory: true
    },
    describe: "Custom in-app notification system configuration (toast + notification center)",
    type: "object"
  },

  // Existing global notification settings (unchanged)
  disableNotifications: {
    default: false,
    describe: "Disable all notifications globally",
    type: "boolean"
  },

  disableNotificationSound: {
    default: false,
    describe: "Disable notification sounds",
    type: "boolean"
  },

  disableNotificationSoundIfNotAvailable: {
    default: false,
    describe: "Disable sounds when user status is not Available",
    type: "boolean"
  }
}
```

### 7.2 Example User Configurations

**Using Custom Notification System (Opt-in):**
```json
{
  "notificationMethod": "custom",
  "customNotification": {
    "enabled": true,
    "toastDuration": 5000,
    "showHistory": true
  },
  "disableNotificationSound": false
}
```

**Using Default Web Notifications:**
```json
{
  "notificationMethod": "web",
  "disableNotifications": false,
  "disableNotificationSound": false
}
```

**Using Electron Notifications:**
```json
{
  "notificationMethod": "electron",
  "disableNotifications": false
}
```

### 7.3 Configuration Migration

**Backward Compatibility:**
- Existing `notificationMethod: "web"` remains default
- Old config options still work (no breaking changes)
- Users must explicitly set `notificationMethod: "custom"` to opt-in
- `customNotification.enabled` is automatically set when method is "custom"

**Documentation Updates Required:**
- Update configuration.md to document new unified structure
- Add migration guide for users wanting to try custom system
- Clarify that web/electron methods remain fully supported

---

## 8. Implementation Plan

### 8.1 Timeline: 2 Weeks (Simplified MVP)

**Week 1: Foundation & Toast System**
- Days 1-2: Setup, in-memory NotificationStore, config
- Days 3-5: NotificationToast implementation & testing

**Week 2: Notification Center & Polish**
- Days 6-7: NotificationCenter UI
- Days 8-9: Center functionality & integration
- Day 10: Cross-platform testing & documentation

**Simplified from original 3-week plan** by:
- Using in-memory storage (no IndexedDB complexity)
- No toast queue management (show all toasts)
- Minimal actions (View, Dismiss only)
- Session-based history (no persistence)

### 8.2 File Structure

```
app/
├── notificationSystem/
│   ├── index.js                        # Module exports
│   ├── NotificationSystemManager.js    # Coordinator
│   │
│   ├── toast/
│   │   ├── NotificationToast.js
│   │   ├── notificationToast.html
│   │   ├── notificationToastPreload.js
│   │   └── ToastQueue.js
│   │
│   ├── center/
│   │   ├── NotificationCenter.js
│   │   ├── notificationCenter.html
│   │   └── notificationCenterPreload.js
│   │
│   ├── store/
│   │   └── notificationStore.js
│   │
│   └── README.md
```

### 8.3 Success Criteria

**Functional:**
- ✅ Toast notifications appear for all Teams notifications
- ✅ Notification center shows notification history (session-based)
- ✅ Mark as read/unread works correctly
- ✅ Badge count updates in real-time
- ✅ Cross-platform compatibility (Linux, Windows, macOS)

**Performance:**
- ✅ Toast appears within 200ms of notification
- ✅ Notification center opens within 100ms
- ✅ No memory leaks with 1000+ notifications
- ✅ IndexedDB operations &lt;50ms

**Security:**
- ✅ All IPC channels validated
- ✅ contextIsolation enabled
- ✅ nodeIntegration disabled
- ✅ No security vulnerabilities

---

## 9. Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Teams changes notification format | High | Medium | Defensive detection, fallbacks |
| IndexedDB quota exceeded | Medium | Low | Auto-cleanup, limits |
| Multi-monitor positioning issues | Medium | Medium | Use electron-positioner, test |
| Performance with many notifications | Medium | Low | Pagination, virtual scrolling |
| User adoption resistance | Low | Low | Opt-in initially, clear benefits |

---

## 10. Alternatives Considered & Rejected

### 10.1 Inject Overlay into Teams DOM

**Approach:** Inject fixed-position div into Teams page

**Rejected because:**
- ❌ Fragile (Teams updates break it)
- ❌ Conflicts with Teams UI
- ❌ Against defensive coding principle (CLAUDE.md)
- ❌ Security/CSP concerns
- ❌ Hard to style consistently

### 10.2 Use electron-notifications Library

**Approach:** Use existing npm package

**Rejected because:**
- ❌ Last updated 2017 (8 years old)
- ❌ Built for Electron 1.x (incompatible with modern versions)
- ❌ No notification center/history
- ❌ Would require extensive modifications

### 10.3 Enhanced Electron Notifications with Windows Toast XML

**Approach:** Use native Windows 10/11 toast notifications

**Rejected because:**
- ❌ Windows-only (fragmented experience)
- ❌ Still relies on OS notifications
- ❌ Doesn't solve Linux daemon issues
- ❌ macOS requires app signing for actions

### 10.4 Hybrid OS + In-App System

**Approach:** Show both OS notifications and in-app toasts

**Rejected because:**
- ❌ Duplicate notifications confuse users
- ❌ Doesn't solve OS notification reliability issues
- ❌ Increases complexity
- ❌ Can be added later if needed (not MVP)

---

## 11. Rollout Strategy

### 11.1 Phase 1: Opt-In Alternative (v2.7.0)

**Approach:**
- New method: `notificationMethod: "custom"` (opt-in)
- Default remains `notificationMethod: "web"` (no breaking changes)
- Documentation for users experiencing notification issues
- Collect feedback via GitHub issues

**Important:** This is an **alternative**, not a replacement. Users who are happy with web/electron notifications can continue using them.

**Success metrics:**
- 10+ users opt-in and provide feedback
- No critical bugs reported
- Positive feedback from users with notification issues

### 11.2 Phase 2: Stable Alternative (v2.8.0)

**Approach:**
- Bug fixes based on Phase 1 feedback
- Enhanced documentation with troubleshooting guides
- Feature enhancements based on user requests
- All three methods remain fully supported

**Success metrics:**
- Reduced GitHub issues related to notification reliability
- Users report improved notification experience
- Feature is stable and well-documented

### 11.3 Long-Term Support

**Approach:**
- Maintain all three notification methods:
  - **"web"** - Default, works well for most users
  - **"electron"** - Alternative for some use cases
  - **"custom"** - Solution for users with OS notification issues
- No deprecation of existing methods
- Users choose based on their needs and preferences

**Rationale:**
- Different users have different needs and environments
- What works on one system may not work on another
- Providing options increases compatibility and user satisfaction

---

## 12. Future Enhancements (Post-MVP)

### Phase 2 Features
- ⏳ **Persistent storage** - IndexedDB for notification history across app restarts
- ⏳ **Auto-cleanup** - Configurable retention (e.g., keep last 100 or 7 days)
- ⏳ **Toast queue management** - Limit visible toasts (e.g., max 3)
- ⏳ Keyboard shortcut (`Ctrl+Shift+N`) to toggle notification center
- ⏳ Search notifications
- ⏳ Filter by type (messages, mentions, meetings)
- ⏳ Reply action
- ⏳ Snooze action
- ⏳ Mark unread action
- ⏳ DND mode integration

### Phase 3 Features
- ⏳ Pin important notifications
- ⏳ Export notification history
- ⏳ Notification templates per type
- ⏳ Custom sounds per notification type
- ⏳ Notification rules/preferences
- ⏳ Group notifications by conversation
- ⏳ Integration with incoming call command system

**Rationale for Phased Approach:**
- Start simple to validate core functionality
- Add complexity based on user feedback
- Avoid over-engineering features that may not be used
- Storage adds complexity - only implement if users need history persistence

---

## 13. Related Documentation

### Internal References
- **IncomingCallToast Implementation** (`app/incomingCallToast/`) - Source code pattern we're following
- **[IPC API Documentation](../ipc-api.md)** - IPC channel reference
- **[Security Architecture](../security-architecture.md)** - Security best practices
- **[Configuration Reference](../../configuration.md)** - Config options

### External References
- **[Electron BrowserWindow API](https://www.electronjs.org/docs/latest/api/browser-window)** - Official docs
- **[Electron Notification API](https://www.electronjs.org/docs/latest/api/notification)** - Current notification system
- **[IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)** - Storage layer
- **[Microsoft Fluent Design](https://fluent2.microsoft.design/)** - UI design guidelines

### GitHub Issues
- **#1921** (closed/fixed) - "Notifications only work once" bug - resolved by using synchronous factory pattern instead of async constructor
- **#1888** - Ubuntu Unity auto-close issue (requireInteraction: false workaround)
- **#1902** - TrayIconRenderer IPC initialization (shows importance of careful IPC setup)

---

## 14. Conclusion

### Recommendation: Add Custom Notification System as Opt-In Alternative

The custom BrowserWindow-based notification system provides a **third option** for Teams for Linux users who experience issues with OS-level notifications:

**Why proceed with this implementation:**

1. **Solves specific problem**: Alternative for users experiencing OS notification reliability issues (especially Linux)
2. **Follows proven pattern**: Uses same architecture as successful `IncomingCallToast`
3. **Provides value**: In-app notification history and actionable notifications
4. **Maintainable**: Vanilla JS/HTML/CSS matching codebase style
5. **Secure**: Follows all security best practices
6. **Cross-platform**: Consistent experience on Linux, Windows, macOS
7. **Simplified MVP**: 2 weeks with in-memory storage, basic features only
8. **No disruption**: Opt-in alternative, existing methods remain default and fully supported

**Key Principles:**

- **Start simple**: In-memory storage, minimal actions, no complex features
- **Opt-in only**: Users must explicitly choose `notificationMethod: "custom"`
- **Maintain alternatives**: Keep web/electron methods as viable options
- **Iterate based on feedback**: Add complexity only if users request it

### Next Steps

1. ✅ **Approval**: Get maintainer approval on simplified MVP approach
2. 📝 **Create feature branch**: `feature/custom-notification-system`
3. 🏗️ **Week 1 Implementation**: Foundation + Toast System
4. 🎨 **Week 2 Implementation**: Notification Center + Polish
5. 📦 **Release**: v2.7.0 as opt-in alternative (`notificationMethod: "custom"`)
6. 📊 **Collect feedback**: Monitor GitHub issues and user adoption
7. 🔄 **Iterate**: Add Phase 2 features based on actual user needs

---

**Document Status:** ✅ Research Complete - Simplified MVP Approach
**Default Behavior:** No change - `notificationMethod: "web"` remains default
**Next Action:** Await approval, then begin Week 1 implementation
**Questions/Feedback:** Open GitHub issue or discussion
