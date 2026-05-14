# Download Manager Module

Surfaces Electron `DownloadItem` lifecycle as user-visible feedback. Without a
`session.on('will-download', …)` handler, Electron saves files to the default
download directory silently, with no progress indicator, no completion toast,
and no "show in folder" affordance — making downloads invisible to the user
(issue #2512).

## DownloadManager Class

Registers a `will-download` listener on the Teams browser session and surfaces
each download through three independent feedback channels:

- **Taskbar progress bar:** drives `BrowserWindow.setProgressBar()` from
  `DownloadItem.getReceivedBytes() / getTotalBytes()`, aggregated across
  concurrent downloads. Indeterminate mode kicks in when the server doesn't
  advertise a content length. Note: on most modern Linux setups
  `setProgressBar` is a silent no-op because Electron gates it on the Unity
  launcher protocol owning `com.canonical.Unity` (no DE has done that since
  Unity was discontinued in 2017). It still works on macOS / Windows.
- **KDE Plasma notification widget (per-download JobView):** uses the
  `org.kde.JobViewServer` D-Bus service — the same protocol Firefox /
  Dolphin / KIO use — so every download shows up as a row in Plasma's
  notification widget with filename, percent, and bytes processed.
  Degrades to no-op on systems without that service (non-KDE setups).
- **Window-title fallback:** prefixes the main window title with `[34%]`
  (or `[downloading]` for unknown-size downloads) while a download is in
  flight. Every WM/DE renders the window title in its taskbar tooltip /
  Alt-Tab list, so this works even when the taskbar progress bar and the
  JobView protocol are both unavailable.
- **Completed:** notification "Download complete" with the filename. Clicking
  the notification opens the containing folder via `shell.showItemInFolder()`.
- **Cancelled / interrupted:** notification "Download did not finish" with
  the filename and reason, so users know the file was not saved.

Per-item UI beyond the above (in-app downloads list, tray badge while active)
is intentionally out of scope.

**Dependencies:**
- `config` - Application configuration (`config.download.*` keys are read)
- `mainAppWindow` - Main window module exposing `getWindow()` for taskbar progress updates and window-title prefix
- `jobViewEmitter` (Linux only) - Optional sibling module talking to `org.kde.JobViewServer`

**Usage:**
```javascript
const DownloadManager = require("./downloadManager");
const jobEmitter = require("./downloadManager/jobViewEmitter"); // Linux only
const downloadManager = new DownloadManager(config, mainAppWindow, jobEmitter);
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
| `download.showProgressBar` | `boolean` | `true` | Drive the taskbar progress bar, KDE JobView and Unity LauncherEntry while downloads are in flight |
| `download.showTitlePrefix` | `boolean` | `true` | Also prefix the window title with `[N%]` (or `[downloading]`). Set to `false` on KDE / Ubuntu where the JobView / LauncherEntry already shows progress and the title churn is redundant. |

Add this to `~/.config/teams-for-linux/config.json` to turn the feature on:

```json
{
  "download": {
    "enabled": true
  }
}
```

With `enabled: true`, set any sub-flag to `false` to opt out of that piece of
feedback (notification, progress bar, title prefix). The global
`disableNotifications` flag also suppresses the completion / failure toasts
(but does not affect the progress bar or title prefix).
