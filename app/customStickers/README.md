# Custom Stickers

Lets you keep a folder of image files (PNGs / JPEGs / GIFs) on disk and send any of them into the current Teams chat with one click, without going through Teams's attach-file dialog every time.

When enabled, a small floating button appears on the Teams window. Clicking it opens a panel listing every image in the configured folder. Clicking a sticker focuses the chat compose box and inserts the image as if you had pasted it from the system clipboard — press Enter (or Teams's send button) to send.

## Configuration

```jsonc
{
  "customStickers": {
    "enabled": false,
    "folder": "",
    "formats": ["png", "jpg", "jpeg", "gif"]
  }
}
```

- **`enabled`** (boolean, default `false`) — master flag. Off by default.
- **`folder`** (string, default `""`) — absolute path to the sticker folder. Empty string uses `<userData>/stickers/`, which is created on first run if missing.
- **`formats`** (array, default `["png", "jpg", "jpeg", "gif"]`) — file extensions the scanner accepts (lowercase, no leading dot).

## How it works

The main process scans the configured folder when the renderer asks for the sticker list. The folder is re-scanned on every panel open — drop files in and they appear next time you open the panel.

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
