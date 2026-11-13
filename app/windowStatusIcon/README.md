# Window Status Icon Module

Shows the user's Teams presence status on the main window icon, which is what the taskbar or panel entry shows on Linux and Windows. Opt-in with `window.showStatus`. macOS ignores the option, because it shows the Dock instead (`media.showStatusOnDockIcon`).

Main has no canvas, so the renderer draws the icon (`app/browser/tools/windowIconRenderer.js`) and this module only applies it.

## WindowStatusIcon Class

**Dependencies** (injected, so the class has no Electron imports of its own):

- `ipcMain`, `nativeImage`
- `getWindow()`: the main window
- `getActiveWebContents()`: the page the user is looking at (the main window's page, or the active profile view with multi-account on)
- `getPlainIcon()`: the window icon without a dot, resolved on each call so an App Icon change is followed

**IPC Channels:**

- `window-icon-update` (event): a PNG data URL to show, or `null` for the plain icon. Any other payload, or an image that decodes empty, also restores the plain icon. Only the active page's update is applied. Each page sends `null` once when it loads, so a reload or the sign-in page clears the previous dot. Every page's last icon is kept, so `refresh()` can show the new profile's status straight away after a profile switch.

**Usage:**

```javascript
const windowStatusIcon = new WindowStatusIcon({
  ipcMain,
  nativeImage,
  getWindow: () => mainAppWindow.getWindow(),
  getActiveWebContents: getControlWebContents,
  getPlainIcon: () => TrayIconChooser.windowImage(new TrayIconChooser(config).getFile()),
});
windowStatusIcon.initialize();
profilesManager.on("switch", () => windowStatusIcon.refresh());
```

**Configuration:**

- `window.showStatus`: turns the overlay on (default `false`). The dot goes bottom-right, matching the tray overlay.

**Known limitation:** the App Icon menu sends its `config-changed` delta only to the main window's page. With multi-account on and a profile view active, that view never learns the new icon. The window shows the plain new icon until the profile's next status change, and from then until a restart the dot is drawn on the old icon. The tray overlay has the same limitation in profile views.

Some docks show the icon of the matching desktop entry instead of the window icon (KDE Plasma does when the entry has an `Icon=` line), and then the dot does not show. On native Wayland the desktop must support `xdg-toplevel-icon` (KDE Plasma 6 does, 5.27 does not; run under XWayland there).
