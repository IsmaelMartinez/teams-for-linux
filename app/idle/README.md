# Idle Monitor Module

## Overview

The Idle Monitor tracks system idle state and correlates it with user presence status in Teams. This allows the application to detect when the user has been away from their computer and potentially update their Teams status accordingly.

## Architecture

### Class: `IdleMonitor`

**Purpose:** Monitors system idle state via Electron's powerMonitor API and tracks user status changes.

**Dependencies:**
- `config` - Application configuration object
- `getUserStatus` - Function that returns the current Teams user status

**State:**
- `#config` - Private field holding the configuration
- `#getUserStatus` - Private field holding the status getter function
- `#idleTimeUserStatus` - Private field tracking the user status when the system went idle (-1 = not idle)

## Public API

### `initialize()`

Registers IPC handlers for idle state monitoring. Must be called after instantiation.

**IPC Channels Registered:**
- `get-system-idle-state` - Get current system idle state and user status correlation

## Usage

```javascript
const IdleMonitor = require('./idle/monitor');
const getUserStatus = () => userStatus; // Getter function for current user status
const idleMonitor = new IdleMonitor(config, getUserStatus);
idleMonitor.initialize();
```

## Configuration

The IdleMonitor uses the following configuration values:

- `config.appIdleTimeout` - Seconds of inactivity before system is considered idle
- `config.appIdleTimeoutCheckInterval` - How often to poll for idle state (seconds)
- `config.appActiveCheckInterval` - How often to poll for active state (seconds)

## IPC Protocol

### `get-system-idle-state`

**Request:**
```javascript
ipcRenderer.invoke('get-system-idle-state')
```

**Response:**
```javascript
{
  system: "active" | "idle" | "locked",  // Current system idle state
  userIdle: -1 | number,                 // User status when system went idle (-1 = not idle)
  userCurrent: number                    // Current user status
}
```

## Implementation Details

### Idle State Tracking

The monitor tracks two key pieces of information:

1. **System Idle State** - Retrieved from Electron's `powerMonitor.getSystemIdleState()`
   - `"active"` - User is actively using the system
   - `"idle"` - System has been inactive for the configured timeout period
   - `"locked"` - System is locked (screensaver, lock screen, etc.)

2. **User Status Correlation** - When the system transitions from active to idle:
   - The current Teams user status is captured and stored
   - This allows the application to know what status the user had before going idle
   - When the system becomes active again, this value is reset to -1

### Polling Strategy

The idle monitor is polled from the renderer process at intervals determined by configuration:
- When active: poll every `appActiveCheckInterval` seconds
- When idle: poll every `appIdleTimeoutCheckInterval` seconds

This two-tier approach reduces overhead when the system is active while ensuring timely detection of idle state.

### User Status Values

User status values are numeric codes that correspond to Teams presence states:
- `-1` - Unknown/not set
- `1` - Available
- `2-4` - Busy, Away, Do Not Disturb, etc.

The exact mapping is defined in the Teams client and may vary.

## Debug Logging

The IdleMonitor provides detailed debug logging for troubleshooting:

```javascript
GetSystemIdleState => IdleTimeout: 300s, IdleTimeoutPollInterval: 30s,
  ActiveCheckPollInterval: 1s, IdleTime: 45s, IdleState: 'idle'
```

This log shows:
- Configured idle timeout threshold
- Polling intervals for both idle and active states
- Actual system idle time (from powerMonitor)
- Current idle state

## Testing

To test the IdleMonitor:

```javascript
const mockConfig = {
  appIdleTimeout: 300,
  appIdleTimeoutCheckInterval: 30,
  appActiveCheckInterval: 1
};

let mockUserStatus = 1; // Available
const getUserStatus = () => mockUserStatus;

const monitor = new IdleMonitor(mockConfig, getUserStatus);
monitor.initialize();

// Test idle state detection via IPC
// Mock powerMonitor.getSystemIdleState to return different states
```

## Related Documentation

- [IPC API Documentation](../../docs-site/docs/development/ipc-api.md)
- [Configuration Guide](../../docs-site/docs/configuration.md)
- [Electron powerMonitor API](https://www.electronjs.org/docs/latest/api/power-monitor)
- [Contributing Guide](../../docs-site/docs/development/contributing.md)
