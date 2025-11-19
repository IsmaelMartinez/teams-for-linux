# Custom Notification System Research & Implementation Plan

**Status:** Research Complete, Ready for Implementation
**Date:** November 2025
**Issue:** Investigation for alternative notification modal system
**Author:** Claude AI Assistant
**Dependencies:** Incremental Refactoring Plan Phase 1 (Completed ✓)

---

## Prerequisites

This research builds on the completed [Incremental Refactoring Plan Phase 1](./incremental-refactoring-plan.md), specifically:

- ✅ **Extraction 2 (Week 2)**: Notification System extracted into `app/notifications/service.js` (#1962)
- ✅ **NotificationService class**: Centralized notification and sound handling
- ✅ **IPC channels**: `show-notification` and `play-notification-sound` established

The custom notification system will integrate with this new architecture rather than modifying `app/index.js` directly.

---

## Executive Summary

This document presents comprehensive research into creating a **custom notification modal system** for Teams for Linux as an alternative to the existing web and Electron notification implementations, which don't work reliably for all users—particularly on Linux systems with varying notification daemon implementations.

### Key Findings

- **Current limitations**: OS-level notifications face significant cross-platform reliability issues, especially on Linux where notification daemons can freeze the application
- **Recommended approach**: Custom BrowserWindow-based notification system following the proven `IncomingCallToast` pattern
- **No suitable libraries**: Existing npm packages (electron-notifications, electron-notify) are 5-9 years old and incompatible with modern Electron
- **MVP Timeline**: ~1 week for ultra-minimal implementation (toast notifications only)
- **Design**: Follow Microsoft Teams design language for consistency

### Decision

**Proceed with ultra-minimal MVP implementation**: Toast notifications only (no notification center, no history, no storage). Start ridiculously simple—just show a BrowserWindow toast that auto-dismisses. Add complexity only after validating core functionality and based on actual user feedback. This approach minimizes risk, development time, and maintenance burden.

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

We'll build this **incrementally**, starting with the simplest component:

**Phase 1 (MVP): Toast Notifications Only**

```
┌──────────────────────────────────────────────────┐
│              Main Process                        │
│                                                  │
│  ┌─────────────────────────────────────────┐   │
│  │   NotificationToast                     │   │
│  │   - Popup windows (bottom-right)        │   │
│  │   - Auto-dismiss after 5 seconds        │   │
│  │   - Click to focus main window          │   │
│  │   - Teams design language               │   │
│  └─────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│           Renderer Process (Teams)               │
│                                                  │
│  preload.js intercepts:                          │
│  new Notification() → Show custom toast         │
└──────────────────────────────────────────────────┘
```

**Future Phases:**
- **Phase 2:** Add notification center (drawer) for current session
- **Phase 3:** Integrate with existing tray icon system
- **Phase 4:** Integrate with incoming call toast
- **Phase 5+:** Add persistence, advanced features

**Start Simple Principle:** MVP is just toast notifications. Add complexity only after validating core functionality works.

### 4.2 Component Design (MVP: Toast Only)

#### NotificationToast

**Purpose:** Temporary popup notifications (bottom-right corner)

**Follows:** `IncomingCallToast.js` pattern exactly

```javascript
// app/notificationSystem/NotificationToast.js
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

  show() {
    this.positioner.move('bottomRight');
    this.window.show();

    // Auto-dismiss after 5 seconds
    setTimeout(() => this.close(), 5000);
  }

  close() {
    this.window.close();
  }
}
```

**MVP Features:**
- Auto-dismiss after 5 seconds (configurable)
- Click anywhere to focus main window
- Teams design language
- Bottom-right positioning with multi-monitor support

**Future Enhancements (Phase 2+):**
- Stack multiple toasts vertically
- Action buttons (View, Dismiss, Reply)
- Queue management (max visible toasts)
- Hover to pause auto-dismiss

### 4.3 Data Model (MVP: Minimal)

```javascript
// Simple notification object for MVP
{
  id: 'uuid-v4',              // Unique identifier (generated)
  timestamp: 1730000000000,   // Unix timestamp (ms)
  title: 'John Smith',        // Notification title
  body: 'Hey, can we sync?',  // Notification body
  icon: 'https://...'         // Avatar URL or base64 icon
}
```

**Future enhancements** (Phase 2+):
- `type` field for categorization (message|mention|meeting|call|activity)
- `read` and `clicked` status tracking
- `actions` array for interactive buttons
- `metadata` object for Teams-specific data (conversationId, senderId, etc.)

### 4.4 Integration with Existing System (MVP: Simple)

**Modify `preload.js` CustomNotification function:**

```javascript
// Current code (lines 186-209)
function CustomNotification(title, options) {
  if (notificationConfig?.disableNotifications) {
    return { onclick: null, onclose: null, onerror: null };
  }

  // NEW: Check if custom notification method selected
  const method = notificationConfig?.notificationMethod || "web";

  if (method === "custom") {
    // Simple notification data for MVP
    const notificationData = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      title: title,
      body: options.body || '',
      icon: options.icon || ICON_BASE64
    };

    // Send to main process to show toast
    ipcRenderer.send('notification-show-toast', notificationData);

    // Return stub (no web notification created)
    return { onclick: null, onclose: null, onerror: null };
  }

  // EXISTING: web or electron notifications
  if (method === "web") {
    return createWebNotification(classicNotification, title, options);
  }

  return createElectronNotification(options);
}
```

**Key Simplifications:**
- No type detection (just pass through title/body/icon)
- No action generation (MVP has no buttons)
- Direct IPC send (no complex store management)
- Sound handled by existing system

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

## 6. IPC Security & Channels (MVP: Minimal)

### 6.1 Integration with Existing NotificationService

The custom notification system **integrates with** the existing `NotificationService` class rather than replacing it:

**Existing IPC Channels** (from Phase 1 refactoring):
- `show-notification` - Native OS notifications (handled by NotificationService)
- `play-notification-sound` - Sound playback (handled by NotificationService)

**New IPC Channel** (for custom notifications):
- `notification-show-toast` - Custom toast BrowserWindow (new handler)

### 6.2 Architecture Integration

```javascript
// app/index.js (integration point)

const NotificationService = require("./notifications/service");
const CustomNotificationManager = require("./notificationSystem"); // NEW

// Existing: NotificationService for native notifications
const notificationService = new NotificationService(
  player,
  config,
  mainWindow,
  getUserStatus
);
notificationService.initialize();

// NEW: CustomNotificationManager for toast notifications
const customNotificationManager = new CustomNotificationManager(
  config,
  mainWindow
);
customNotificationManager.initialize(); // Registers 'notification-show-toast' handler
```

### 6.3 IPC Handler Registration (MVP)

```javascript
// app/notificationSystem/index.js (NEW)

const { ipcMain } = require('electron');
const NotificationToast = require('./NotificationToast');

class CustomNotificationManager {
  #config;
  #mainWindow;

  constructor(config, mainWindow) {
    this.#config = config;
    this.#mainWindow = mainWindow;
  }

  initialize() {
    ipcMain.on('notification-show-toast', this.#handleShowToast.bind(this));
  }

  #handleShowToast(event, data) {
    // Basic validation
    if (!data || !data.title) {
      console.warn('[CustomNotification] Invalid notification data');
      return;
    }

    // Create and show toast
    const toast = new NotificationToast(data, () => {
      // On click: focus main window
      this.#mainWindow.show();
      this.#mainWindow.focus();
    }, this.#config.customNotification.toastDuration);

    toast.show();
  }
}

module.exports = CustomNotificationManager;
```

**Security Validation:**
Add `'notification-show-toast'` to `app/security/ipcValidator.js` allowedChannels list.

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
  // Extend existing notificationMethod to support "custom"
  notificationMethod: {
    default: "web",
    describe: "Notification method: 'web' (browser native), 'electron' (Electron API), or 'custom' (in-app system)",
    type: "string",
    choices: ["web", "electron", "custom"]  // Add "custom" to existing choices
  },

  // NEW: Custom notification system configuration (MVP: toast only)
  customNotification: {
    default: {
      toastDuration: 5000
    },
    describe: "Custom in-app notification system configuration (MVP: toast notifications only)",
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

**Note:** We're reusing the existing `notificationMethod` config option rather than deprecating/moving configs, as there's an ongoing project to reorganize configuration options that will handle migrations automatically.

### 7.2 Example User Configurations

**Using Custom Notification System (Opt-in MVP):**
```json
{
  "notificationMethod": "custom",
  "customNotification": {
    "toastDuration": 5000
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

### 7.3 Configuration Notes

**Backward Compatibility:**
- Existing `notificationMethod: "web"` remains default (no breaking changes)
- Just extend the existing config with new "custom" choice
- Add new `customNotification` config object for toast settings
- Users must explicitly set `notificationMethod: "custom"` to opt-in

**Documentation Updates Required:**
- Update configuration.md to document new "custom" method and customNotification options
- Add usage guide for users wanting to try custom system
- Clarify that web/electron methods remain fully supported

**Config Organization:**
- We're reusing existing config structure rather than introducing deprecated options
- Ongoing config reorganization project will handle any future migrations automatically

---

## 8. Implementation Plan

### 8.1 Timeline: ~1 Week (Ultra-Minimal MVP)

**Days 1-2: Setup & Configuration**
- Add `notificationMethod: "custom"` to config system
- Add `customNotification` config object
- Update `ipcValidator.js` with new channel
- Create basic module structure

**Days 3-4: Toast Implementation**
- Create `NotificationToast.js` class (following IncomingCallToast pattern)
- Create `notificationToast.html` with Teams design
- Create `notificationToastPreload.js` for IPC communication
- Implement click-to-focus behavior

**Day 5: Integration & Testing**
- Update `preload.js` CustomNotification function
- Add IPC handler in main process
- Test on Linux, Windows, macOS
- Update documentation

**Simplified from original 2-3 week plan** by:
- MVP = toast only (no notification center)
- No storage system needed
- No queue management
- No action buttons
- Just show notification and dismiss

### 8.2 File Structure (MVP: Minimal)

**New Files Created:**
```
app/
├── notificationSystem/                # NEW module for custom notifications
│   ├── index.js                       # CustomNotificationManager class + IPC handlers
│   ├── NotificationToast.js           # Toast BrowserWindow class
│   ├── notificationToast.html         # Toast UI (Teams design)
│   ├── notificationToastPreload.js    # Toast preload script
│   └── README.md                      # Module documentation
│
├── notifications/                     # EXISTING (from Phase 1 refactoring)
│   ├── service.js                     # NotificationService - native notifications
│   └── README.md                      # Existing documentation
```

**Modified Files:**
```
app/
├── index.js                          # Add CustomNotificationManager initialization
├── browser/preload.js                # Update CustomNotification() to route to custom toast
└── security/ipcValidator.js          # Add 'notification-show-toast' to allowedChannels
```

**Integration Pattern:**
- `app/notifications/service.js` - Handles native OS notifications ("web" and "electron" methods)
- `app/notificationSystem/index.js` - Handles custom toast notifications ("custom" method)
- Both coexist and are initialized in `app/index.js`

**Future expansion** (Phase 2+):
```
app/notificationSystem/
├── center/
│   ├── NotificationCenter.js
│   ├── notificationCenter.html
│   └── notificationCenterPreload.js
├── store/
│   └── NotificationStore.js
```

### 8.3 Success Criteria (MVP: Toast Only)

**Functional:**
- ✅ Toast notifications appear for Teams notifications
- ✅ Auto-dismiss after 5 seconds
- ✅ Click toast to focus main window
- ✅ Teams design language applied
- ✅ Cross-platform compatibility (Linux, Windows, macOS)

**Performance:**
- ✅ Toast appears within 200ms of notification
- ✅ No memory leaks with extended use
- ✅ BrowserWindow creation is fast (&lt;100ms)

**Security:**
- ✅ IPC channel validated in ipcValidator.js
- ✅ contextIsolation enabled
- ✅ nodeIntegration disabled
- ✅ No security vulnerabilities

**User Experience:**
- ✅ Opt-in only (notificationMethod: "custom")
- ✅ Works as alternative when OS notifications fail
- ✅ Clear documentation for users

---

## 9. Risk Assessment (MVP: Minimal Risks)

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Teams changes notification format | Medium | Medium | Defensive parsing, fallbacks |
| Multi-monitor positioning issues | Medium | Medium | Use electron-positioner, thorough testing |
| User adoption resistance | Low | Low | Opt-in only, clear documentation |
| BrowserWindow performance | Low | Low | Follow IncomingCallToast pattern (proven) |

**Risks eliminated in MVP:**
- ~~IndexedDB quota exceeded~~ - No persistence in MVP
- ~~Performance with many notifications~~ - No history/list in MVP
- ~~Complex UI interactions~~ - Simple toast only

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

## 12. Future Enhancements (All Deferred from MVP)

**MVP delivers:** Toast notifications only - show and dismiss.

**Everything else is a future enhancement**, to be added only after MVP validation and based on user feedback:

### Phase 2: Notification Center (Session-Based)
- ⏳ **Notification center window** - Slide-in drawer showing current session's notifications
- ⏳ **Mark as read/unread** - Simple status tracking
- ⏳ **Badge count** - Show unread count
- ⏳ **Clear all** - Dismiss all notifications
- ⏳ **In-memory storage** - NotificationStore class (session only)

### Phase 3: Enhanced Toast Features
- ⏳ **Toast queue management** - Limit visible toasts (e.g., max 3)
- ⏳ **Action buttons** - View, Dismiss, Reply buttons on toasts
- ⏳ **Hover to pause** - Prevent auto-dismiss while hovering
- ⏳ **Notification stacking** - Vertical arrangement of multiple toasts

### Phase 4: Integration & Polish
- ⏳ **Tray integration** - Badge count on tray icon
- ⏳ **Incoming call toast integration** - Unified notification system
- ⏳ **DND mode** - Respect user availability status
- ⏳ **Keyboard shortcut** - Toggle notification center

### Phase 5: Advanced Features (If Requested)
- ⏳ **Persistent storage** - IndexedDB for cross-session history
- ⏳ **Search & filter** - Find specific notifications
- ⏳ **Notification rules** - Custom handling per type
- ⏳ **Export history** - Save notifications externally
- ⏳ **Custom sounds** - Different sounds per notification type
- ⏳ **Reply actions** - Quick reply to messages
- ⏳ **Snooze** - Remind later functionality

**Critical Philosophy:**
- **Start with the absolute minimum** - Just toasts
- **Add features only if users ask** - No speculative development
- **Validate each phase** - Ensure previous phase is stable before adding more
- **Maintain simplicity** - Resist feature creep

---

## 13. Related Documentation

### Internal References
- **[Incremental Refactoring Plan](./incremental-refactoring-plan.md)** ⭐ - Phase 1 complete, NotificationService extracted
- **NotificationService Implementation** (`app/notifications/service.js`) - Existing native notification handler
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

**Why proceed with this ultra-minimal MVP:**

1. **Solves specific problem**: Alternative for users experiencing OS notification reliability issues (especially Linux)
2. **Follows proven pattern**: Uses same architecture as successful `IncomingCallToast`
3. **Extremely low risk**: Just toast notifications, no complex features
4. **Maintainable**: Vanilla JS/HTML/CSS matching codebase style
5. **Secure**: Follows all security best practices (contextIsolation, IPC validation)
6. **Cross-platform**: Consistent experience on Linux, Windows, macOS
7. **Fast to implement**: ~1 week for MVP (toast only)
8. **No disruption**: Opt-in alternative, existing methods remain default and fully supported

**MVP Scope (Ultra-Minimal):**

- **What's included:** Toast notifications (show, auto-dismiss, click-to-focus)
- **What's NOT included:** Notification center, history, storage, actions, queue management
- **Philosophy:** Start with absolute minimum, add features only if users request them

**Key Principles:**

- **Start ridiculously simple**: Just show a toast and dismiss it
- **Opt-in only**: Users must explicitly choose `notificationMethod: "custom"`
- **Maintain alternatives**: Keep web/electron methods as viable options
- **Iterate based on feedback**: Add Phase 2+ features only if users actually need them

### Impact of Phase 1 Refactoring

The completion of [Incremental Refactoring Plan Phase 1](./incremental-refactoring-plan.md) **improves** the custom notification implementation:

**Benefits:**
- ✅ **Cleaner integration**: Add CustomNotificationManager alongside existing NotificationService
- ✅ **Smaller index.js**: Don't add handlers to 755-line file (now 339 lines)
- ✅ **Follows established pattern**: NotificationService shows the class-based architecture pattern
- ✅ **Clear separation**: Native notifications (NotificationService) vs Custom toasts (CustomNotificationManager)
- ✅ **Reduced complexity**: Can leverage existing sound handling from NotificationService

**No Breaking Changes:**
- Research plan remains valid - just better integration points
- Timeline unchanged (~1 week for MVP)
- Architecture simplified by building on refactored foundation

### Next Steps

1. ✅ **Approval**: Get maintainer approval on ultra-minimal MVP approach
2. 📝 **Create feature branch**: `feature/custom-notification-system-mvp`
3. 🏗️ **Days 1-2**: Configuration setup and CustomNotificationManager structure
4. 🎨 **Days 3-4**: NotificationToast implementation (BrowserWindow + HTML)
5. 🧪 **Day 5**: Integration with NotificationService, testing, documentation
6. 📦 **Release**: v2.7.0 as opt-in alternative (`notificationMethod: "custom"`)
7. 📊 **Collect feedback**: Monitor GitHub issues and user adoption
8. 🔄 **Iterate**: Add Phase 2+ features only if users request them

---

**Document Status:** ✅ Research Complete - Ultra-Minimal MVP Approach
**Default Behavior:** No change - `notificationMethod: "web"` remains default
**MVP Timeline:** ~1 week (toast notifications only)
**Next Action:** Await approval, then begin implementation
**Questions/Feedback:** Open GitHub issue or discussion
