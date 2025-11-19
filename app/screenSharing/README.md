# Screen Sharing Module

Provides native screen/window selection and preview window management for Teams screen sharing.

## Components

- **service.js** - ScreenSharingService class for IPC handlers and state management
- **index.js** - StreamSelector for source selection UI
- **browser.js** - Renderer process UI logic
- **preload.js** - Context bridge for IPC
- **injectedScreenSharing.js** - Client-side Teams DOM integration

## ScreenSharingService Class

Manages screen sharing IPC handlers and state.

**Dependencies:**
- `mainWindow` - Main application window module

**IPC Channels:**
- `desktop-capturer-get-sources` - Get available screens/windows
- `choose-desktop-media` - Show picker dialog
- `cancel-desktop-media` - Cancel selection
- `screen-sharing-started` - Session started event
- `screen-sharing-stopped` - Session stopped event
- `get-screen-sharing-status` - Check if sharing active
- `get-screen-share-stream` - Get active source ID
- `get-screen-share-screen` - Get screen dimensions
- `resize-preview-window` - Resize preview
- `stop-screen-sharing-from-thumbnail` - Stop from preview

**Usage:**
```javascript
const screenSharingService = new ScreenSharingService(mainWindow);
screenSharingService.initialize();
```

## StreamSelector Class

Shows native UI for screen/window selection.

```javascript
const streamSelector = new StreamSelector(parentWindow);
streamSelector.show((selectedSource) => {
  if (selectedSource) {
    console.log('Selected:', selectedSource.name);
  }
});
```

## Platform Notes

**Wayland:** Requires source IDs in `screen:x:y` or `window:x:y` format from desktopCapturer. MediaStream UUIDs will fail.

See [ADR 001](../../docs-site/docs/development/adr/001-use-desktopcapturer-source-id-format.md) for technical details.
