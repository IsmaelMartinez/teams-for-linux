# Browser Tools

Client-side scripts that are injected into the Microsoft Teams web interface to provide enhanced functionality and integrate with the desktop environment.

## Overview

These tools operate in the renderer process and interact directly with the Teams web application DOM and APIs. They are loaded via the preload script and initialized based on configuration settings.

## Available Tools

### Core Functionality

#### [activityHub.js](activityHub.js)
Monitors Teams activity and user presence for system integration.

#### [mutationTitle.js](mutationTitle.js)  
Uses MutationObserver to track title changes for unread message counting and tray icon updates.

#### [reactHandler.js](reactHandler.js)
Handles React application detection, version detection, and provides safe access to Teams internal React structures.

#### [settings.js](settings.js)
Manages application settings and configuration synchronization between main and renderer processes.

### Media & Communication

#### [disableAutogain.js](disableAutogain.js)
Disables microphone auto-gain control by intercepting `getUserMedia` calls and modifying audio constraints. Supports both modern (`autoGainControl`) and legacy (`googAutoGainControl`) MediaStream APIs.

**Configuration**: `disableAutogain: true`
**Use Case**: Professional audio setups, external mixers, manual gain control preference

#### [wakeLock.js](wakeLock.js)
Prevents system sleep during meetings and active calls.

### UI & Display

#### [theme.js](theme.js)
Manages application theming, including system theme synchronization and custom CSS injection.

#### [timestampCopyOverride.js](timestampCopyOverride.js)
Enhances timestamp copying functionality in Teams messages.

#### [trayIconChooser.js](trayIconChooser.js) & [trayIconRenderer.js](trayIconRenderer.js)
Handle tray icon selection, rendering, and badge count display based on Teams activity.

#### [zoom.js](zoom.js)
Manages zoom level controls and persistence across sessions.

### System Integration

#### [emulatePlatform.js](emulatePlatform.js)
Modifies platform detection to improve Teams web compatibility on Linux.

#### [shortcuts.js](shortcuts.js)
Implements custom keyboard shortcuts for in-app actions like zoom control and navigation.

#### Global Shortcuts System (Main Process)
System-wide keyboard shortcuts that work even when Teams is not focused. When triggered, the keyboard event is forwarded to Teams, which handles it with its built-in shortcuts. Configured via the `globalShortcuts` array in `config.json`.

**Disabled by default** - opt-in by adding shortcuts to your config.

**How it works**: The main process registers global shortcuts and forwards keyboard events to Teams' window, allowing Teams' native shortcuts to work system-wide without needing to find buttons in the DOM.

**Common Teams Shortcuts**:
- `Ctrl+Shift+M` - Toggle mute/unmute
- `Ctrl+Shift+O` - Toggle video on/off
- `Ctrl+Shift+K` - Raise/lower hand
- `Ctrl+Shift+B` - Toggle background blur
- `Ctrl+Shift+E` - Start/stop screen sharing
- `Ctrl+Shift+D` - Toggle chat
- `Ctrl+Shift+C` - Toggle calendar
- `Ctrl+Shift+/` - Show keyboard shortcuts

**Configuration Example** (add to config.json to enable):
```json
{
  "shortcuts": {
    "enableGlobalShortcuts": [
      "Control+Shift+M",
      "Control+Shift+O"
    ]
  }
}
```

**Optional Prefix Modifier**: Add a prefix to avoid conflicts with other applications:
```json
{
  "shortcuts": {
    "enabledShortcutPrefix": "Super",
    "enableGlobalShortcuts": [
      "Control+Shift+M",
      "Control+Shift+O"
    ]
  }
}
```
This registers `Super+Control+Shift+M` and `Super+Control+Shift+O` system-wide. **Warning**: If the prefix is already in your shortcut, it will be duplicated and won't work.

**Legacy Format** (deprecated): The old `globalShortcuts` property is still supported but will be removed in a future version.

**Important Notes**:
- 🔑 **Use `Control` not `CommandOrControl`**: Teams uses Ctrl on all platforms, including macOS
- ⚠️ **QWERTY keyboard layout only**: Shortcuts are based on physical QWERTY key positions
- ⚠️ **macOS**: Non-QWERTY layouts (Dvorak, AZERTY, Colemak, etc.) are **not supported** due to [Electron bug #19747](https://github.com/electron/electron/issues/19747)
- On Linux/Windows: Works better but may have issues with layout changes during runtime

Set to empty array `[]` or omit from config to disable. See [Electron Accelerators](https://www.electronjs.org/docs/latest/api/accelerator) for key combinations and [Microsoft Teams Keyboard Shortcuts](https://support.microsoft.com/en-us/office/keyboard-shortcuts-for-microsoft-teams-2e8e2a70-e8d8-4a19-949b-4c36dd5292d2) for available Teams shortcuts.

#### [tokenCache.js](tokenCache.js)
Provides authentication token caching and management for improved login persistence.

## Architecture Patterns

### Initialization
All tools follow a consistent initialization pattern:
```javascript
function init(config, ipcRenderer) {
  if (!config.featureEnabled) {
    console.debug("[TOOL_NAME] Feature disabled in configuration");
    return;
  }
  // Tool implementation
}

module.exports = { init };
```

### Configuration-Driven
Tools are conditionally loaded based on configuration settings passed from the main process.

### Logging Standards  
Tools use consistent logging patterns with tool-specific prefixes:
- `[DISABLE_AUTOGAIN]` for audio gain control
- `[TRAY_DIAG]` for tray diagnostics
- `[TOKEN_CACHE]` for authentication caching

### Error Handling
Tools implement defensive programming practices since the Teams DOM can change without notice:
- Try-catch blocks around DOM operations
- Graceful degradation when APIs are unavailable
- Feature detection before attempting operations

## Adding New Tools

When creating new browser tools:

1. **Follow naming conventions**: Use camelCase for file names
2. **Implement standard init pattern**: Accept `config` and optional `ipcRenderer` parameters
3. **Add configuration option**: Update `app/config/index.js` with new settings
4. **Register in preload**: Add to modules array in `app/browser/preload.js`
5. **Document thoroughly**: Add to this README and relevant docs
6. **Use consistent logging**: Follow `[TOOL_NAME]` prefix pattern
7. **Handle errors gracefully**: Teams DOM can change unexpectedly

## Security Considerations

- Tools operate in renderer context with access to Teams web content
- Sensitive operations should use IPC communication with main process
- Validate all DOM queries as Teams interface can change
- Follow principle of least privilege for DOM access