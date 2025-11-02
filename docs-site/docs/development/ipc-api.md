# IPC API Documentation

This document provides a comprehensive reference for all Inter-Process Communication (IPC) channels in Teams for Linux. IPC enables communication between the main Electron process and renderer processes (web content).

## Overview

Teams for Linux uses two types of IPC channels:
- **`ipcMain.on`**: One-way communication from renderer to main process (fire-and-forget)
- **`ipcMain.handle`**: Two-way communication with return values (request-response pattern)

### Security Configuration (v2.5.2+)

As of version 2.5.2, Teams for Linux implements IPC security validation as a compensating control for disabled contextIsolation and sandbox features:

- **Channel Allowlisting**: Only pre-approved IPC channels are permitted
- **Payload Sanitization**: Automatic removal of dangerous properties (`__proto__`, `constructor`, etc.)
- **Request Logging**: Blocked channels are logged for security monitoring
- **Domain Validation**: Enhanced Teams domain validation prevents subdomain hijacking

Unauthorized IPC channels will be blocked and logged. If you encounter "Unauthorized IPC channel" errors, verify the channel name is in the official allowlist.

## Core Application IPC Handlers

// TODO: Properly document all IPC handler calls.

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

:::note Developer Reference
This documentation is automatically generated from the IPC handler definitions in the codebase. For implementation details, see the source files in `app/` directory.
:::

## Screen Sharing IPC Handlers

### Stream Selection

#### `screen-sharing-started`
**Type**: `ipcMain.on`  
**Purpose**: Notifies main process that screen sharing has started  
**Parameters**: `string` - Source ID of the shared screen  

#### `screen-sharing-stopped`
**Type**: `ipcMain.on`  
**Purpose**: Notifies main process that screen sharing has stopped  
**Parameters**: None  

## Notification Management

### Notification Handling

#### `show-notification`
**Type**: `ipcMain.on`  
**Purpose**: Displays system notification  
**Parameters**: `Object` with notification options  

## Navigation IPC Handlers

### Navigation Control

#### `navigate-back`
**Type**: `ipcMain.on`
**Purpose**: Navigates back in the browser history
**Parameters**: None
**Returns**: None
**Example Usage**:
```javascript
ipcRenderer.send('navigate-back');
```

#### `navigate-forward`
**Type**: `ipcMain.on`
**Purpose**: Navigates forward in the browser history
**Parameters**: None
**Returns**: None
**Example Usage**:
```javascript
ipcRenderer.send('navigate-forward');
```

#### `get-navigation-state`
**Type**: `ipcMain.handle`
**Purpose**: Retrieves current navigation state (whether back/forward navigation is available)
**Parameters**: None
**Returns**: `Object` with properties:
- `canGoBack`: `boolean` - Whether back navigation is available
- `canGoForward`: `boolean` - Whether forward navigation is available

**Example Usage**:
```javascript
const state = await ipcRenderer.invoke('get-navigation-state');
// state = { canGoBack: true, canGoForward: false }
```

#### `navigation-state-changed`
**Type**: `ipcMain.on` (listener in renderer)
**Purpose**: Notifies renderer when navigation state changes (fired after navigation events)
**Parameters**:
- `canGoBack`: `boolean` - Whether back navigation is available
- `canGoForward`: `boolean` - Whether forward navigation is available

**Example Usage**:
```javascript
ipcRenderer.on('navigation-state-changed', (event, canGoBack, canGoForward) => {
  console.log(`Can go back: ${canGoBack}, Can go forward: ${canGoForward}`);
});
```

## Usage Examples

### Basic Configuration Retrieval
```javascript
// In renderer process
const config = await window.electronAPI.invoke('get-config');
console.log('App title:', config.appTitle);
console.log('Theme:', config.followSystemTheme);
```

### Screen Sharing Implementation
```javascript
// Get available sources
const sources = await window.electronAPI.invoke('get-desktop-capturer-sources', {
  types: ['window', 'screen']
});

// Start screen sharing
window.electronAPI.send('screen-sharing-started', selectedSourceId);

// Stop screen sharing
window.electronAPI.send('screen-sharing-stopped');
```

### System State Monitoring
```javascript
// Check if user is idle
const idleState = await window.electronAPI.invoke('get-system-idle-state');
if (idleState.system === 'idle') {
  console.log('System is idle');
}
```

## Security Considerations

:::warning Security Notice
All IPC handlers implement proper validation and sanitization of input parameters. When adding new IPC channels:

1. Always validate input parameters
2. Use `ipcMain.handle` for data retrieval
3. Use `ipcMain.on` for actions without return values
4. Never expose sensitive system APIs directly
5. Implement proper error handling
:::

## Adding New IPC Handlers

When adding new IPC functionality:

1. **Define the handler** in the appropriate module
2. **Document the interface** following the format above
3. **Add security validation** for all parameters
4. **Test both success and error cases**
5. **Update this documentation**

### Example Implementation
```javascript
// In main process
ipcMain.handle('my-new-handler', async (event, param1, param2) => {
  try {
    // Validate parameters
    if (!param1 || typeof param1 !== 'string') {
      throw new Error('Invalid param1');
    }
    
    // Perform operation
    const result = await someAsyncOperation(param1, param2);
    return result;
  } catch (error) {
    console.error('IPC Handler Error:', error);
    throw error;
  }
});
```

## Troubleshooting

### Common Issues

1. **Handler not found**: Ensure the handler is registered in the main process
2. **Type errors**: Verify parameter types match the expected interface
3. **Security errors**: Note that as of v2.5.2+, contextIsolation has been disabled for Teams DOM access with IPC validation as compensating control
4. **Async issues**: Use proper async/await syntax for handle-type IPC

### Debug Tips

- Use `console.log` in both main and renderer processes
- Check the developer console for IPC-related errors
- Verify that preload scripts are properly configured
- Test IPC calls in isolation before integrating with UI