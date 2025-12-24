# IPC API Documentation

This document provides an overview of Inter-Process Communication (IPC) in Teams for Linux.

:::info Complete Channel Reference
**For a complete list of all IPC channels**, see the [Auto-Generated IPC API Reference](ipc-api-generated.md).

The auto-generated documentation includes all IPC channels with descriptions, types, and source locations. It's always up-to-date - run `npm run generate-ipc-docs` to regenerate it.
:::

## Overview

Teams for Linux uses Electron's IPC system to communicate between the main process and renderer processes. There are two types of IPC channels:

- **`ipcMain.handle()`** - Request/Response pattern. The renderer sends a request and waits for a response.
- **`ipcMain.on()`** - Event pattern. Fire-and-forget notifications from renderer to main process.

## IPC Security

### Security Configuration (v2.5.2+)

As a compensating control for disabled `contextIsolation` and `sandbox` features, Teams for Linux implements comprehensive IPC security:

- **Channel Allowlisting**: Only pre-approved IPC channels are permitted
- **Payload Sanitization**: Automatic removal of dangerous properties (`__proto__`, `constructor`, etc.)
- **Request Logging**: Blocked channels are logged for security monitoring
- **Domain Validation**: Enhanced Teams domain validation prevents subdomain hijacking

**Implementation**: `app/security/ipcValidator.js`

Unauthorized IPC channels will be blocked and logged. If you encounter "Unauthorized IPC channel" errors, verify the channel name is in the official allowlist.

For more information, see the [IPC Channel Validation documentation](./security-architecture.md#ipc-channel-validation).

## Usage from Renderer Process

### Sending Events (Fire-and-Forget)

```javascript
// Send an event to main process
ipcRenderer.send('channel-name', data);
```

**Example:**
```javascript
ipcRenderer.send('navigate-back');
```

### Request/Response Pattern

```javascript
// Send request and await response
const result = await ipcRenderer.invoke('channel-name', data);
```

**Example:**
```javascript
const config = await ipcRenderer.invoke('get-config');
console.log('App version:', config.appVersion);
```

## Adding New IPC Channels

When adding a new IPC channel, follow these steps:

### 1. Register the Channel

In the main process, register the channel using either `ipcMain.handle()` or `ipcMain.on()`:

```javascript
// Request/Response pattern
ipcMain.handle('my-channel', async (event, ...args) => {
  // Handle request
  return result;
});

// Event pattern
ipcMain.on('my-event', (event, ...args) => {
  // Handle event
});
```

### 2. Add Security Allowlist Entry

Add the channel to the allowlist in `app/security/ipcValidator.js`:

```javascript
const allowedChannels = new Set([
  // ... existing channels
  'my-channel',
]);
```

### 3. Document the Channel

Add a descriptive comment above the channel registration:

```javascript
// Describe what this channel does and why
ipcMain.handle('my-channel', async (event, data) => {
  // Implementation
});
```

### 4. Update Documentation

Run the documentation generator to update the auto-generated docs:

```bash
npm run generate-ipc-docs
```

## Channel Categories

IPC channels are organized by functional area:

- **Core Application** - Configuration, navigation, version info
- **Authentication** - Login and SSO workflows
- **Notifications** - System notifications and sounds
- **Screen Sharing** - Desktop capture and sharing
- **Idle Monitoring** - System idle state detection
- **Partitions & Zoom** - Zoom level management
- **Custom Background** - Custom background images
- **Connection Management** - Network connectivity
- **Incoming Calls** - Call notifications
- **Main Window** - Window and call events
- **Menus & Tray** - Tray icon and menu updates

For the complete channel list with descriptions, see the [Auto-Generated IPC API Reference](ipc-api-generated.md).

## Best Practices

### Security

- Always validate input data in IPC handlers
- Never trust data from renderer processes
- Use the security validator for all IPC channels
- Keep the allowlist in sync with registered channels

### Error Handling

```javascript
ipcMain.handle('my-channel', async (event, data) => {
  try {
    // Handle request
    return result;
  } catch (error) {
    console.error('IPC handler error:', error);
    throw error; // Will be caught by renderer
  }
});
```

### Performance

- Keep IPC handlers lightweight
- Avoid blocking operations in handlers
- Use async/await for asynchronous operations
- Consider debouncing for frequent events

## Debugging

### Enable IPC Logging

IPC security events are automatically logged when channels are blocked:

```
[IPC Security] Blocked unauthorized channel: dangerous-channel
```

### Monitor IPC Traffic

Use Electron DevTools to monitor IPC messages:

1. Open DevTools (`Ctrl+Shift+I`)
2. Go to Console tab
3. Look for IPC-related log messages

## Related Documentation

- [Auto-Generated IPC API Reference](ipc-api-generated.md) - Complete channel listing
- [Security Architecture](./security-architecture.md) - IPC security implementation
- [Contributing Guide](./contributing.md) - Development guidelines
