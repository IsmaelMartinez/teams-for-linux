# Notifications Module

This directory contains all notification-related functionality for Teams for Linux.

## Files

### `injectedNotification.js`
**Type:** Injected Script  
**Context:** Teams webpage  
**Purpose:** Intercepts Teams' native `window.Notification` calls and redirects them to Electron's notification system.

- **Injection Point:** `mainAppWindow/index.js` → `onDidFinishLoad()`
- **Timing:** After page load, before Teams initializes
- **Function:** Overrides `window.Notification` with custom implementation that calls `electronAPI.showNotification()`

### `activityManager.js`
**Type:** Preload Script  
**Context:** Renderer process with Node.js access  
**Purpose:** Monitors Teams' React internals for call events and manages user activity states.

- **Load Point:** `browser/preload.js` → `DOMContentLoaded`
- **Dependencies:** `activityHub`, `wakeLock`
- **Function:** Bridges between Teams' internal events and Electron's system integration

## Architecture

```
Teams Web Page
├── injectedNotification.js    (intercepts window.Notification calls)
└── activityManager.js         (monitors React internals via preload)
     ↓
Electron Main Process
├── Tray icon updates
├── System notifications  
└── Badge count management
```

## Related Components

- **Tray Icon:** `browser/tools/trayIconRenderer.js`, `browser/tools/mutationTitle.js`
- **IPC Handlers:** `index.js` → `show-notification`, `play-notification-sound`
- **Screen Sharing:** `screenSharing/injectedScreenSharing.js` (similar injection pattern)