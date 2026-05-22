# Custom Stickers

Lets you keep a folder of image files (PNGs / JPEGs / GIFs / WebPs) on disk and send any of them into the current Teams chat with one click, without going through Teams's attach-file dialog every time.

When enabled, a small floating button appears on the Teams window. Clicking it opens a panel listing every image in the configured folder. Clicking a sticker focuses the chat compose box and inserts the image as if you had pasted it from the system clipboard — press Enter (or Teams's send button) to send.

## Configuration

```jsonc
{
  "customStickers": {
    "enabled": false,
    "folder": "",
    "formats": ["png", "jpg", "jpeg", "gif", "webp"],
    "urlImport": {
      "enabled": true,
      "allowedContentTypes": ["image/png", "image/jpeg", "image/gif", "image/webp"],
      "maxBytes": 5242880
    }
  }
}
```

- **`enabled`** (boolean, default `false`) — master flag. Off by default.
- **`folder`** (string, default `""`) — absolute path to the sticker folder. Empty string uses `<userData>/stickers/`, which is created on first run if missing.
- **`formats`** (array, default `["png", "jpg", "jpeg", "gif", "webp"]`) — file extensions the scanner accepts (lowercase, no leading dot).
- **`urlImport.enabled`** (boolean, default `true`) — allow importing stickers from HTTPS URLs via the panel header input or by dropping a URL on the panel.
- **`urlImport.allowedContentTypes`** (array) — response content-types the wrapper will accept and save.
- **`urlImport.maxBytes`** (number, default 5 MiB) — per-file size cap. Responses larger than this are rejected.

## How it works

The main process scans the configured folder when the renderer asks for the sticker list. The folder is re-scanned on every panel open, drop files in and they appear next time you open the panel.

The scanner also recurses one level into subdirectories so stickers organised under `<folder>/<group>/` are visible alongside top-level ones. Deeper trees are intentionally not scanned. Each sticker entry carries its subfolder name (empty string for top-level) so future UI affordances like pack-tab navigation can group stickers without changing the data shape.

## Importing from a URL

When `urlImport.enabled` is true (the default), the sticker panel header shows a text input. Paste an HTTPS URL pointing at a PNG/JPEG/GIF/WebP and press Enter (or click Import). You can also drag a URL from a browser tab directly onto the panel; the wrapper extracts it from the drop's `text/uri-list` payload. The fetched file is validated against `urlImport.allowedContentTypes` and `urlImport.maxBytes`, then saved at the top level of the sticker folder as `<slug>-<sha8>.<ext>` so re-importing the same URL is idempotent. The fetch is bounded by a 30-second timeout so a slow server cannot hang the IPC.

## Removing stickers

Hover over any sticker in the panel and a small × button appears in the top-right corner. Clicking it asks for confirmation, then deletes the file from disk. Path-traversal is rejected at the IPC boundary: the requested name and subfolder must contain no slashes, no null bytes, and no `..` segments, and the resolved file path must remain strictly inside the sticker folder. Deleted stickers leave no trace; if you want to keep something around, do not click the ×.

## Theme

The panel and the floating button follow the operating-system dark/light preference via `prefers-color-scheme`. The Teams brand purple stays put as the accent in both themes. There is no manual theme override, which keeps the wrapper aligned with the OS preference and avoids reading Teams's own theme state (which can change without notice).

When the feature is enabled and the default folder did not previously exist, a single bundled example sticker (the wrapper's icon) is copied into it on first run so the panel has something to show. Delete it and replace with your own.

Stickers are sent into Teams by dispatching a synthetic `ClipboardEvent('paste')` at the focused compose box. Teams's editor (CKEditor 5) handles the event the same way it handles a real paste. This was validated end-to-end during the feasibility spike — see [`spike/2476-stickers/`](../../spike/2476-stickers/) at the repo root for the research and design notes.

## What's out of scope

The MVP keeps the surface small. The following were considered and intentionally deferred:

- Drag/drop to add stickers via the UI (use the file manager instead).
- Tagging, categorization, search box.
- Recently-used or favorites section.
- Animated-GIF preview controls, sticker resizing, cropping.
- Multi-folder support, subfolder-as-category navigation.
- Live folder watching — folder is scanned each time the panel opens, not on `fs.watch`.

These are all additive without touching the paste path; happy to open follow-up issues if anyone asks for them.
