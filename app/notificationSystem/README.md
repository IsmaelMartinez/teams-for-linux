# Custom Notification System (MVP)

## Overview

The custom notification system provides an alternative notification delivery method for Teams for Linux. Instead of relying on OS-level notifications (which can be unreliable, especially on Linux with varying notification daemon implementations), this system displays custom in-app toast notifications.

This is **MVP (Minimum Viable Product)** - it focuses on core toast notification functionality. Additional features (notification center, history, actions) are planned for future phases.

## Architecture

The notification system consists of four main components:

### 1. CustomNotificationManager (`index.js`)
- **Role**: Main manager class that coordinates the notification system
- **Responsibilities**:
  - Listens on `notification-show-toast` IPC channel
  - Creates and displays `NotificationToast` instances
  - Handles click callbacks (focuses main window)
- **Lifecycle**: Initialized once in `app/index.js` at startup

### 2. NotificationToast (`NotificationToast.js`)
- **Role**: BrowserWindow wrapper for individual toast notifications
- **Responsibilities**:
  - Creates a separate BrowserWindow for each notification
  - Manages window lifecycle (creation, positioning, cleanup)
  - Implements auto-dismiss timer
  - Handles click events via IPC
- **Design**: Follows the established `IncomingCallToast` pattern
- **Lifecycle**: One instance per notification toast displayed

### 3. Notification UI (`notificationToast.html`)
- **Role**: HTML/CSS UI for the toast notification
- **Features**:
  - Teams design language (dark theme, Segoe UI font)
  - Icon, title, and body text display
  - Responsive layout for various notification sizes
  - Click-to-interact area
- **Styling**: Matches Microsoft Teams visual language
- **Lifecycle**: Rendered in each toast BrowserWindow

### 4. Preload Bridge (`notificationToastPreload.js`)
- **Role**: Secure IPC communication layer between toast renderer and main process
- **Methods**:
  - `onNotificationToastInit(callback)` - Receive notification data
  - `notifyClick()` - Send click event to main process
- **Security**: Uses contextBridge for secure IPC
- **Lifecycle**: Loaded once per toast window

## Data Flow

```
Teams Web App
    ↓
window.Notification() constructor (preload.js override)
    ↓
createCustomNotification(title, options)
    ↓
electronAPI.sendNotificationToast(data)
    ↓
ipcRenderer.send("notification-show-toast", data)
    ↓
CustomNotificationManager.handleShowToast()
    ↓
new NotificationToast(data, callback, duration)
    ↓
BrowserWindow.show() + positioner.move('bottomRight')
    ↓
Toast appears for 5 seconds then auto-closes
    ↓
User click → notificationApi.notifyClick()
    ↓
ipcRenderer.send("notification-toast-click")
    ↓
Main window focused (via callback)
```

## Configuration

The custom notification system is configured via the main application config:

```javascript
{
  // Select which notification method to use
  "notificationMethod": "custom",  // "web", "electron", or "custom"

  // Custom notification settings
  "customNotification": {
    "toastDuration": 5000  // Auto-dismiss timeout in milliseconds
  }
}
```

## IPC Channels

### Inbound Channels (Main → Renderer)

- **`notification-toast-init`** - Sent by main process to toast window
  - Data: `{ id, timestamp, title, body, icon }`
  - Purpose: Initialize toast with notification content

### Outbound Channels (Renderer → Main)

- **`notification-show-toast`** - Sent by Teams preload to main process
  - Data: `{ id, timestamp, title, body, icon }`
  - Purpose: Request toast notification display

- **`notification-toast-click`** - Sent by toast renderer to main process
  - Purpose: Notify main process that user clicked the toast

## Security Considerations

- **IPC Validation**: `notification-show-toast` channel is allowlisted in `app/security/ipcValidator.js`
- **contextIsolation**: Enabled on all toast BrowserWindows
- **nodeIntegration**: Disabled on all toast BrowserWindows
- **contextBridge**: Used for secure API exposure to renderer
- **Input Validation**: Notification data validated before display

## MVP Scope

### Included Features
✅ Toast notifications with auto-dismiss
✅ Click to focus main window
✅ Teams design language
✅ Multi-monitor support via electron-positioner
✅ Configurable toast duration
✅ Sound integration (reuses existing sounds)

### Explicitly NOT Included (Phase 2+)
❌ Notification center/history
❌ Persistent storage
❌ Action buttons (View, Dismiss, Reply)
❌ Toast queue management
❌ Do Not Disturb mode integration
❌ Keyboard shortcuts

## Usage

### For Users

Enable custom notifications in your config:

```json
{
  "notificationMethod": "custom",
  "customNotification": {
    "toastDuration": 5000
  }
}
```

### For Developers

The system is automatically initialized in `app/index.js`:

```javascript
const customNotificationManager = new CustomNotificationManager(config, mainAppWindow);
customNotificationManager.initialize();
```

To trigger a notification (normally done automatically by Teams):

```javascript
ipcRenderer.send('notification-show-toast', {
  id: 'unique-id',
  timestamp: Date.now(),
  title: 'John Smith',
  body: 'Hey, can we sync?',
  icon: 'data:image/png;base64,...'
});
```

## Troubleshooting

### Toast doesn't appear
- Check that `notificationMethod: "custom"` is set in config
- Verify `customNotification` config object exists
- Check console logs for errors in CustomNotificationManager

### Toast appears but is blank
- Ensure notification data includes `title` field (required)
- Check that `icon` URL is valid and accessible
- Verify preload script is loaded (check browser console)

### Click doesn't focus window
- Check that NotificationToast callback is set correctly
- Verify main window reference is passed to CustomNotificationManager
- Check for "isDestroyed" errors in console

## Future Enhancements (Phase 2+)

### Notification Center
- Slide-in drawer showing current session notifications
- Mark as read/unread status
- Badge count on main window
- Clear all button

### Toast Enhancements
- Queue management (limit visible toasts)
- Hover to pause auto-dismiss
- Action buttons (View, Dismiss)
- Notification stacking

### Storage & Persistence
- IndexedDB for cross-session history
- Search and filter capabilities
- Export notification history

### Integration
- Tray icon badge count
- Do Not Disturb mode support
- Keyboard shortcuts (Ctrl+Shift+N for center)
- Unified with incoming call toast system

## Related Documentation

- **[Custom Notification System Research](../../docs-site/docs/development/research/custom-notification-system-research.md)** - Complete design and research
- **[IPC API Documentation](../../docs-site/docs/development/ipc-api.md)** - IPC channel reference
- **[Configuration Reference](../../docs-site/docs/configuration.md)** - Config options
- **[Contributing Guide - Architecture](../../docs-site/docs/development/contributing.md)** - System architecture

## References

- Follows pattern established by: `app/incomingCallToast/`
- Uses `electron-positioner` for multi-monitor support
- Implements Electron best practices for preload scripts
- Follows Microsoft Fluent Design for UI styling
