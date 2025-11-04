# Debug Window Module

This module provides a generic `DebugWindow` class for displaying Chromium internal debug pages (`chrome://` URLs) in separate windows within Teams for Linux.

## Architecture

The module uses a base `DebugWindow` class that can be extended for specific debug pages. This provides a consistent interface while allowing easy addition of new debug windows in the future.

### Current Implementation

- **`DebugWindow`** - Generic base class for any chrome:// URL
- **`GpuInfoWindow`** - Convenience class for `chrome://gpu` (currently exposed in Debug menu)

## Usage

### Using the GpuInfoWindow

The `GpuInfoWindow` is already integrated into the application menu:

**Menu Path:** Teams for Linux → Debug → Open GPU Info

### Creating New Debug Windows

To add a new debug window, extend the `DebugWindow` class:

```javascript
const { DebugWindow } = require('../gpuInfoWindow');

class VersionWindow extends DebugWindow {
  constructor() {
    super({
      url: 'chrome://version',
      title: 'Version Information',
      width: 800,
      height: 600,
    });
  }
}

module.exports = VersionWindow;
```

Or use `DebugWindow` directly:

```javascript
const DebugWindow = require('../gpuInfoWindow/index.js');

const versionWindow = new DebugWindow({
  url: 'chrome://version',
  title: 'Version Information'
});
versionWindow.show();
```

## Features

- **Singleton Pattern**: Multiple calls to `show()` reuse the same window
- **State Management**: Handles minimized/hidden states properly
- **Memory Management**: Automatic cleanup on window close
- **Security**: Sandboxed with context isolation and no Node integration
- **Private Fields**: Uses JavaScript `#field` syntax for encapsulation

## Chromium Debug URLs

### Currently Implemented

| URL | Description | Menu Location |
|-----|-------------|---------------|
| `chrome://gpu` | GPU and graphics acceleration information | Debug → Open GPU Info |

### Potential Debug URLs for Future Implementation

The following Chromium internal pages could be useful for debugging Teams for Linux:

#### High Priority (Most Useful for Teams)

| URL | Description | Use Case |
|-----|-------------|----------|
| `chrome://webrtc-internals` | WebRTC session statistics and diagnostics | Debug video/audio call issues ⚠️ |
| `chrome://media-internals` | Media playback debugging information | Debug audio/video playback problems |
| `chrome://net-internals` | Network activity and DNS resolution | Debug connection issues |
| `chrome://version` | Chrome/Electron version information | Quick version check |

⚠️ **Note**: `chrome://webrtc-internals` has known compatibility issues with Electron since Chromium 80. It may not work reliably. Consider using the WebRTC `getStats()` API directly instead.

#### Medium Priority (General Debugging)

| URL | Description | Use Case |
|-----|-------------|----------|
| `chrome://process-internals` | Information about running processes | Monitor renderer/helper processes |
| `chrome://histograms` | Internal performance metrics | Performance analysis |
| `chrome://tracing` | Performance tracing tool | Diagnose rendering delays |
| `chrome://crashes` | Crash reports (if enabled) | Debug crash issues |

#### Lower Priority (Advanced/Specific Use)

| URL | Description | Use Case |
|-----|-------------|----------|
| `chrome://system` | System information and logs (Linux) | System-level diagnostics |
| `chrome://discards` | Tab discard information | Memory management debugging |
| `chrome://extensions` | Extension information | Debug Electron extensions |
| `chrome://flags` | Experimental features | Enable/test features |

### Discovering All Available URLs

Users can view all available `chrome://` URLs by visiting:
- `chrome://about`
- `chrome://chrome-urls`
- `about:about`

## Compatibility Notes

### Electron Limitations

Not all `chrome://` URLs work in Electron. Some limitations include:

1. **chrome://webrtc-internals**: Known to have issues since Electron v8.0.0-beta.3 (Chromium 80)
2. **chrome://inspect**: Remote debugging works differently in Electron
3. Some URLs may require specific Electron flags or permissions

### Testing New URLs

Before adding a new debug URL to the menu:

1. Test in development: `npm start`
2. Load the URL in a DebugWindow instance
3. Verify it displays correctly and doesn't cause errors
4. Document any special requirements or limitations

## Security Considerations

All debug windows are created with secure defaults:

- `nodeIntegration: false` - No Node.js access in renderer
- `contextIsolation: true` - Isolated JavaScript contexts
- `sandbox: true` - Renderer process sandboxing enabled
- `webSecurity: true` - Web security enabled
- `autoHideMenuBar: true` - Clean interface

These settings prevent the debug pages from accessing the main application's Node.js APIs or sensitive data.

## Future Enhancements

Possible improvements to consider:

1. **Debug Menu Submenu**: Group multiple debug windows under a submenu
2. **Window Management**: Track all open debug windows and close them on app quit
3. **Conditional URLs**: Only show URLs that work in the current Electron/Chromium version
4. **Copy/Export**: Add buttons to copy or export debug information
5. **Refresh Button**: Add ability to reload debug page without closing window
6. **Custom Debug Pages**: Create custom HTML pages that aggregate multiple debug sources

## Related Files

- `app/menus/appMenu.js` - Menu definition including debug submenu
- `app/menus/index.js` - Menu class that instantiates GpuInfoWindow
- `app/documentationWindow/index.js` - Similar pattern for documentation window

## References

- [Electron Application Debugging](https://www.electronjs.org/docs/latest/tutorial/application-debugging)
- [Chrome Internal Pages List](https://peter.sh/experiments/chromium-command-line-switches/)
- [WebRTC Debugging in Electron](https://github.com/electron/electron/issues/22375)
