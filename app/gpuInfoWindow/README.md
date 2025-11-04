# GPU Info Window

Displays `chrome://gpu` information in a separate window for debugging graphics and hardware acceleration issues.

## Usage

**Menu:** Teams for Linux → Debug → Open GPU Info

## Implementation

Simple window wrapper following the same pattern as `DocumentationWindow`:
- Reuses existing window if already open
- Sandboxed and secure (no Node.js access)
- Auto-cleanup on close

## Other Useful Chrome URLs

If you want to add more debug windows, these Chrome internal pages might be useful:

### For Teams-Specific Debugging
- `chrome://webrtc-internals` - WebRTC call diagnostics (⚠️ may not work in Electron)
- `chrome://media-internals` - Audio/video playback debugging
- `chrome://net-internals` - Network and DNS debugging

### General Debugging
- `chrome://version` - Version information
- `chrome://process-internals` - Process monitoring
- `chrome://tracing` - Performance profiling
- `chrome://crashes` - Crash reports

**Note:** Not all chrome:// URLs work in Electron. Test before adding to menu.

## Adding New Debug Windows

Follow the same pattern as this module:

1. Create similar class with different URL
2. Add to `app/menus/index.js` constructor
3. Add menu item in `app/menus/appMenu.js`
4. Add method in `app/menus/index.js`
