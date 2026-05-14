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
- `desktop-capturer-get-sources` - Get available screens/windows (returns `display_id` for screen sources)
- `get-screen-sharing-displays` - Get connected displays (`id`, `label`, `internal`, `bounds`, `scaleFactor`) for picker enrichment
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

Shows the in-app picker UI for screen/window selection. The picker is a
full-window `WebContentsView` overlay mounted as a child of the main Teams
window. The picker UI itself lives in `index.html` / `index.css` /
`browser.js`.

```javascript
const streamSelector = new StreamSelector(parentWindow);
streamSelector.show((selectedSource) => {
  if (selectedSource) {
    console.log('Selected:', selectedSource.name);
  }
});
```

## Picker UI design

The picker is a modal overlay over the main Teams window. Issue #2524.

- **Layout:** tabs (Screens / Windows), search filter, Quality dropdown, and Esc/Tab/Enter keyboard shortcuts. Screens render in a uniform 2-row grid; windows in a responsive grid.
- **Screen ordering:** internal display first, then by `bounds.y`, then `bounds.x`. Puts the user's primary display in the top-left where "main" is expected.
- **Display enrichment:** the picker joins each screen source's `display_id` with `screen.getAllDisplays()` so tiles show the platform-provided display label, the resolution, the scale factor, and a `MAIN` badge for internal displays. When `display_id` is empty (some Wayland portal setups), the picker falls back to the source's own `name` and skips the enrichment, so the picker still works.
- **Selection feedback:** selected tile lifts via `transform: scale(1.04)` with a violet glow in addition to the accent border.
- **Thumbnails:** requested at 640x360 (vs the legacy 320x180) so tiles are readable at picker size without further upscaling.

## Platform Notes

**Wayland:** Requires source IDs in `screen:x:y` or `window:x:y` format from desktopCapturer. MediaStream UUIDs will fail.

See [ADR 001](../../docs-site/docs/development/adr/001-use-desktopcapturer-source-id-format.md) for technical details.
