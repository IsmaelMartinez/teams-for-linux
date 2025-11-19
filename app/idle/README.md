# Idle Monitor Module

Monitors system idle state and correlates it with Teams user presence status.

## IdleMonitor Class

Tracks system idle state via Electron's powerMonitor API and maintains user status correlation.

**Dependencies:**
- `config` - Application configuration object
- `getUserStatus` - Function that returns current Teams user status

**IPC Channels:**
- `get-system-idle-state` - Returns system idle state and user status correlation

**Usage:**
```javascript
const getUserStatus = () => userStatus;
const idleMonitor = new IdleMonitor(config, getUserStatus);
idleMonitor.initialize();
```

**Configuration:**
- `config.appIdleTimeout` - Seconds before system considered idle
- `config.appIdleTimeoutCheckInterval` - Poll interval when idle (seconds)
- `config.appActiveCheckInterval` - Poll interval when active (seconds)

**Response Format:**
```javascript
{
  system: "active" | "idle" | "locked",  // Current system state
  userIdle: -1 | number,                 // User status when went idle
  userCurrent: number                    // Current user status
}
```
