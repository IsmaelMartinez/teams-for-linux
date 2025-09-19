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
Implements custom keyboard shortcuts and global key bindings.

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