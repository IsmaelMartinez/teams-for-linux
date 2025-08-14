# IPC API Documentation

This document provides a comprehensive reference for all Inter-Process Communication (IPC) channels in Teams for Linux. IPC enables communication between the main Electron process and renderer processes (web content).

## Overview

Teams for Linux uses two types of IPC channels:
- **`ipcMain.on`**: One-way communication from renderer to main process (fire-and-forget)
- **`ipcMain.handle`**: Two-way communication with return values (request-response pattern)

## Core Application IPC Handlers

### Configuration Management

#### `get-config`
**Type**: `ipcMain.handle`  
**Purpose**: Retrieves the complete application configuration object  
**Parameters**: None  
**Returns**: `Object` - Complete configuration object with all app settings  
**Example Usage**:
```javascript
const config = await ipcRenderer.invoke('get-config');
```

#### `config-file-changed`
**Type**: `ipcMain.on`  
**Purpose**: Triggers application restart when configuration file changes  
**Parameters**: None  
**Returns**: None (triggers `app.relaunch()` and `app.exit()`)  
**Example Usage**:
```javascript
ipcRenderer.send('config-file-changed');
```

### System State Management

#### `get-system-idle-state`
**Type**: `ipcMain.handle`  
**Purpose**: Retrieves current system idle state and user status information  
**Parameters**: None  
**Returns**: `Object` with properties:
- `system`: `string` - System idle state ('active', 'idle', 'locked', or 'unknown')
- `userIdle`: `number` - User status when idle was detected (-1 if not idle)
- `userCurrent`: `number` - Current user status
**Example Usage**:
```javascript
const state = await ipcRenderer.invoke('get-system-idle-state');
// state = { system: 'active', userIdle: -1, userCurrent: 1 }
```

#### `user-status-changed`
**Type**: `ipcMain.handle`  
**Purpose**: Updates the global user status when Teams status changes  
**Parameters**: 
- `options`: `Object` with `data.status` property containing new status
**Returns**: `void`  
**Status Values**:
- `-1`: Unknown
- `1`: Available
- `2`: Busy
- `3`: Do Not Disturb
- `4`: Away
- `5`: Be Right Back
**Example Usage**:
```javascript
await ipcRenderer.invoke('user-status-changed', { data: { status: 1 } });
```

### Zoom and Partition Management

#### `get-zoom-level`
**Type**: `ipcMain.handle`  
**Purpose**: Retrieves saved zoom level for a specific partition  
**Parameters**: 
- `name`: `string` - Partition name
**Returns**: `number` - Zoom level (default: 0)  
**Example Usage**:
```javascript
const zoomLevel = await ipcRenderer.invoke('get-zoom-level', 'persist:teams');
```

#### `save-zoom-level`
**Type**: `ipcMain.handle`  
**Purpose**: Saves zoom level for a specific partition  
**Parameters**: 
- `args`: `Object` with properties:
  - `partition`: `string` - Partition name
  - `zoomLevel`: `number` - Zoom level to save
**Returns**: `void`  
**Example Usage**:
```javascript
await ipcRenderer.invoke('save-zoom-level', { 
  partition: 'persist:teams', 
  zoomLevel: 1.5 
});
```

### Screen Sharing and Desktop Capture

#### `desktop-capturer-get-sources`
**Type**: `ipcMain.handle`  
**Purpose**: Retrieves available screen/window sources for screen sharing  
**Parameters**: 
- `opts`: `Object` - Options for `desktopCapturer.getSources()`
  - `types`: `Array<string>` - Source types ('screen', 'window')
  - `thumbnailSize`: `Object` - Thumbnail dimensions
  - `fetchWindowIcons`: `boolean` - Whether to fetch window icons
**Returns**: `Array<DesktopCapturerSource>` - Available sources  
**Example Usage**:
```javascript
const sources = await ipcRenderer.invoke('desktop-capturer-get-sources', {
  types: ['window', 'screen'],
  thumbnailSize: { width: 150, height: 150 }
});
```

#### `select-source`
**Type**: `ipcMain.on`  
**Purpose**: Handles screen sharing source selection (triggers stream selector UI)  
**Parameters**: Event data (handled internally)  
**Returns**: None (replies with selected source via `event.reply`)

#### `screen-sharing-stopped`
**Type**: `ipcMain.on`  
**Purpose**: Handles screen sharing stop events and cleanup  
**Parameters**: None  
**Returns**: None (closes popout window and resets state)  
**Example Usage**:
```javascript
ipcRenderer.send('screen-sharing-stopped');
```

#### `get-screen-sharing-status`
**Type**: `ipcMain.handle`  
**Purpose**: Retrieves current screen sharing status  
**Parameters**: None  
**Returns**: `boolean` - Whether screen sharing is currently active  
**Example Usage**:
```javascript
const isSharing = await ipcRenderer.invoke('get-screen-sharing-status');
```

#### `get-screen-share-stream`
**Type**: `ipcMain.handle`  
**Purpose**: Retrieves current screen share source ID  
**Parameters**: None  
**Returns**: `string|null` - Current screen share source ID or null if not sharing  
**Example Usage**:
```javascript
const sourceId = await ipcRenderer.invoke('get-screen-share-stream');
```

#### `get-screen-share-screen`
**Type**: `ipcMain.handle`  
**Purpose**: Retrieves current screen share screen settings  
**Parameters**: None  
**Returns**: `Object|null` - Screen share configuration object or null if not sharing  
**Example Usage**:
```javascript
const screenConfig = await ipcRenderer.invoke('get-screen-share-screen');
```  

### Notifications

#### `show-notification`
**Type**: `ipcMain.handle`  
**Purpose**: Displays system notification using Electron's Notification API  
**Parameters**: 
- `options`: `Object` with properties:
  - `icon`: `string` - Base64 data URL of notification icon
  - `title`: `string` - Notification title
  - `body`: `string` - Notification body text
  - `type`: `string` - Notification type (for sound selection)
**Returns**: `void`  
**Example Usage**:
```javascript
await ipcRenderer.invoke('show-notification', {
  icon: 'data:image/png;base64,...',
  title: 'New Message',
  body: 'You have a new message from John',
  type: 'message'
});
```

#### `play-notification-sound`
**Type**: `ipcMain.handle`  
**Purpose**: Plays notification sound based on type and user preferences  
**Parameters**: 
- `options`: `Object` with properties:
  - `type`: `string` - Notification type ('message', 'call', etc.)
  - `audio`: `string` - Audio preference (usually 'default')
  - `title`: `string` - Notification title (for logging)
  - `body`: `string` - Notification body (for logging)
**Returns**: `void`  
**Example Usage**:
```javascript
await ipcRenderer.invoke('play-notification-sound', {
  type: 'message',
  audio: 'default',
  title: 'New Message',
  body: 'You have a new message'
});
```

#### `set-badge-count`
**Type**: `ipcMain.handle`  
**Purpose**: Sets the application badge count (dock/taskbar)  
**Parameters**: 
- `count`: `number` - Badge count to display
**Returns**: `void`  
**Example Usage**:
```javascript
await ipcRenderer.invoke('set-badge-count', 5);
```

## Module-Specific IPC Handlers

### Authentication and Login (`app/login/`)

#### `submitForm`
**Type**: `ipcMain.on`  
**Purpose**: Handles SSO login form submission  
**Parameters**: Form data from login dialog  
**Returns**: None (closes login window on success)  

### Call Management (`app/mainAppWindow/browserWindowManager.js`)

#### `create-call-pop-out-window`
**Type**: `ipcMain.handle`  
**Purpose**: Creates a popout window for the active call/screen sharing  
**Parameters**: None  
**Returns**: `void`  
**Example Usage**:
```javascript
await ipcRenderer.invoke('create-call-pop-out-window');
```

#### `close-call-pop-out-window`
**Type**: `ipcMain.on`  
**Purpose**: Closes the call popout window  
**Parameters**: None  
**Returns**: None  
**Example Usage**:
```javascript
ipcRenderer.send('close-call-pop-out-window');
```

#### `resize-call-pop-out-window`
**Type**: `ipcMain.on`  
**Purpose**: Resizes the call popout window with size constraints  
**Parameters**: 
- `data`: `Object` with properties:
  - `width`: `number` - Desired window width
  - `height`: `number` - Desired window height
**Returns**: None  
**Example Usage**:
```javascript
ipcRenderer.send('resize-call-pop-out-window', { width: 400, height: 300 });
```

#### `incoming-call-created`
**Type**: `ipcMain.handle`  
**Purpose**: Handles incoming call events (notifications, commands)  
**Parameters**: 
- `data`: `Object` - Call data with caller information
**Returns**: `void`  

#### `incoming-call-ended`
**Type**: `ipcMain.handle`  
**Purpose**: Handles call end events (cleanup, restore settings)  
**Parameters**: 
- `data`: `Object` - Call end data
**Returns**: `void`  

#### `call-connected`
**Type**: `ipcMain.handle`  
**Purpose**: Handles call connection events (screen lock prevention)  
**Parameters**: Call connection data  
**Returns**: `void`  

#### `call-disconnected`
**Type**: `ipcMain.handle`  
**Purpose**: Handles call disconnection events (restore power management)  
**Parameters**: Call disconnection data  
**Returns**: `void`  

### Call Toast Management (`app/incomingCallToast/`)

#### `incoming-call-action`
**Type**: `ipcMain.on`  
**Purpose**: Handles user actions on incoming call toast (accept/decline)  
**Parameters**: 
- `action`: `string` - Action taken ('accept', 'decline', etc.)
**Returns**: None  

#### `incoming-call-toast-ready`
**Type**: `ipcMain.once`  
**Purpose**: Signals that incoming call toast window is ready  
**Parameters**: None  
**Returns**: None  

### Tray Management (`app/menus/tray.js`)

#### `tray-update`
**Type**: `ipcMain.on`  
**Purpose**: Updates system tray icon and flash state  
**Parameters**: 
- `icon`: `string` - Icon identifier
- `flash`: `boolean` - Whether to flash the icon
**Returns**: None  

### Settings Management (`app/menus/index.js`)

#### `get-teams-settings`
**Type**: `ipcMain.once`  
**Purpose**: Retrieves Teams settings for backup  
**Parameters**: Teams settings data  
**Returns**: None (processes settings internally)  

#### `set-teams-settings`
**Type**: `ipcMain.once`  
**Purpose**: Restores Teams settings from backup  
**Parameters**: Settings data to restore  
**Returns**: None  

### Stream Selector (`app/streamSelector/`)

#### `selected-source`
**Type**: `ipcMain.once`  
**Purpose**: Handles screen sharing source selection completion  
**Parameters**: Selected source data  
**Returns**: None (closes selector window)  

#### `close-view`
**Type**: `ipcMain.once`  
**Purpose**: Handles stream selector window closure  
**Parameters**: None  
**Returns**: None (closes selector window)  

### Connection Management (`app/connectionManager/`)

#### `offline-retry`
**Type**: `ipcMain.on`  
**Purpose**: Handles offline retry requests  
**Parameters**: None  
**Returns**: None (triggers connection refresh)  

### Custom Background (`app/customBackground/`)

#### `get-custom-bg-list`
**Type**: `ipcMain.handle`  
**Purpose**: Retrieves list of available custom background images  
**Parameters**: None  
**Returns**: `Array<string>` - List of background image paths  

## IPC Communication Patterns

### Request-Response Pattern (`ipcMain.handle`)
Use for operations that need to return data to the renderer:
```javascript
// Main process
ipcMain.handle('channel-name', async (event, ...args) => {
  // Process request
  return result;
});

// Renderer process
const result = await ipcRenderer.invoke('channel-name', arg1, arg2);
```

### Fire-and-Forget Pattern (`ipcMain.on`)
Use for notifications or commands that don't need a response:
```javascript
// Main process
ipcMain.on('channel-name', (event, ...args) => {
  // Handle event
});

// Renderer process
ipcRenderer.send('channel-name', arg1, arg2);
```

### One-Time Handlers (`ipcMain.once`)
Use for events that should only be handled once:
```javascript
// Main process
ipcMain.once('channel-name', (event, ...args) => {
  // Handle one-time event
});
```

## Security Considerations

- All IPC channels are available only within the application context
- Sensitive data should be validated in main process handlers
- Avoid exposing raw file system access through IPC
- Use `contextIsolation: true` in renderer process security settings

## Debugging IPC Communication

Enable debug logging to trace IPC calls:
```bash
# Set environment variable
DEBUG=teams-for-linux:ipc npm start

# Or use Electron's built-in logging
npm start -- --enable-logging --log-level=0
```

Common debugging steps:
1. Verify channel names match exactly between sender and receiver
2. Check parameter types and structure
3. Ensure handlers are registered before use
4. Use `console.debug` in handlers for troubleshooting

## Migration Notes

When refactoring IPC handlers:
1. Update this documentation alongside code changes
2. Maintain backward compatibility when possible
3. Consider grouping related handlers into modules
4. Use consistent naming conventions for new channels
