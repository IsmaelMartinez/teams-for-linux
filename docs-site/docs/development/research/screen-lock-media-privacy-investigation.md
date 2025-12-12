# Screen Lock Media Privacy Investigation

**Issue:** [#2015](https://github.com/IsmaelMartinez/teams-for-linux/issues/2015)
**Investigation Date:** 2025-12-12
**Status:** Research Complete

## Executive Summary

This document investigates the feasibility of implementing automatic camera and microphone disabling when the user's screen is locked - a privacy feature that exists in the Windows Teams client. The investigation covers screen lock detection capabilities, media device control mechanisms, and implementation approaches with a **Linux-first philosophy**.

**Key Finding:** This feature is **feasible using a user-script approach** that aligns with Linux/Unix philosophy. Rather than implementing all screen lock detection logic in the application, Teams for Linux should expose **commands/APIs** that users can invoke from their own screen lock scripts (D-Bus listeners, systemd hooks, etc.).

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

## Linux-First Approach: User-Controlled Scripts

### Philosophy

Teams for Linux is a **Linux application** that should embrace Unix philosophy: provide composable tools that users can wire together. Rather than trying to detect every desktop environment's screen lock mechanism, we should:

1. **Expose commands/APIs** that users can call to disable/enable media
2. **Document integration patterns** for common desktop environments
3. **Let users hook into their OS** using the tools they prefer

### Existing Infrastructure to Leverage

Teams for Linux already has **two mechanisms** that users can integrate with:

#### 1. MQTT Commands (Already Implemented!)

The MQTT integration already supports bidirectional communication:

**Existing commands:**
- `toggle-mute` - Toggle microphone
- `toggle-video` - Toggle camera
- `toggle-hand-raise` - Raise/lower hand

**How it works:**
```bash
# User's screen lock script can send MQTT commands
mosquitto_pub -h localhost -t "teams/command" \
  -m '{"action":"toggle-video"}' -q 1
```

**Limitation:** These are **toggles**, not explicit disable/enable commands. We need to add:
- `disable-media` - Explicitly disable camera and mic
- `enable-media` - Explicitly enable camera and mic (or restore previous state)
- `query-media-state` - Get current camera/mic state

#### 2. Similar Pattern: `incomingCallCommand`

The app already runs external commands for events:
```json
{
  "incomingCallCommand": "/path/to/script.sh",
  "incomingCallCommandArgs": ["caller", "text", "image"]
}
```

We could extend this pattern with:
```json
{
  "screenLockCommand": "/path/to/user-script.sh",
  "screenLockCommandArgs": ["lock|unlock"]
}
```

But this is **backwards** - we want the user's lock script to call us, not us calling the user's script.

### Recommended Linux Solution

**Provide new MQTT commands that users can invoke from their own screen lock handlers.**

#### User's Workflow

**Step 1: User sets up screen lock listener** (their responsibility)

Example for GNOME:
```bash
#!/bin/bash
# ~/.local/bin/teams-lock-privacy.sh

dbus-monitor --session "type='signal',interface='org.gnome.ScreenSaver'" |
while read -r line; do
  if echo "$line" | grep -q "boolean true"; then
    # Screen locked
    mosquitto_pub -h localhost -t "teams/command" \
      -m '{"action":"disable-media"}' -q 1
  elif echo "$line" | grep -q "boolean false"; then
    # Screen unlocked (optional)
    # User can choose whether to re-enable or leave disabled
    # mosquitto_pub -h localhost -t "teams/command" \
    #   -m '{"action":"enable-media"}' -q 1
  fi
done
```

**Step 2: Teams for Linux handles the command** (our responsibility)

New MQTT command handlers:
- `disable-media` - Stop all active camera and microphone tracks
- `enable-media` - Allow media requests again (doesn't auto-start)
- `query-media-state` - Return current media state

#### Benefits of This Approach

✅ **Linux philosophy** - Composable tools, user control
✅ **Desktop agnostic** - Works with GNOME, KDE, XFCE, sway, etc.
✅ **Reuses existing infrastructure** - MQTT already implemented
✅ **Flexible** - Users can customize behavior, add delays, logging, etc.
✅ **Optional** - Users opt-in by writing their own integration
✅ **Testable** - Users can manually test with `mosquitto_pub`

#### Challenges

⚠️ **Requires MQTT enabled** - Not all users have MQTT configured
⚠️ **User setup required** - Not "automatic" like native Windows/macOS
⚠️ **Documentation needed** - Must provide clear examples for different DEs

### Alternative: D-Bus Interface

Instead of (or in addition to) MQTT, Teams for Linux could expose its own D-Bus interface:

```bash
# User's lock script calls our D-Bus method
dbus-send --session --dest=org.teamsforlinux.MediaPrivacy \
  --type=method_call /org/teamsforlinux/MediaPrivacy \
  org.teamsforlinux.MediaPrivacy.DisableMedia
```

**Benefits:**
- More "native" to Linux desktop integration
- Doesn't require MQTT broker
- Can be called synchronously

**Drawbacks:**
- Additional implementation complexity
- Another integration point to maintain
- MQTT is already implemented and working

## Implementation Approach

### Recommended: Three-Tier Implementation

Support all platforms with appropriate approaches:

#### Tier 1: MQTT Commands (Linux Focus - Immediate)

**Add new MQTT commands for user-script integration:**

1. **New MQTT Actions** (extend `app/mqtt/index.js`):
   ```javascript
   this.actionShortcutMap = {
     'toggle-mute': 'Ctrl+Shift+M',
     'toggle-video': 'Ctrl+Shift+O',
     'toggle-hand-raise': 'Ctrl+Shift+K',
     // NEW COMMANDS:
     'disable-media': null,  // Custom handler, not keyboard shortcut
     'enable-media': null,   // Custom handler, not keyboard shortcut
   };
   ```

2. **New browser tool**: `app/browser/tools/mediaPrivacy.js`
   - Track active MediaStream objects
   - Handle `disable-media` command: Stop all camera/mic tracks
   - Handle `enable-media` command: Remove block on getUserMedia
   - Track state for optional restore
   - Expose via IPC for MQTT to call

3. **Documentation** (primary deliverable):
   - Add section to `docs-site/docs/mqtt-integration.md`
   - Provide example scripts for:
     - GNOME (`org.gnome.ScreenSaver`)
     - KDE (`org.freedesktop.ScreenSaver`)
     - Cinnamon (`org.cinnamon.ScreenSaver`)
     - systemd user session hooks
     - Generic D-Bus monitor approach

**Benefits:**
- ✅ Works TODAY with existing infrastructure
- ✅ Aligns with Linux philosophy
- ✅ Maximum flexibility for users
- ✅ No desktop environment dependencies
- ✅ Users can test immediately with `mosquitto_pub`

**User experience:**
```bash
# User's GNOME lock script
mosquitto_pub -h localhost -t "teams/command" \
  -m '{"action":"disable-media"}' -q 1
```

#### Tier 2: Native Events (macOS/Windows - Optional)

**Add automatic handling for platforms with native support:**

1. **New main process module**: `app/screenLockPrivacy/index.js`
   - Listen to `powerMonitor` `lock-screen`/`unlock-screen` events
   - Automatically call media privacy functions
   - Configuration: `screenLockPrivacy.enabled: false` (opt-in)

2. **Reuse browser tool** from Tier 1
   - Same media control logic
   - Called automatically instead of via MQTT

**Benefits:**
- Automatic for macOS/Windows users
- Leverages native OS events
- Still reuses core media control logic

**Configuration:**
```json
{
  "screenLockPrivacy": {
    "enabled": true,  // macOS/Windows only
    "disableCamera": true,
    "disableMicrophone": true,
    "restoreOnUnlock": false
  }
}
```

#### Tier 3: Polling Fallback (Linux - Optional)

**For users who don't want to set up scripts:**

1. **Extend `IdleMonitor`** (`app/idle/monitor.js`)
   - Detect state transitions to/from "locked"
   - Trigger media privacy functions automatically
   - Configuration: `screenLockPrivacy.usePolling: true`

2. **Reuse browser tool** from Tier 1
   - Same media control logic
   - Called automatically via polling

**Benefits:**
- Works without user scripts
- Cross-desktop-environment on Linux
- Opt-in for users who want "automatic" behavior

**Drawbacks:**
- Polling overhead (5-10 second intervals)
- Less precise than event-based detection
- May not work on all distributions

### Prioritization

**Recommended order:**
1. **FIRST: Tier 1 (MQTT Commands)** - Biggest impact for Linux users
2. **SECOND: Documentation** - Critical for adoption
3. **THIRD: Tier 2 (Native Events)** - Nice-to-have for macOS/Windows
4. **MAYBE: Tier 3 (Polling)** - Only if users request it

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

## Appendix A: User Integration Scripts

These are example scripts users can deploy to integrate screen lock with Teams for Linux media privacy.

### GNOME (Ubuntu, Fedora, etc.)

```bash
#!/bin/bash
# ~/.local/bin/teams-lock-privacy.sh
# Monitors GNOME screen lock and disables Teams media

MQTT_HOST="localhost"
MQTT_TOPIC="teams/command"

dbus-monitor --session "type='signal',interface='org.gnome.ScreenSaver'" |
while read -r line; do
  if echo "$line" | grep -q "boolean true"; then
    echo "$(date): Screen locked - disabling Teams media"
    mosquitto_pub -h "$MQTT_HOST" -t "$MQTT_TOPIC" \
      -m '{"action":"disable-media","timestamp":"'"$(date -Iseconds)"'"}' -q 1
  elif echo "$line" | grep -q "boolean false"; then
    echo "$(date): Screen unlocked"
    # Optionally enable media on unlock:
    # mosquitto_pub -h "$MQTT_HOST" -t "$MQTT_TOPIC" \
    #   -m '{"action":"enable-media"}' -q 1
  fi
done
```

**Autostart with systemd:**

```ini
# ~/.config/systemd/user/teams-lock-privacy.service
[Unit]
Description=Teams for Linux screen lock media privacy
After=graphical-session.target

[Service]
Type=simple
ExecStart=/home/%u/.local/bin/teams-lock-privacy.sh
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

Enable:
```bash
chmod +x ~/.local/bin/teams-lock-privacy.sh
systemctl --user enable --now teams-lock-privacy.service
```

### KDE Plasma

```bash
#!/bin/bash
# ~/.local/bin/teams-lock-privacy-kde.sh
# Monitors KDE screen lock and disables Teams media

MQTT_HOST="localhost"
MQTT_TOPIC="teams/command"

dbus-monitor --session "type='signal',interface='org.freedesktop.ScreenSaver'" |
while read -r line; do
  if echo "$line" | grep -q "boolean true"; then
    echo "$(date): Screen locked - disabling Teams media"
    mosquitto_pub -h "$MQTT_HOST" -t "$MQTT_TOPIC" \
      -m '{"action":"disable-media"}' -q 1
  elif echo "$line" | grep -q "boolean false"; then
    echo "$(date): Screen unlocked"
  fi
done
```

### Cinnamon (Linux Mint)

```bash
#!/bin/bash
# ~/.local/bin/teams-lock-privacy-cinnamon.sh

MQTT_HOST="localhost"
MQTT_TOPIC="teams/command"

dbus-monitor --session "type='signal',interface='org.cinnamon.ScreenSaver'" |
while read -r line; do
  if echo "$line" | grep -q "boolean true"; then
    mosquitto_pub -h "$MQTT_HOST" -t "$MQTT_TOPIC" \
      -m '{"action":"disable-media"}' -q 1
  fi
done
```

### Generic D-Bus Monitor (Any Desktop)

This version listens for multiple screen saver interfaces:

```bash
#!/bin/bash
# ~/.local/bin/teams-lock-privacy-generic.sh

MQTT_HOST="localhost"
MQTT_TOPIC="teams/command"

# Listen for any screen saver lock signal
dbus-monitor --session "type='signal',member='ActiveChanged'" |
while read -r line; do
  if echo "$line" | grep -q "boolean true"; then
    echo "$(date): Screen lock detected - disabling Teams media"
    mosquitto_pub -h "$MQTT_HOST" -t "$MQTT_TOPIC" \
      -m '{"action":"disable-media"}' -q 1
  elif echo "$line" | grep -q "boolean false"; then
    echo "$(date): Screen unlock detected"
  fi
done
```

### i3/sway (Manual Lock with i3lock/swaylock)

Wrap your lock command:

```bash
#!/bin/bash
# ~/.local/bin/lock-with-teams-privacy.sh

# Disable Teams media BEFORE locking
mosquitto_pub -h localhost -t "teams/command" \
  -m '{"action":"disable-media"}' -q 1

# Lock the screen
i3lock -c 000000  # or: swaylock

# Optionally enable on unlock:
# mosquitto_pub -h localhost -t "teams/command" \
#   -m '{"action":"enable-media"}' -q 1
```

Bind in i3 config:
```
bindsym $mod+Shift+x exec ~/.local/bin/lock-with-teams-privacy.sh
```

### Testing Your Integration

Test manually without locking:

```bash
# Disable media
mosquitto_pub -h localhost -t "teams/command" \
  -m '{"action":"disable-media"}' -q 1

# Verify camera/mic are stopped in Teams UI

# Enable media
mosquitto_pub -h localhost -t "teams/command" \
  -m '{"action":"enable-media"}' -q 1
```

## Appendix B: Code Examples

### Example: MQTT Command Handler (Tier 1)

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

This feature is **technically feasible and recommended for implementation** with a **Linux-first, user-empowering approach**.

### Key Recommendations

1. **Start with MQTT command extension** (Tier 1)
   - Immediate value for Linux users
   - Leverages existing infrastructure
   - Aligns with Unix philosophy
   - Minimal implementation effort

2. **Provide comprehensive documentation**
   - Example scripts for major desktop environments
   - systemd integration patterns
   - Testing procedures
   - This is MORE important than the code

3. **Optional: Add native event handling** for macOS/Windows users who want automatic behavior

### Why This Approach Works

✅ **Embraces Linux philosophy** - Composable tools, user control
✅ **Desktop environment agnostic** - Works everywhere
✅ **Leverages existing code** - MQTT already implemented and tested
✅ **User empowerment** - Users can customize, log, add delays, etc.
✅ **Testable** - Users can verify behavior before integrating
✅ **Optional** - Users opt-in by choice

### Implementation Effort

**Tier 1 (MQTT Commands):**
- Code: ~200 lines (browser tool + MQTT handler extension)
- Documentation: Critical - provide ready-to-use scripts
- Estimated effort: 1-2 days development + documentation

**Tier 2 (Native Events):**
- Code: ~150 lines (main process module)
- Documentation: Configuration examples
- Estimated effort: 1 day

**Tier 3 (Polling):**
- Code: ~100 lines (IdleMonitor extension)
- Estimated effort: 0.5 days

### Alignment with Project Goals

The feature aligns with:
- ✅ User privacy expectations
- ✅ Linux-first development philosophy
- ✅ Unix composability principles
- ✅ Existing MQTT integration patterns
- ✅ Power user customization abilities

This approach turns a "Linux limitation" into a "Linux strength" by empowering users to integrate Teams with their desktop environment in their own way.
