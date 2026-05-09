# Download Manager Module

Surfaces Electron `DownloadItem` lifecycle as user-visible feedback. Without a
`session.on('will-download', …)` handler, Electron saves files to the default
download directory silently, with no progress indicator, no completion toast,
and no "show in folder" affordance — making downloads invisible to the user
(issue #2512).

## DownloadManager Class

Registers a `will-download` listener on the Teams browser session and surfaces
each download as both a taskbar progress bar and system notifications:

- **In flight:** drives `BrowserWindow.setProgressBar()` from
  `DownloadItem.getReceivedBytes() / getTotalBytes()`, aggregated across
  concurrent downloads. When the server doesn't advertise a content length
  the progress bar switches to indeterminate mode so the user still sees
  motion on the taskbar. As a portable fallback (Electron's
  `setProgressBar` is a no-op on Linux distros without `libunity`, which is
  most of them — Debian, Fedora, Arch, KDE/GNOME by default), the window
  title is also prefixed with `[34%]` (or `[downloading]` for unknown-size
  downloads) so every WM/DE shows the progress in its taskbar tooltip.
- **Completed:** notification "Download complete" with the filename. Clicking
  the notification opens the containing folder via `shell.showItemInFolder()`.
- **Cancelled / interrupted:** notification "Download did not finish" with
  the filename and reason, so users know the file was not saved.

Per-item UI (in-app downloads list, tray badge while active) is intentionally
out of scope. The aim is parity with the bare-minimum browser behaviour;
richer UI can be added later if requested.

**Dependencies:**
- `config` - Application configuration (`config.download.*` keys are read)
- `mainAppWindow` - Main window module exposing `getWindow()` for taskbar progress updates

**Usage:**
```javascript
const DownloadManager = require("./downloadManager");
const downloadManager = new DownloadManager(config, mainAppWindow);
downloadManager.initialize(session.fromPartition(config.partition));
```

`initialize()` is idempotent — calling it twice on the same session is a
no-op, so it is safe to call from `app.on('ready')` after the partition has
been created by the main window.

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `download.enabled` | `boolean` | `false` | Master switch for the entire feature. While download UX is in early development this is opt-in; set `true` to turn the manager on. The sub-flags only take effect once this is `true`. |
| `download.notifyOnDownloadComplete` | `boolean` | `true` | Show a system notification when a download finishes |
| `download.showProgressBar` | `boolean` | `true` | Drive the taskbar progress bar from active download progress |

Add this to `~/.config/teams-for-linux/config.json` to turn the feature on:

```json
{
  "download": {
    "enabled": true
  }
}
```

With `enabled: true`, set either sub-flag to `false` to opt out of that piece
of feedback (notification or progress bar). The global `disableNotifications`
flag also suppresses the completion / failure toasts (but does not affect the
progress bar).
