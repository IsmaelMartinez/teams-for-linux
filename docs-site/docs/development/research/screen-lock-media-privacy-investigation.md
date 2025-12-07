# Screen Lock Media Privacy Investigation

**Issue:** [#2015](https://github.com/IsmaelMartinez/teams-for-linux/issues/2015)
**Investigation Date:** 2025-12-07
**Status:** Research Complete

## Executive Summary

This document investigates the feasibility of implementing automatic camera and microphone disabling when the user's screen is locked - a privacy feature that exists in the Windows Teams client. The investigation covers screen lock detection capabilities, media device control mechanisms, and implementation approaches for cross-platform support.

**Key Finding:** This feature is **feasible but requires platform-specific implementations**, with Linux requiring additional workarounds due to current Electron API limitations.

## Problem Statement

Users want camera and microphone to be automatically disabled when their screen locks to prevent unintended audio/video transmission when stepping away from their computer. This is a privacy-focused feature that already exists in the Windows Microsoft Teams client.

### Use Cases

- User steps away during a meeting and locks their screen
- Screen auto-locks due to inactivity during a call
- Privacy protection when leaving workstation unattended

## Research Findings

### 1. Screen Lock Detection

#### Electron PowerMonitor API

Electron's `powerMonitor` module provides system power and screen lock event monitoring:

**Available Events:**
- `lock-screen` - Emitted when the system is about to lock the screen
- `unlock-screen` - Emitted when the system screen is unlocked

**Platform Support:**
- ✅ **macOS** - Full support
- ✅ **Windows** - Full support
- ❌ **Linux** - NOT currently supported (as of Electron 32+)

**Code Example:**
```javascript
const { powerMonitor } = require('electron');

powerMonitor.on('lock-screen', () => {
  console.log('Screen locked - disable media devices');
});

powerMonitor.on('unlock-screen', () => {
  console.log('Screen unlocked');
});
```

**Alternative: System Idle State**

The `powerMonitor.getSystemIdleState()` method can return system state including "locked":

```javascript
const state = powerMonitor.getSystemIdleState(60); // Returns: "active", "idle", "locked", or "unknown"
```

This is already used in the app's `IdleMonitor` class (`app/idle/monitor.js`).

**Limitations:**
- Polling-based (not event-driven)
- May not work consistently across all Linux desktop environments
- Less precise than dedicated lock/unlock events

#### Linux-Specific Solutions

Since Electron doesn't support `lock-screen`/`unlock-screen` events on Linux, alternative approaches are needed:

**Option 1: D-Bus Integration**

Linux desktop environments expose screen lock events via D-Bus:

- **GNOME/Ubuntu**: `org.gnome.ScreenSaver` interface
- **KDE Plasma**: `org.freedesktop.ScreenSaver` interface
- **Cinnamon**: `org.cinnamon.ScreenSaver` interface

**Example D-Bus monitoring:**
```bash
dbus-monitor --session "type='signal',interface='org.gnome.ScreenSaver'"
```

**Implementation approach:**
- Use Node.js D-Bus library (e.g., `dbus-next` or `dbus-native`)
- Listen to `ActiveChanged` signal
- Handle different desktop environments

**Option 2: Polling with getSystemIdleState**

Less elegant but cross-platform compatible:
- Poll `powerMonitor.getSystemIdleState()` periodically
- React when state changes to/from "locked"
- Already have infrastructure in `IdleMonitor` class

**Option 3: Wait for Electron Support**

Track [Electron Issue #38088](https://github.com/electron/electron/issues/38088):
- Feature request filed April 2023
- Still open as of August 2024
- Assigned to maintainer Charles Kerr
- Reference implementation suggested (KeePassXC's D-Bus approach)

### 2. Media Device Control

#### Current Implementation Patterns

The app already has patterns for media device interception in `app/browser/tools/disableAutogain.js`:

**Intercepts `getUserMedia` calls:**
```javascript
// Patch modern getUserMedia API
patchFunction(navigator.mediaDevices, "getUserMedia", function (original) {
  return function getUserMedia(constraints) {
    // Modify constraints here
    return original.call(this, constraints);
  };
});
```

This demonstrates we can:
- Hook into media device requests
- Modify constraints before they're applied
- Track when media streams are created

#### Media Stream Control

To disable active camera/microphone:

**Option 1: Stop Media Tracks**

When screen locks, iterate through active media streams and stop tracks:

```javascript
// Get all video elements (Teams uses these for calls)
const mediaElements = document.querySelectorAll('video');
mediaElements.forEach(video => {
  const stream = video.srcObject;
  if (stream instanceof MediaStream) {
    stream.getTracks().forEach(track => {
      if (track.kind === 'video' || track.kind === 'audio') {
        track.stop();
        console.log(`Stopped ${track.kind} track due to screen lock`);
      }
    });
  }
});
```

**Option 2: Block getUserMedia During Lock**

Prevent new media streams while locked:

```javascript
let isScreenLocked = false;

navigator.mediaDevices.getUserMedia = new Proxy(originalGetUserMedia, {
  apply(target, thisArg, args) {
    if (isScreenLocked) {
      console.warn('Media access blocked: screen is locked');
      return Promise.reject(new DOMException('Screen is locked', 'NotAllowedError'));
    }
    return Reflect.apply(target, thisArg, args);
  }
});
```

**Option 3: Track and Restore**

More sophisticated approach:
- Track which tracks were active before lock
- Stop tracks on lock
- Optionally offer to restore on unlock (user preference)

#### Teams-Specific Considerations

- Teams manages its own media streams through React components
- Stopping tracks may trigger Teams UI to show camera/mic as disabled
- Teams might attempt to re-request permissions when unlocked
- Need to test behavior with screen sharing (is that also disabled?)

### 3. Existing Codebase Integration Points

#### Relevant Modules

**IdleMonitor** (`app/idle/monitor.js`):
- Already uses `powerMonitor.getSystemIdleState()`
- Tracks user idle status for Teams presence
- Could be extended to handle lock state

**BrowserWindowManager** (`app/mainAppWindow/browserWindowManager.js`):
- Manages screen lock inhibition during calls (opposite use case!)
- Already has IPC handlers for call state
- Uses wake lock to prevent screen from sleeping

**Browser Tools** (`app/browser/tools/`):
- `disableAutogain.js` - Shows pattern for intercepting getUserMedia
- `wakeLock.js` - Shows pattern for power management features
- Would add new tool: `mediaPrivacy.js` or `screenLockMediaControl.js`

#### IPC Communication Pattern

Need bidirectional communication:
1. **Main → Renderer**: Notify when screen locks/unlocks
2. **Renderer → Main**: Report media stream state changes

```javascript
// Main process (powerMonitor listener)
powerMonitor.on('lock-screen', () => {
  mainWindow.webContents.send('screen-locked');
});

// Renderer process (browser tool)
ipcRenderer.on('screen-locked', () => {
  disableActiveMediaDevices();
});
```

## Implementation Approach

### Recommended Phased Implementation

#### Phase 1: macOS/Windows Support

**Scope:** Implement feature using native Electron powerMonitor events

**Components:**
1. **New main process module**: `app/screenLockPrivacy/`
   - Listen to `lock-screen` and `unlock-screen` events
   - Send IPC messages to renderer
   - Configuration integration

2. **New browser tool**: `app/browser/tools/mediaPrivacy.js`
   - Track active MediaStream objects
   - Stop camera/mic tracks on lock
   - Block getUserMedia while locked
   - Optional: Track state for restore on unlock

3. **Configuration option**: `disableMediaOnScreenLock: boolean`
   - Default: `false` (opt-in feature)
   - Added to `app/config/index.js`
   - Documented in configuration docs

**Benefits:**
- Provides value for macOS/Windows users immediately
- Establishes architecture for Linux implementation
- Lower complexity, uses native Electron APIs

#### Phase 2: Linux Support

**Scope:** Add Linux compatibility using polling or D-Bus

**Option A: Polling Approach (Simpler)**
- Extend `IdleMonitor` to detect "locked" state changes
- Poll `getSystemIdleState()` periodically
- Trigger same IPC messages as macOS/Windows events
- Works across all Linux desktop environments

**Option B: D-Bus Approach (Better UX)**
- Add optional dependency: `dbus-next` or `dbus-native`
- Detect desktop environment (GNOME, KDE, Cinnamon, etc.)
- Subscribe to appropriate D-Bus signals
- Fallback to polling if D-Bus unavailable

**Recommendation:** Start with Option A (polling) for consistency, add Option B later if user feedback demands it.

#### Phase 3: Enhanced Privacy Features

**Potential Extensions:**
- Configuration for screen lock timeout before disabling media
- Separate controls for camera vs microphone
- Notification when media is disabled due to lock
- Log events for security audit
- Integration with MQTT status reporting

### Configuration Design

```json
{
  "screenLockPrivacy": {
    "enabled": false,
    "disableCamera": true,
    "disableMicrophone": true,
    "restoreOnUnlock": false,
    "lockDetectionMethod": "auto",  // "auto", "events", "polling", "dbus"
    "notifyUser": true
  }
}
```

### File Structure

```
app/
  screenLockPrivacy/
    index.js           # Main process module
    README.md          # Module documentation
  browser/
    tools/
      mediaPrivacy.js  # Renderer process media control
```

### Testing Considerations

1. **Manual Testing:**
   - Lock screen during active call - verify camera/mic disabled
   - Unlock screen - verify state behavior matches config
   - Test across desktop environments (GNOME, KDE, XFCE)
   - Test with screen sharing active

2. **Edge Cases:**
   - Screen lock during ongoing screen share
   - Rapid lock/unlock cycles
   - System suspend vs screen lock
   - Multiple displays

3. **E2E Test Challenges:**
   - Difficult to automate screen locking in test environment
   - May need platform-specific test utilities
   - Could mock powerMonitor events for testing logic

## Security and Privacy Considerations

### Benefits

- ✅ Prevents unintended audio/video transmission
- ✅ Aligns with privacy-by-design principles
- ✅ Matches Windows Teams client behavior
- ✅ User control via configuration

### Risks

- ⚠️ Could interrupt important calls if screen locks unexpectedly
- ⚠️ User may not realize media was disabled
- ⚠️ Teams UI might show unexpected state changes

### Mitigations

- Make feature opt-in by default
- Show notification when media disabled due to lock
- Add configuration for lock timeout before disabling
- Document behavior clearly
- Consider keeping microphone active but camera disabled (option)

## Platform Support Matrix

| Platform | Lock Detection | Implementation Status | Notes |
|----------|---------------|----------------------|-------|
| macOS | `powerMonitor` events | ✅ Ready | Native support |
| Windows | `powerMonitor` events | ✅ Ready | Native support |
| Linux (GNOME) | Polling or D-Bus | ⚠️ Workaround needed | D-Bus: `org.gnome.ScreenSaver` |
| Linux (KDE) | Polling or D-Bus | ⚠️ Workaround needed | D-Bus: `org.freedesktop.ScreenSaver` |
| Linux (Other) | Polling | ⚠️ Workaround needed | Use `getSystemIdleState()` |

## Related Work

### Similar Implementations

- **KeePassXC**: Uses D-Bus for Linux lock detection ([Electron Issue #38088](https://github.com/electron/electron/issues/38088))
- **Windows Teams Client**: Native implementation (proprietary)
- **Zoom**: Has similar privacy features on some platforms

### Dependencies

**Potential npm packages for Linux:**
- `dbus-next` - Modern D-Bus library for Node.js
- `dbus-native` - Alternative D-Bus implementation
- Neither adds burden if used conditionally on Linux only

## Recommendations

### Immediate Actions

1. ✅ **Create GitHub issue comment** with investigation findings
2. ✅ **Discuss with maintainer** about desired implementation approach
3. **Create Architecture Decision Record (ADR)** if approved for implementation

### Implementation Recommendation

**YES - Implement this feature** with the following approach:

1. **Start with Phase 1** (macOS/Windows using native events)
2. **Use polling for Linux** in Phase 2 (extend `IdleMonitor`)
3. **Make opt-in** to avoid surprising users
4. **Add comprehensive configuration** for flexibility
5. **Document thoroughly** in user and developer docs

### Open Questions for Maintainer

1. Should this be enabled by default or opt-in?
2. Should screen sharing also be disabled, or only camera/microphone?
3. Should we attempt to restore media on unlock, or leave disabled?
4. Should we invest in D-Bus integration for Linux, or is polling acceptable?
5. Should there be a grace period/timeout before disabling on lock?
6. How should this interact with the existing wake lock functionality?

## References

### Electron Documentation
- [powerMonitor API](https://www.electronjs.org/docs/latest/api/power-monitor)
- [MediaStream API](https://developer.mozilla.org/en-US/docs/Web/API/MediaStream)

### Issues and Discussions
- [Electron Issue #38088 - Linux lock-screen support](https://github.com/electron/electron/issues/38088)
- [Teams for Linux Issue #2015 - Disable camera/mic on lock](https://github.com/IsmaelMartinez/teams-for-linux/issues/2015)

### D-Bus Resources
- [Ask Ubuntu - Monitor screen lock/unlock with D-Bus](https://askubuntu.com/questions/858236/how-do-i-call-dbus-code-that-monitors-when-screen-is-locked-unlocked)
- [Linux Mint Forums - D-Bus signals for monitor power](https://forums.linuxmint.com/viewtopic.php?t=403577)

## Appendix: Code Examples

### Example: Main Process Module

```javascript
// app/screenLockPrivacy/index.js
const { ipcMain, powerMonitor } = require('electron');

class ScreenLockPrivacy {
  #config;
  #window;
  #isLocked = false;

  constructor(config, mainWindow) {
    this.#config = config;
    this.#window = mainWindow;
  }

  initialize() {
    if (!this.#config.screenLockPrivacy?.enabled) {
      console.debug('[SCREEN_LOCK_PRIVACY] Feature disabled in configuration');
      return;
    }

    // Try native events first (macOS/Windows)
    if (process.platform === 'darwin' || process.platform === 'win32') {
      this.#setupNativeEvents();
    } else {
      // Linux: Use polling
      this.#setupPolling();
    }

    console.info('[SCREEN_LOCK_PRIVACY] Initialized');
  }

  #setupNativeEvents() {
    powerMonitor.on('lock-screen', () => {
      this.#handleScreenLock();
    });

    powerMonitor.on('unlock-screen', () => {
      this.#handleScreenUnlock();
    });

    console.debug('[SCREEN_LOCK_PRIVACY] Using native lock-screen events');
  }

  #setupPolling() {
    // Poll every 5 seconds
    setInterval(() => {
      const state = powerMonitor.getSystemIdleState(60);
      const isNowLocked = state === 'locked';

      if (isNowLocked !== this.#isLocked) {
        if (isNowLocked) {
          this.#handleScreenLock();
        } else {
          this.#handleScreenUnlock();
        }
      }
    }, 5000);

    console.debug('[SCREEN_LOCK_PRIVACY] Using polling for lock detection');
  }

  #handleScreenLock() {
    this.#isLocked = true;
    console.info('[SCREEN_LOCK_PRIVACY] Screen locked - disabling media devices');
    this.#window.webContents.send('screen-lock-privacy:lock');
  }

  #handleScreenUnlock() {
    this.#isLocked = false;
    console.info('[SCREEN_LOCK_PRIVACY] Screen unlocked');
    this.#window.webContents.send('screen-lock-privacy:unlock');
  }
}

module.exports = ScreenLockPrivacy;
```

### Example: Browser Tool

```javascript
// app/browser/tools/mediaPrivacy.js
const activeStreams = new WeakSet();
const trackedTracks = [];

function init(config, ipcRenderer) {
  if (!config.screenLockPrivacy?.enabled) {
    console.debug('[MEDIA_PRIVACY] Feature disabled in configuration');
    return;
  }

  // Track getUserMedia calls
  const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async function(constraints) {
    const stream = await originalGetUserMedia(constraints);
    trackMediaStream(stream);
    return stream;
  };

  // Listen for lock events
  ipcRenderer.on('screen-lock-privacy:lock', () => {
    disableAllMediaTracks();
  });

  ipcRenderer.on('screen-lock-privacy:unlock', () => {
    // Optionally restore based on config
    if (config.screenLockPrivacy.restoreOnUnlock) {
      console.debug('[MEDIA_PRIVACY] Auto-restore not implemented');
    }
  });

  console.info('[MEDIA_PRIVACY] Media privacy protection initialized');
}

function trackMediaStream(stream) {
  if (!stream || activeStreams.has(stream)) return;

  activeStreams.add(stream);
  stream.getTracks().forEach(track => {
    trackedTracks.push({
      track,
      kind: track.kind,
      wasActive: true
    });
  });
}

function disableAllMediaTracks() {
  console.info('[MEDIA_PRIVACY] Disabling all active media tracks');

  trackedTracks.forEach(({ track, kind }) => {
    if (track.readyState === 'live') {
      track.stop();
      console.debug(`[MEDIA_PRIVACY] Stopped ${kind} track`);
    }
  });

  // Clear inactive tracks
  trackedTracks = trackedTracks.filter(({ track }) => track.readyState === 'live');
}

module.exports = { init };
```

## Conclusion

This feature is **technically feasible and recommended for implementation**. The main challenge is Linux support due to Electron API limitations, but this can be addressed through polling `getSystemIdleState()` or optional D-Bus integration.

The feature aligns with:
- User privacy expectations
- Windows Teams client parity
- Teams for Linux's goal of providing a native-like experience

Recommend starting with macOS/Windows implementation using native events, then adding Linux support via polling in a second phase.
