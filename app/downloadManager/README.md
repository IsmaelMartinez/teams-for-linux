# Download Manager Module

Surfaces Electron `DownloadItem` lifecycle as user-visible feedback. Without a
`session.on('will-download', …)` handler, Electron saves files to the default
download directory silently, with no progress indicator, no completion toast,
and no "show in folder" affordance — making downloads invisible to the user
(issue #2512).

## DownloadManager Class

Registers a `will-download` listener on the Teams browser session and shows a
system notification when each download finishes:

- **Completed:** notification "Download complete" with the filename. Clicking
  the notification opens the containing folder via `shell.showItemInFolder()`.
- **Cancelled / interrupted:** notification "Download did not finish" with the
  filename and reason, so users know the file was not saved.

Per-item progress UI (in-app downloads list, tray badge while active) is
intentionally out of scope. The aim is parity with the bare-minimum browser
behaviour; richer UI can be added later if requested.

**Dependencies:**
- `config` - Application configuration (only `config.download.notifyOnDownloadComplete` is read)

**Usage:**
```javascript
const DownloadManager = require("./downloadManager");
const downloadManager = new DownloadManager(config);
downloadManager.initialize(session.fromPartition(config.partition));
```

`initialize()` is idempotent — calling it twice on the same session is a
no-op, so it is safe to call from `app.on('ready')` after the partition has
been created by the main window.

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `download.notifyOnDownloadComplete` | `boolean` | `true` | Show a system notification when a download finishes |

Set `download.notifyOnDownloadComplete` to `false` in `~/.config/teams-for-linux/config.json`
to suppress the notification entirely.
