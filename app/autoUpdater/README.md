# Auto Updater Module

In-app auto-update for AppImage distributions using electron-updater.

## Overview

Only activates when the app is running as an AppImage (detected via `process.env.APPIMAGE`). On other packaging formats (snap, deb, rpm) or in dev mode, the module does nothing.

On startup, checks for updates silently. If an update is available, shows a dialog offering "Download & Restart" or "Later". A "Check for Updates" menu item allows manual checks, showing "You're up to date" when no update is found.

## API

**`initialize(mainWindow)`** — Call once after the main window is ready. Configures electron-updater, registers event handlers, and triggers a silent startup check.

**`checkForUpdates()`** — Triggers a manual update check. Shows a dialog whether an update is found or not.

## Dependencies

- `electron-updater` — Runtime dependency for update detection, download, and installation
- `electron` — `dialog` for user prompts, `app` for version info

## Usage

```javascript
const AutoUpdater = require('./autoUpdater');
AutoUpdater.initialize(mainWindow);
```

Menu integration (in `app/menus/index.js`):

```javascript
checkForUpdates() {
  const autoUpdater = require('../autoUpdater');
  autoUpdater.checkForUpdates();
}
```
