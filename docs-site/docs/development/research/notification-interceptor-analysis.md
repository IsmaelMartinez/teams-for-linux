# NotificationInterceptor Analysis

## Overview
This document analyzes the notification handling system in Teams for Linux to inform the Phase 1 NotificationInterceptor integration requirements.

## Current Implementation Status

### NotificationInterceptor Service
**Location**: `app/domains/teams-integration/services/NotificationInterceptor.js`

**Current Status**: ✅ Already implemented in Phase 1
- Modern domain-driven architecture
- EventBus integration
- Badge count management
- Native Electron notifications
- Sound handling hooks
- Permission management

## Notification Flow Architecture

### 1. Web Notification Interception

**Entry Point**: Browser Context
```javascript
// app/browser/notifications/injectedNotification.js
class CustomNotification {
  - Intercepts Teams web Notification API
  - Routes to two methods based on config:
    1. "web" mode → Browser notifications + IPC sound
    2. "electron" mode → Full IPC to main process
  - Hardcoded permission: "granted"
  - Sets requireInteraction: false
}
```

**Key Patterns**:
- **Global override**: `window.Notification = CustomNotification`
- **Dual initialization**: Module export + self-initialization
- **Config-driven routing**: `notificationMethod` setting
- **Default icon**: Base64 Teams logo embedded

### 2. System Bridge Implementation

**Main Process Handler**: `app/index.js`
```javascript
// IPC Handlers
ipcMain.handle("show-notification", showNotification)
ipcMain.handle("play-notification-sound", playNotificationSound)
ipcMain.handle("set-badge-count", setBadgeCountHandler)
```

**Flow**:
1. Renderer → IPC invoke "show-notification"
2. Main process creates Electron.Notification
3. Plays sound via NodeSound
4. Updates badge count
5. Attaches click handler → shows main window

**Key Implementation Details**:
- Uses `Notification` from electron module
- Creates native notifications with urgency config
- Icon: `nativeImage.createFromDataURL(options.icon)`
- Click event shows main window: `mainAppWindow.show()`

### 3. Sound Management

**Implementation**: Main process only
```javascript
// app/index.js
const notificationSounds = [
  { type: "new-message", file: "assets/sounds/new_message.wav" },
  { type: "meeting-started", file: "assets/sounds/meeting_started.wav" }
]

// Player initialization
const { NodeSound } = require("node-sound")
player = NodeSound.getDefaultPlayer()
```

**Sound Logic**:
- **Disabled if**: No player OR `config.disableNotificationSound`
- **User status filter**: `disableNotificationSoundIfNotAvailable` + userStatus check
- **Type matching**: Finds sound by notification type
- **Async playback**: `await player.play(sound.file)`

**Conditional Playback**:
```javascript
if (config.disableNotificationSoundIfNotAvailable &&
    userStatus !== 1 && userStatus !== -1) {
  // Don't play sound when user not "Available"
}
```

### 4. Permission Handling

**Current Pattern**: Hardcoded grant
```javascript
// injectedNotification.js
static async requestPermission() {
  return "granted";  // Always granted
}

static get permission() {
  return "granted";
}
```

**Rationale**: Electron desktop apps don't need browser-style permission prompts

### 5. Badge Count Coordination

**Multi-layer System**:

**Layer 1: Title Mutation Observer**
```javascript
// app/browser/tools/mutationTitle.js
- Watches document.title changes
- Regex: /^\((\d+)\)/ extracts count
- Emits: CustomEvent("unread-count", { detail: { number } })
- Validates: 0-9999 range
```

**Layer 2: Tray Icon Renderer**
```javascript
// app/browser/tools/trayIconRenderer.js
- Listens to "unread-count" event
- Renders badge overlay on tray icon
- Canvas manipulation: red circle + count text
- IPC: "tray-update" with icon data URL
- Invokes: "set-badge-count" for system badge
```

**Layer 3: Main Process**
```javascript
// app/index.js
ipcMain.handle("set-badge-count", setBadgeCountHandler)
→ app.setBadgeCount(count)  // macOS dock badge
```

**Layer 4: TrayManager (Phase 1 Domain)**
```javascript
// app/domains/shell/services/TrayManager.js
setBadgeCount(count) {
  if (isMac) {
    app.setBadgeCount(count)  // Dock
  } else {
    updateTooltipWithBadge(count)  // Tray tooltip
  }
  emit('shell.tray.badgeUpdated', { count })
}
```

### 6. Event Emission Patterns

**Browser Context Events**:
- `CustomEvent("unread-count", { detail: { number } })`
  - Source: mutationTitle.js
  - Listeners: trayIconRenderer.js, preload.js

**IPC Events**:
- Renderer → Main: "show-notification", "play-notification-sound", "set-badge-count"
- Main → Renderer: "tray-update", "system-theme-changed"

**Domain Events (Phase 1)**:
```javascript
// NotificationInterceptor emits
'notification:intercepted'
'notification:shown'
'notification:clicked'
'notification:closed'
'notification:failed'
'notification:badge-updated'
'notification:sound-played'
'notification:permission-changed'

// TrayManager emits
'shell.tray.created'
'shell.tray.badgeUpdated'
'shell.tray.iconUpdated'
```

## Integration Points with Other Services

### 1. TrayManager Integration
```javascript
// Current: Direct IPC from renderer
trayIconRenderer → IPC "tray-update" → mainAppWindow.onTrayUpdate()

// Phase 1: Domain-driven
NotificationInterceptor.badgeUpdated → EventBus → TrayManager.setBadgeCount()
```

### 2. ActivityHub Integration
```javascript
// app/browser/tools/activityHub.js
- Monitors React internal events via ReactHandler
- Emits: "incoming-call-created", "call-connected", etc.
- Used by: ActivityManager for call lifecycle

// Potential Integration
NotificationInterceptor → Listen to call events → Special call notifications
```

### 3. Configuration Integration
```javascript
// Current config keys used by notifications
config.disableNotifications          // Master disable
config.disableNotificationSound      // Sound disable
config.disableNotificationSoundIfNotAvailable  // Conditional sound
config.notificationMethod            // "web" or "electron"
config.defaultNotificationUrgency    // System notification urgency
config.disableNotificationWindowFlash // Tray flash
config.trayIconEnabled               // Enable tray
config.useMutationTitleLogic         // Title-based badge count
```

### 4. WindowManager Integration
```javascript
// Current: Direct mainAppWindow reference
notification.on('click', () => mainAppWindow.show())

// Phase 1: Should use WindowManager
NotificationInterceptor.notificationClicked →
  EventBus → WindowManager.showMainWindow()
```

## Migration Requirements for Phase 1

### Already Completed ✅
- NotificationInterceptor service exists with modern architecture
- EventBus integration pattern
- Badge count management
- Native system notifications
- Sound handling hooks

### Recommended Enhancements

#### 1. Wire NotificationInterceptor to Existing Flow
```javascript
// Currently: Direct IPC in app/index.js
// Should be: Domain service orchestration

// app/index.js
ipcMain.handle("show-notification", async (event, options) => {
  const notificationInterceptor = domains.teamsIntegration.getNotificationInterceptor()
  return notificationInterceptor.interceptNotification(options)
})
```

#### 2. Connect TrayManager Badge Updates
```javascript
// NotificationInterceptor should update TrayManager
class NotificationInterceptor {
  _incrementBadgeCount() {
    this._badgeCount++
    this._emitEvent('notification:badge-updated', { count: this._badgeCount })

    // New: Update TrayManager
    const trayManager = this._domains.shell.getTrayManager()
    trayManager.setBadgeCount(this._badgeCount)
  }
}
```

#### 3. Integrate Sound System
```javascript
// Current: Hardcoded in app/index.js
// Should be: Configurable sound service

class SoundManager {
  constructor(config) {
    this.sounds = new Map([
      ['new-message', 'assets/sounds/new_message.wav'],
      ['meeting-started', 'assets/sounds/meeting_started.wav']
    ])
  }

  async play(type) {
    if (!this.isEnabled()) return
    const soundPath = this.sounds.get(type)
    if (soundPath && this.player) {
      await this.player.play(soundPath)
    }
  }
}

// NotificationInterceptor.handleSound() → SoundManager.play()
```

#### 4. Replace Direct Window References
```javascript
// Current: mainAppWindow.show()
// Should be: WindowManager via EventBus

notification.on('click', () => {
  this._emitEvent('notification:clicked', { id })
})

// WindowManager subscribes
eventBus.on('notification:clicked', () => {
  windowManager.showMainWindow()
})
```

### Configuration Migration
No changes needed - NotificationInterceptor already uses config properly:
```javascript
this._soundEnabled = this._config.get('notifications.soundEnabled', true)
```

## Testing Considerations

### Unit Tests Needed
1. **NotificationInterceptor**:
   - Notification interception with various options
   - Badge count increment/decrement
   - Permission checking
   - Event emission
   - Sound enablement toggle

2. **Integration Tests**:
   - End-to-end notification flow
   - TrayManager badge coordination
   - WindowManager show on click
   - Sound playback integration

### Edge Cases
- Multiple rapid notifications (rate limiting?)
- Badge count overflow (>9999)
- Sound player unavailable (already handled)
- Permission denied scenarios (Electron always grants)
- Notification click during window closure

## Performance Considerations

### Current Performance Patterns
```javascript
// app/index.js - Performance logging
console.debug("[TRAY_DIAG] Native notification request received", {
  title, bodyLength, hasIcon, type, urgency, timestamp
})

const totalTime = Date.now() - startTime
// Performance note if > 500ms
```

### Optimization Opportunities
1. **Badge Count Debouncing**: Rapid title changes could spam updates
2. **Icon Caching**: Reuse nativeImage instances
3. **Event Batching**: Group multiple badge updates

## Security Considerations

### Current Security Measures
```javascript
// preload.js - Input validation
showNotification: (options) => {
  if (!options || typeof options !== 'object') {
    return Promise.reject(new Error('Invalid notification options'))
  }
  return ipcRenderer.invoke("show-notification", options)
}

// Badge count validation
if (typeof count !== 'number' || count < 0 || count > 9999) {
  return Promise.reject(new Error('Invalid badge count'))
}
```

### IPC Security
- All IPC channels validated via `ipcValidator.js`
- Allowlist pattern enforced
- Input sanitization on all handlers

## Conclusions

### Current State
- **Good**: Modern NotificationInterceptor already exists in Phase 1
- **Gap**: Not yet wired into existing notification flow
- **Gap**: Still relies on legacy app/index.js handlers

### Integration Priority (Phase 1 Focus)
**CRITICAL** (Should be in Phase 1):
1. Wire NotificationInterceptor to IPC handlers
2. Connect TrayManager badge updates
3. Replace direct mainAppWindow references with WindowManager

**MEDIUM** (Can defer to Phase 2):
1. Sound system extraction
2. ActivityHub call notification integration
3. Performance optimizations

**LOW** (Future):
1. Advanced notification templates
2. Notification grouping/stacking
3. Rich media notifications

### Recommended Next Steps
1. Create integration tests for NotificationInterceptor
2. Wire NotificationInterceptor into IPC layer
3. Connect EventBus listeners (TrayManager, WindowManager)
4. Document notification event flow in ADR
5. Add TypeScript types for notification payloads
