# Notifications Plugin Analysis

**Date:** 2025-11-03
**Status:** Research Complete
**Related:** ADR-004 Hybrid DDD/Plugin Architecture

## Executive Summary

This document analyzes the existing notification system in Teams for Linux to support its migration into a dedicated Notifications Plugin as part of the Phase 2 Plugin Architecture initiative.

**Key Findings:**
- Notification handling is distributed across 3 main layers: Browser Tools, IPC, and Main Process
- Current implementation in TeamsIntegrationDomain's NotificationInterceptor service (380 lines)
- 7 IPC channels handle notification flow
- Sound playback uses node-sound with 2 notification sounds
- Badge counting integrates with TrayManager for platform-specific display
- Browser-side injection intercepts Teams' web notifications

---

## 1. Current Notification Architecture

### 1.1 Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Teams Web App                             │
│                   (Microsoft Teams PWA)                          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ new Notification()
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Browser Layer (Renderer)                        │
├─────────────────────────────────────────────────────────────────┤
│  injectedNotification.js                                         │
│  - CustomNotification class intercepts web notifications         │
│  - Checks config.notificationMethod (web/electron)               │
│  - Routes to electronAPI.showNotification()                      │
│                                                                   │
│  trayIconRenderer.js                                             │
│  - Listens to 'unread-count' events                             │
│  - Renders badge overlay on tray icon                            │
│  - Sends 'tray-update' IPC                                       │
│                                                                   │
│  activityHub.js / activityManager.js                             │
│  - Monitors React internal events                                │
│  - Emits activity events (calls, status changes)                 │
│  - Triggers notification-related actions                         │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ IPC Channels
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Main Process (Electron)                        │
├─────────────────────────────────────────────────────────────────┤
│  app/index.js (IPC Handlers)                                     │
│  - ipcMain.handle('show-notification')                           │
│  - ipcMain.handle('play-notification-sound')                     │
│  - ipcMain.handle('set-badge-count')                             │
│  - ipcMain.on('tray-update')                                     │
│                                                                   │
│  TeamsIntegrationDomain                                          │
│  └── NotificationInterceptor Service                             │
│      - interceptNotification() - Main entry point                │
│      - showSystemNotification() - Creates native notifications   │
│      - Badge count management (_incrementBadgeCount)             │
│      - Sound handling (handleSound)                              │
│      - Permission management (checkPermission)                   │
│      - Events: notification:shown, :clicked, :closed, :failed    │
│                                                                   │
│  ShellDomain                                                     │
│  └── TrayManager Service                                         │
│      - setBadgeCount() - Platform-specific badge display         │
│      - macOS: app.setBadgeCount()                                │
│      - Linux/Windows: Tooltip with count                         │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Notification Flow

**Standard Notification Path:**
1. Teams PWA calls `new Notification(title, options)`
2. `injectedNotification.js` intercepts with `CustomNotification`
3. Checks `config.notificationMethod`:
   - **"electron"** (default): Calls `electronAPI.showNotification(options)`
   - **"web"**: Uses native browser notification + plays sound via IPC
4. IPC: `show-notification` → Main Process
5. `app/index.js` handler:
   - Calls `playNotificationSound()` (node-sound)
   - Creates `new Notification()` (Electron native)
   - Attaches click handler → `mainAppWindow.show()`
6. NotificationInterceptor (if integrated):
   - Tracks notification lifecycle
   - Emits events via EventBus
   - Manages badge count

**Badge Count Flow:**
1. Browser emits `'unread-count'` custom event
2. `trayIconRenderer.js` listens and renders badge overlay
3. Sends `'tray-update'` IPC with icon data
4. Sends `'set-badge-count'` IPC with count
5. Main process:
   - Updates tray icon with badge overlay
   - Platform-specific badge: `app.setBadgeCount(count)` (macOS) or tooltip update (Linux/Windows)

---

## 2. Key Files and Components

### 2.1 Core Services

#### NotificationInterceptor.js
**Location:** `/app/domains/teams-integration/services/NotificationInterceptor.js`
**Lines:** 380
**Purpose:** Main notification service bridging web to native notifications

**Key Methods:**
- `interceptNotification(notification)` - Intercept web notification and bridge to system
- `showSystemNotification(options)` - Create Electron native notification
- `updateBadgeCount(count)` - Manual badge count update
- `handleSound(soundConfig)` - Trigger notification sound
- `clearAll()` - Clear all active notifications
- `checkPermission()` / `requestPermission()` - Permission management

**Events Emitted:**
- `notification:intercepted` - Web notification captured
- `notification:shown` - System notification displayed
- `notification:clicked` - User clicked notification
- `notification:closed` - Notification dismissed
- `notification:failed` - Notification error
- `notification:badge-updated` - Badge count changed
- `notification:sound-played` - Sound triggered

**Dependencies:**
- `electron.Notification` - Native system notifications
- Config for sound settings (`notifications.soundEnabled`)
- EventBus for event emission

#### injectedNotification.js
**Location:** `/app/browser/notifications/injectedNotification.js`
**Lines:** 122
**Purpose:** Browser-side notification interception

**Key Features:**
- Creates `CustomNotification` class replacing `window.Notification`
- Supports both synchronous (renderer with config) and async (injected) initialization
- Routes to web or electron notification methods
- Sets `requireInteraction: false` for Ubuntu auto-close behavior
- Provides fallback icon (base64 encoded Teams logo)

**API Surface:**
- `createCustomNotification(windowObject, api, initialConfig)` - Factory function
- `CustomNotification` class with `onclick`, `onclose`, `onerror` handlers
- Static `requestPermission()` → always returns "granted"
- Static `permission` getter → always returns "granted"

### 2.2 Supporting Components

#### TrayManager.js
**Location:** `/app/domains/shell/services/TrayManager.js`
**Lines:** 306
**Purpose:** Platform-specific tray and badge management

**Badge-Related Methods:**
- `setBadgeCount(count)` - Main entry point for badge updates
- Platform handling:
  - **macOS:** `app.setBadgeCount(count)` (dock badge)
  - **Windows/Linux:** `_updateTooltipWithBadge(count)` (tooltip text)

**Events:**
- `shell.tray.badgeUpdated` - Badge count changed

#### trayIconRenderer.js
**Location:** `/app/browser/tools/trayIconRenderer.js`
**Lines:** 136
**Purpose:** Render badge overlay on tray icon

**Key Features:**
- Listens to `'unread-count'` global event
- Canvas-based badge rendering (red circle with count)
- Shows "+" for counts > 9
- Sends rendered icon data URL via `'tray-update'` IPC
- Performance diagnostics logging

#### activityManager.js / activityHub.js
**Location:** `/app/browser/notifications/activityManager.js`, `/app/browser/tools/activityHub.js`
**Purpose:** Activity and call event coordination

**Activity Events:**
- `incoming-call-created` - Incoming call notification
- `incoming-call-ended` - Call notification dismissed
- `call-connected` - Call started
- `call-disconnected` - Call ended

**Integration:**
- Hooks into Teams' React internal event system
- Forwards events via IPC to main process for call toast display

### 2.3 IPC Channels

All IPC channels are validated by `/app/security/ipcValidator.js` against an allowlist.

| Channel | Type | Direction | Payload | Purpose |
|---------|------|-----------|---------|---------|
| `show-notification` | handle | Renderer→Main | `{title, body, icon, type, urgency}` | Show native notification |
| `play-notification-sound` | handle | Renderer→Main | `{type, audio, title, body}` | Play notification sound |
| `set-badge-count` | handle | Renderer→Main | `count: number` | Set app badge count |
| `tray-update` | on | Renderer→Main | `{icon: dataURL, flash: boolean}` | Update tray icon with badge |
| `incoming-call-created` | invoke | Renderer→Main | `{caller, image, text}` | Incoming call toast |
| `incoming-call-ended` | invoke | Renderer→Main | `{}` | Close call toast |
| `incoming-call-action` | on | Main→Renderer | `action: string` | Call action (accept/decline) |

**Security:** All channels are validated via `validateIpcChannel()` which checks against the allowlist and sanitizes payloads (removes `__proto__`, `constructor`, `prototype`).

### 2.4 Sound System

**Implementation:** `/app/index.js` lines 39-488

**Notification Sounds:**
```javascript
notificationSounds = [
  { type: "new-message", file: "assets/sounds/new_message.wav" },
  { type: "meeting-started", file: "assets/sounds/meeting_started.wav" }
]
```

**Player:** `node-sound` library (NodeSound.getDefaultPlayer())

**Logic:**
- Disabled if `config.disableNotificationSound === true`
- Disabled when user status is not "Available" if `config.disableNotificationSoundIfNotAvailable === true`
- Sound type matched from `notificationSounds` array
- Fallback if player fails to load (logs warning)

---

## 3. Integration Points

### 3.1 TeamsIntegrationDomain ↔ NotificationInterceptor

**Current State:**
- NotificationInterceptor is a service within TeamsIntegrationDomain
- Initialized during domain activation (`onActivate()`)
- Service status tracked in domain health checks
- Events emitted through domain's EventBus

**Integration:**
```javascript
// TeamsIntegrationDomain.js lines 92-100
const NotificationInterceptor = require('./services/NotificationInterceptor');
this._notificationInterceptor = new NotificationInterceptor(this._config, this._eventBus);
```

**Domain API:**
- `getNotificationInterceptor()` - Returns interceptor instance
- `getServices()` - Includes interceptor in services object
- `isHealthy()` - Checks if interceptor initialized

### 3.2 ShellDomain ↔ TrayManager

**Current State:**
- TrayManager is a service within ShellDomain
- Handles tray creation and badge count display
- Platform-specific behavior (macOS vs Linux/Windows)

**Badge Flow:**
1. Browser: `trayIconRenderer` → `'tray-update'` IPC
2. Main: `app/index.js` → (not connected to TrayManager yet)
3. Browser: → `'set-badge-count'` IPC
4. Main: `app/index.js` → `app.setBadgeCount(count)` (direct Electron API)

**Gap:** TrayManager's `setBadgeCount()` is not currently used by notification system.

### 3.3 Browser Tools ↔ Main Process

**Preload Script:** `/app/browser/preload.js`

**Exposed API:**
```javascript
globalThis.electronAPI = {
  showNotification: (options) => ipcRenderer.invoke("show-notification", options),
  playNotificationSound: (options) => ipcRenderer.invoke("play-notification-sound", options),
  setBadgeCount: (count) => ipcRenderer.invoke("set-badge-count", count),
  updateTray: (icon, flash) => ipcRenderer.send("tray-update", { icon, flash }),
  getConfig: () => ipcRenderer.invoke("get-config"),
  // ... other methods
}
```

**Context Isolation:** Disabled (`contextIsolation: false`)
- Browser tools have direct access via `globalThis.electronAPI`
- Also exposed: `globalThis.nodeRequire`, `globalThis.nodeProcess`
- Security compensating control: IPC channel validation

### 3.4 React Event Interception

**activityHub → ReactHandler:**
- Accesses Teams' internal React services via `ReactHandler.getCommandChangeReportingService()`
- Subscribes to React event stream (`.observeChanges().subscribe()`)
- Filters for `["CommandStart", "ScenarioMarked"]` events
- Extracts call events: `incoming_call`, `calling-screen-rendered`, `render_disconected`

**Retry Logic:**
- Attempts connection every 10 seconds for up to 2 minutes (12 attempts)
- Continues if connection fails (tray notifications still work via title mutation)

---

## 4. Plugin Requirements

### 4.1 Functional Requirements

**Core Capabilities:**
1. **Notification Interception:** Intercept web notifications from Teams PWA
2. **Native Display:** Show system-native notifications (Electron.Notification)
3. **Sound Playback:** Play notification sounds based on type
4. **Badge Management:** Track and display unread/notification count
5. **Permission Handling:** Manage notification permissions
6. **Click Handling:** Focus main window on notification click
7. **Lifecycle Management:** Track active notifications, close all, cleanup

**Configuration:**
- `notificationMethod`: "electron" (default) | "web"
- `disableNotificationSound`: boolean (default: false)
- `disableNotificationSoundIfNotAvailable`: boolean (default: false)
- `defaultNotificationUrgency`: "low" | "normal" | "critical"
- `disableNotificationWindowFlash`: boolean
- `trayIconEnabled`: boolean

**Events to Emit:**
- `notification:intercepted`
- `notification:shown`
- `notification:clicked`
- `notification:closed`
- `notification:failed`
- `notification:badge-updated`
- `notification:sound-played`
- `notification:permission-changed`

### 4.2 PluginAPI Requirements

**Domain Access:**
```javascript
api.getDomain('configuration') // Config access
api.getDomain('shell')         // TrayManager for badge display
api.getDomain('infrastructure') // Logger
```

**Event Bus:**
```javascript
api.getEventBus() // For emitting notification events
api.emit(eventName, data) // Shortcut for event emission
```

**IPC Registration:**
```javascript
api.registerIpcHandler('show-notification', handler)
api.registerIpcHandler('play-notification-sound', handler)
api.registerIpcHandler('set-badge-count', handler)
api.registerIpcListener('tray-update', handler)
```

**Window Access:**
```javascript
api.getMainWindow() // To show window on notification click
```

### 4.3 Plugin Manifest

```json
{
  "id": "notifications",
  "name": "Notifications Plugin",
  "version": "1.0.0",
  "type": "domain",
  "dependencies": [
    "configuration",
    "shell",
    "infrastructure"
  ],
  "capabilities": [
    "notification-intercept",
    "system-notifications",
    "notification-sounds",
    "badge-management",
    "tray-integration"
  ],
  "ipc": {
    "handlers": [
      "show-notification",
      "play-notification-sound",
      "set-badge-count"
    ],
    "listeners": [
      "tray-update",
      "incoming-call-created",
      "incoming-call-ended"
    ]
  },
  "events": {
    "emits": [
      "notification:intercepted",
      "notification:shown",
      "notification:clicked",
      "notification:closed",
      "notification:failed",
      "notification:badge-updated",
      "notification:sound-played"
    ],
    "subscribes": [
      "config:changed",
      "user:status-changed"
    ]
  }
}
```

### 4.4 Plugin API Surface

**Public Methods:**
```javascript
class NotificationsPlugin extends BasePlugin {
  // Core notification methods
  async showNotification(options) {}
  async playSound(soundType, options) {}

  // Badge management
  setBadgeCount(count) {}
  getBadgeCount() {}
  clearBadge() {}

  // Notification lifecycle
  clearAllNotifications() {}
  getActiveNotifications() {}
  closeNotification(id) {}

  // Configuration
  setNotificationMethod(method) {} // "electron" | "web"
  setSoundEnabled(enabled) {}
  getSoundEnabled() {}

  // Permission
  checkPermission() {}
  requestPermission() {}

  // Statistics
  getStats() {}
}
```

---

## 5. Migration Strategy

### 5.1 Phase 1: Create Plugin Structure

**Tasks:**
1. Create `/app/domains/notifications/` directory
2. Create `NotificationsPlugin.js` extending `BasePlugin`
3. Create `manifest.json` with dependencies
4. Copy `NotificationInterceptor.js` to `/app/domains/notifications/services/`
5. Create plugin initialization in domain loader

**Risk:** Low - No functional changes, pure reorganization

### 5.2 Phase 2: Move IPC Handlers

**Current Location:** `/app/index.js` lines 137-140

**Tasks:**
1. Extract IPC handlers to `NotificationsPlugin.onActivate()`:
   - `show-notification`
   - `play-notification-sound`
   - `set-badge-count`
   - `tray-update`
2. Implement `api.registerIpcHandler()` in PluginAPI
3. Move sound configuration and player initialization to plugin
4. Update `ipcValidator.js` to maintain channel allowlist

**Risk:** Medium - Changes IPC registration pattern, requires careful testing

**Backward Compatibility:**
- Maintain same IPC channel names
- Keep same payload structures
- Preserve validation logic

### 5.3 Phase 3: Extract Sound System

**Tasks:**
1. Create `SoundService.js` in notifications plugin
2. Move `notificationSounds` array to plugin configuration
3. Extract `playNotificationSound()` logic
4. Handle user status integration (available/away/busy)
5. Implement fallback for missing player

**Dependencies:**
- `node-sound` (external dependency)
- User status from activity tracking
- Config: `disableNotificationSound`, `disableNotificationSoundIfNotAvailable`

**Risk:** Low - Well-isolated functionality

### 5.4 Phase 4: Integrate TrayManager

**Tasks:**
1. Update `NotificationsPlugin` to use `ShellDomain.getTrayManager()`
2. Route badge count updates through `TrayManager.setBadgeCount()`
3. Remove direct `app.setBadgeCount()` calls from `app/index.js`
4. Consolidate tray icon rendering logic

**Gap to Address:**
- Currently `tray-update` IPC not connected to TrayManager
- Badge count set directly via Electron API instead of through TrayManager

**Risk:** Medium - Requires coordination between plugins

### 5.5 Phase 5: Browser Tool Integration

**Tasks:**
1. No changes needed to `injectedNotification.js` (maintains API contract)
2. Consider moving `trayIconRenderer.js` to notifications plugin browser bundle
3. Document browser-side API contract for future extensibility

**Risk:** Low - Minimal changes needed

### 5.6 Phase 6: TeamsIntegrationDomain Refactoring

**Tasks:**
1. Remove `NotificationInterceptor` from TeamsIntegrationDomain
2. Update `getServices()` to reflect removal
3. Add dependency on NotificationsPlugin
4. Update health checks

**Risk:** Low - Clean service extraction

---

## 6. Risks and Mitigation

### 6.1 IPC Channel Registration Order

**Risk:** Plugin activation order might cause IPC handlers to register after renderer attempts to call them.

**Mitigation:**
- Ensure NotificationsPlugin loads early in plugin lifecycle
- Add dependency ordering in PluginLoader
- Renderer should handle IPC errors gracefully with retries

### 6.2 Sound Player Initialization Failure

**Risk:** `node-sound` fails to load on some platforms/configurations.

**Current Handling:** Logs warning, continues without sound
**Migration:** Preserve same graceful degradation in plugin

### 6.3 Platform-Specific Badge Behavior

**Risk:** TrayManager's platform-specific logic may not fully replace current implementation.

**Current Implementation:**
- macOS: `app.setBadgeCount()` (direct Electron API)
- Linux/Windows: Tooltip update via TrayManager

**Migration:** Verify platform parity before switching to TrayManager exclusively

### 6.4 React Event Interception Timing

**Risk:** activityHub connection to React services may fail during plugin initialization.

**Current Handling:** Retries for 2 minutes, continues if fails
**Migration:** Preserve retry logic in plugin activation

### 6.5 Notification Click Context Loss

**Risk:** Notification click handlers may lose reference to main window if not properly bound.

**Mitigation:**
- Store main window reference in plugin
- Use `api.getMainWindow()` at click time instead of initialization
- Add null checks and error handling

---

## 7. Testing Strategy

### 7.1 Unit Tests

**NotificationInterceptor Service:**
- Test notification interception with various options
- Verify badge count increment/decrement logic
- Test sound handling with enabled/disabled states
- Mock Electron.Notification and verify creation
- Test event emission for all lifecycle events
- Verify permission handling

**SoundService:**
- Test sound type matching
- Test user status filtering (available vs away)
- Test fallback when player fails
- Mock node-sound player

### 7.2 Integration Tests

**IPC Flow:**
- Test renderer → main notification flow end-to-end
- Verify all IPC channels work after migration
- Test badge count synchronization
- Test tray icon updates

**Domain Coordination:**
- Test NotificationsPlugin ↔ ShellDomain integration
- Verify TrayManager badge updates
- Test configuration updates propagate to plugin

### 7.3 E2E Tests

**Notification Scenarios:**
- Receive Teams message → native notification shown
- Click notification → main window focused
- Multiple notifications → badge count correct
- Clear all notifications → badge resets
- Configuration changes applied without restart

**Platform-Specific:**
- macOS: Verify dock badge displays
- Linux/Windows: Verify tray tooltip includes count
- All platforms: Verify notification sounds play

---

## 8. Success Criteria

### 8.1 Functional Parity

- [ ] All notification types display correctly (messages, calls, meetings)
- [ ] Notification sounds play for appropriate events
- [ ] Badge count accurately reflects unread items
- [ ] Tray icon updates with badge overlay
- [ ] Click handling focuses main window
- [ ] Configuration changes apply immediately
- [ ] Platform-specific behavior preserved (macOS dock badge, Linux tooltip)

### 8.2 Architectural Goals

- [ ] NotificationInterceptor moved to NotificationsPlugin
- [ ] IPC handlers registered by plugin, not app/index.js
- [ ] Sound system encapsulated in plugin
- [ ] TrayManager integration for badge display
- [ ] TeamsIntegrationDomain no longer owns notification code
- [ ] Plugin follows BasePlugin lifecycle patterns
- [ ] Dependencies clearly defined in manifest

### 8.3 Code Quality

- [ ] NotificationsPlugin has >80% test coverage
- [ ] All IPC channels validated and documented
- [ ] No regression in notification behavior
- [ ] Performance: notification display <500ms
- [ ] No memory leaks in notification tracking
- [ ] Graceful degradation if sound player unavailable

---

## 9. Open Questions

1. **Activity Event Routing:** Should activityHub (call events) be part of NotificationsPlugin or remain in TeamsIntegrationDomain?
   - **Recommendation:** Keep in TeamsIntegrationDomain as it's Teams-specific React integration
   - NotificationsPlugin subscribes to call events via EventBus

2. **Browser Tool Packaging:** Should `injectedNotification.js` and `trayIconRenderer.js` be bundled with the plugin?
   - **Recommendation:** Keep in `/app/browser/` for now (shared by all domains)
   - Future: Consider plugin-specific browser bundles in Phase 3

3. **Configuration Scope:** Should notification config be plugin-scoped or remain in global config?
   - **Recommendation:** Keep in global config for Phase 2, consider plugin config in Phase 3

4. **Sound Asset Location:** Should notification sound files move to plugin directory?
   - **Recommendation:** Keep in `/assets/sounds/` (shared assets directory)
   - Plugin references via config paths

5. **Notification History:** Should plugin maintain notification history/log?
   - **Recommendation:** Not for Phase 2 (minimal viable plugin)
   - Consider for Phase 3 enhancements

---

## 10. Next Steps

### Immediate Actions

1. **Review and Approval:**
   - Review this analysis with team
   - Validate migration strategy
   - Identify any missing requirements

2. **Preparation:**
   - Create feature branch: `feature/notifications-plugin`
   - Set up plugin directory structure
   - Write plugin manifest

3. **Implementation (Phase 1):**
   - Create `NotificationsPlugin.js` skeleton
   - Copy `NotificationInterceptor.js` to plugin
   - Register plugin in domain loader
   - Verify plugin activates without errors

### Follow-up Documentation

- [ ] Create ADR for NotificationsPlugin design decisions
- [ ] Update plugin architecture documentation
- [ ] Document notification configuration options
- [ ] Create developer guide for adding new notification types

---

## Appendix A: File Inventory

### Notification-Related Files

**Main Process:**
- `/app/index.js` (lines 39-488) - IPC handlers, sound system
- `/app/domains/teams-integration/TeamsIntegrationDomain.js` - Domain coordinating NotificationInterceptor
- `/app/domains/teams-integration/services/NotificationInterceptor.js` - Core notification service (380 lines)
- `/app/domains/shell/services/TrayManager.js` - Badge and tray management (306 lines)
- `/app/security/ipcValidator.js` - IPC channel validation

**Browser/Renderer:**
- `/app/browser/preload.js` - IPC bridge, electronAPI exposure
- `/app/browser/notifications/injectedNotification.js` - Web notification interception (122 lines)
- `/app/browser/notifications/activityManager.js` - Activity event coordination (121 lines)
- `/app/browser/tools/activityHub.js` - React event interception (273 lines)
- `/app/browser/tools/trayIconRenderer.js` - Badge overlay rendering (136 lines)

**Assets:**
- `/assets/sounds/new_message.wav` - Message notification sound
- `/assets/sounds/meeting_started.wav` - Meeting notification sound

**Tests:**
- `/tests/unit/domains/teams-integration/services/NotificationInterceptor.test.js` - Service unit tests

**Total Lines of Code:** ~1,538 lines directly related to notifications

---

## Appendix B: Event Flows

### Complete Notification Event Flow

```
1. Teams PWA → new Notification(title, options)
2. Browser: injectedNotification.js intercepts → CustomNotification
3. Browser: CustomNotification → electronAPI.showNotification(options)
4. IPC: 'show-notification' → Main Process
5. Main: app/index.js handler receives options
6. Main: playNotificationSound(options) → node-sound plays WAV
7. Main: new Notification(options) → Electron creates native notification
8. Main: notification.show() → System displays notification
9. User: Clicks notification → notification.on('click')
10. Main: mainAppWindow.show() → Brings window to front
```

### Badge Count Event Flow

```
1. Browser: Teams updates unread count
2. Browser: Custom event 'unread-count' dispatched with detail.number
3. Browser: trayIconRenderer.updateActivityCount(event)
4. Browser: trayIconRenderer.render(count) → Canvas draws badge
5. IPC: 'tray-update' { icon: dataURL, flash: boolean }
6. Main: Receives tray-update (currently no handler connected to TrayManager)
7. IPC: 'set-badge-count' count
8. Main: app.setBadgeCount(count) → Platform-specific badge
   - macOS: Dock badge shows number
   - Linux/Windows: TrayManager updates tooltip "(count)"
```

---

**End of Analysis**
