# Design: custom stickers (#2476) — MVP

**Status:** approved (user sign-off: 2026-05-20)
**Issue:** [#2476](https://github.com/IsmaelMartinez/teams-for-linux/issues/2476)
**Spike:** [SPIKE.md](./SPIKE.md) — Phase 1 succeeded; renderer-only synthetic-paste path is viable

## Goal

Let users keep a folder of image files (stickers/reactions/whatever) on disk and send any of them into the current Teams chat with one click, without going through Teams's attach-file dialog every time. The "send" action is a synthetic `ClipboardEvent('paste')` dispatched at the focused compose box — the path the spike already verified end-to-end (image appears, uploads, sends as a real attachment, delivers).

## Scope

In scope for MVP:

- A floating toggle button overlaid on Teams (visible only when the feature is enabled) that opens and closes a sticker panel.
- A panel that lists every supported image file from a configured folder.
- Click-to-send: focus compose, dispatch synthetic paste, image lands in compose. User confirms by pressing Enter or clicking Teams's send button.
- Zero-config happy path: feature enable flag flips the folder into `<userData>/stickers/`, which is auto-created on first run. User drops PNGs in and they appear.
- Optional folder override via config so power users can point at a synced folder (Dropbox, Syncthing, etc.).

Out of scope for MVP, deliberately:

- Drag-and-drop to add stickers from the UI. (User can use the file manager.)
- Tagging, categorization, search box.
- Recently-used / favorites section.
- Animated-GIF preview controls, sticker resizing or cropping.
- Multi-folder support, subfolder-as-category navigation.
- Live folder watching (`fs.watch`) — folder is scanned each time the panel opens.

The issue thread explicitly states the minimal shape is sufficient ("the proposed solution is sufficient. Even without any advanced sticker management..."). Anything optional from the issue body is a follow-up if asked for.

## Architecture

Three new modules plus four small touch-ups to existing files. Mirrors the `customBackground` module shape, which is the closest precedent in the codebase (off-by-default config flag, main-process module that registers an `ipcMain.handle` for a list endpoint, renderer-side consumer).

### `app/customStickers/index.js` — main process

A `CustomStickers` class. Constructor takes `(app, config)`. If `config.customStickers.enabled === false`, the class no-ops and registers nothing. If enabled:

- Resolves the sticker folder: `config.customStickers.folder` if non-empty, otherwise `path.join(app.getPath('userData'), 'stickers')`.
- Creates the folder if it does not exist (recursive mkdir, mode default).
- Registers `ipcMain.handle('get-sticker-list', this.handleGetStickerList)`. The handler reads the folder, filters by extension against `config.customStickers.formats`, and for each match reads the file and returns `{ name, path, mimeType, dataUrl }`. The `dataUrl` is a base64 `data:image/...;base64,...` string built from the file bytes — that's how thumbnails reach the renderer without exposing a `file://` URL or registering a custom protocol.

The `dataUrl` strategy (option 1 from brainstorming) is chosen explicitly. Trade-off: holds image bytes in memory during the IPC round-trip. Acceptable for tens-to-low-hundreds of stickers; the issue's use case is a personal collection, not a library of thousands. If anyone hits memory pressure later, the upgrade path is a `sticker://` custom protocol — but YAGNI for MVP.

### `app/customStickers/README.md`

Short module README following the project's per-module pattern. Documents the config keys, the default folder location, the supported formats, and a "drop image files into this folder; the panel re-scans on each open" note.

### `app/browser/tools/customStickers.js` — renderer

A `CustomStickers` class with `init(config, ipcRenderer)`. If `config.customStickers?.enabled !== true`, the class no-ops.

When enabled, on init:

- Creates the floating toggle button and mounts it at `document.body`. Position: bottom-right corner of the window, offset enough to not collide with Teams's own bottom-anchored floating elements (the audio status / speaking indicator already lives in this region). Z-index above Teams's regular chrome but below modal overlays; exact value chosen during implementation. No mount-point dependency on Teams's DOM.
- Wires the button's click handler to toggle a hidden panel `<div>`, also mounted at `document.body`. The panel opens anchored just above the button, sized for a grid of thumbnails (roughly 4–6 columns, fixed thumbnail size, scrollable vertically when the grid overflows).
- On first open (or every open — same code path), calls `ipcRenderer.invoke('get-sticker-list')`, renders the returned array as a grid of `<img>` elements with `src={dataUrl}`. Each `<img>` is wrapped in a click handler that calls the paste routine.
- The paste routine locates the compose element with the same selector cascade the spike harness used (`div[id^="new-message-"]` first, then the fallbacks). Focuses it, then dispatches a synthetic `ClipboardEvent('paste')` carrying a `File` built from the sticker's bytes. The bytes come from refetching the `dataUrl` via `fetch(dataUrl).then(r => r.blob())` — small ceremony, no extra IPC round-trip per click.
- All DOM the module creates carries IDs prefixed `tfl-sticker-` to make it grep-able and to avoid colliding with Teams's class/id namespace.

### Touch-ups to existing files

- `app/config/index.js` — add the `customStickers` config object (schema below).
- `app/security/ipcValidator.js` — allowlist `get-sticker-list`. (One channel for MVP.)
- `app/browser/preload.js` — add `{ name: 'customStickers', path: './tools/customStickers' }` to the `modules` array; add `'customStickers'` to the `modulesRequiringIpc` set since it needs `ipcRenderer.invoke`.
- `docs-site/docs/configuration.md` — document the new config keys.
- The IPC docs file `docs-site/docs/development/ipc-api-generated.md` regenerates via `npm run generate-ipc-docs`.

## Config schema

Object-nested under `customStickers`, mirroring how `media.microphone.speakingIndicator` and `cacheManagement` are shaped:

```
customStickers: {
  enabled: false,
  folder: "",
  formats: ["png", "jpg", "jpeg", "gif"]
}
```

`enabled` (boolean, default `false`) — the master flag. Off by default, matching the `isCustomBackgroundEnabled` precedent of opt-in defaults for features that touch user data and create folders. (The key shape itself is nested rather than flat, following the more recent `media.microphone.speakingIndicator` precedent.)

`folder` (string, default `""`) — absolute path to the sticker folder. Empty string means use `<userData>/stickers/`. The main module auto-creates the resolved path if missing.

`formats` (array of strings, default `["png", "jpg", "jpeg", "gif"]`) — file extensions (lowercase, no leading dot) that the scanner accepts. The defaults match the original issue text ("PNG, JPG, or GIF"). User can tighten to `["png"]` if they want, or extend; the scanner trusts the array.

The configuration page in `docs-site/docs/configuration.md` gets a new section documenting these three keys, including a callout that the sticker folder is auto-created.

## Data flow

End-to-end, when everything is enabled:

1. App startup. `app/index.js` (or wherever the module-registration happens — to be confirmed during implementation) instantiates `CustomStickers` with `(app, config)`. The class checks the flag, creates the folder if missing, registers the IPC handler.
2. Preload phase. `customStickers` browser tool initialises, mounts the floating button at `document.body`. Panel `<div>` is created hidden.
3. User clicks the floating button. Panel becomes visible. Renderer calls `ipcRenderer.invoke('get-sticker-list')`.
4. Main reads the folder, filters by extension, reads each file into a buffer, returns `[{ name, path, mimeType, dataUrl }]`.
5. Renderer renders the grid. Each thumbnail `<img>` uses the `dataUrl` directly.
6. User clicks a sticker. Renderer locates the compose box, focuses it, refetches the sticker bytes from the `dataUrl` into a `Blob`, wraps it in a `File`, builds a `DataTransfer`, dispatches `ClipboardEvent('paste')`. CKEditor consumes the event and inserts the image into compose.
7. User sends the message via Enter or Teams's send button. Teams's upload/send pipeline handles it the same way it would handle a real paste.

If the panel is open and the user clicks the toggle button again, the panel hides. State is panel-open or panel-closed; nothing else is preserved between toggles. Folder is re-scanned on each open.

## Error handling

The module logs through `console.*` per the project's `[CUSTOM_STICKERS]`-style prefix convention. No PII in any log: file paths are project-relative or anonymised, no chat/user identifiers ever leak in.

- Folder missing on init: created. If creation fails (permissions): error logged with the resolved path, IPC handler still registered but returns `[]`.
- IPC handler called, folder missing or unreadable: warn-logged, empty array returned.
- File listed but read fails mid-scan: that single file is skipped, warn-logged, other stickers still returned.
- File extension matches but bytes are not actually image data: included; the renderer's `<img>` will fail to render and show a broken-image icon. Acceptable for MVP; the user can remove the file. (Validating image headers is a small enhancement but adds dependencies; skipped.)
- Renderer cannot find the compose element on click: warn-logged, panel shows a transient inline message "Click into a chat compose box first" for 2-3 seconds, then clears. No toast notification (avoids depending on the notification system for this MVP edge case).
- Synthetic-paste dispatch fails or `event.defaultPrevented === false` and no image inserted: warn-logged. UX is the same — user notices nothing happened, re-focuses compose, retries.

## Testing

Manual is the load-bearing test path for MVP. The spike's existing pasteable harness is unchanged; this design's renderer code reuses the same compose-discovery selectors and the same synthetic-paste construction, so the harness remains a useful debugging tool if anything regresses.

E2E: Teams login is gated behind real auth, so a full happy-path Playwright test is out of scope. The existing e2e suite (validates clean-state launch and Microsoft login redirect) continues to pass — verified before merge. Adding a smoke test that asserts the floating button mounts when `customStickers.enabled === true` is feasible from the renderer's own DOM without needing Teams login, and would catch regressions in preload registration; pencilled in as a stretch goal during implementation.

Lint (`npm run lint`) passes. IPC docs regenerated via `npm run generate-ipc-docs`. Module README written.

## Out of scope and follow-ups

The optional features from issue #2476 (drag/drop, categories, recently-used, search) are deliberately excluded from MVP per the requester's confirmation. They are well-defined future enhancements that can be opened as separate issues if anyone asks for them. Because the architecture is renderer-only and folder-scan-based, all of them are additive without touching the paste path:

- Drag/drop: add a drop-zone overlay on the panel, write incoming files to the configured folder, re-scan.
- Categories: change the scanner to recurse one level, use subfolder names as tabs.
- Recently-used: persist a small JSON file in `userData` keyed by sticker filename, prepend to the panel grid.
- Search: client-side filter on filename, no extra IPC.

The roadmap (`docs-site/docs/development/plan/roadmap.md`) is updated when this PR lands, moving the entry out of "Requires Validation First" and into the appropriate post-ship section.

## Decisions deferred to implementation

The implementation plan (next step, via the `writing-plans` skill) needs to settle:

- Exact registration site for `CustomStickers` in `app/index.js` or wherever the existing `customBackground` module is instantiated, ensuring it sits alongside that pattern.
- Final inline CSS for the floating button and panel — including a sensible bottom-right offset that does not collide with Teams's own floating elements (toast notifications, call popups).
- Whether to inline the floating-button SVG icon or load it from `app/assets/`.

These are implementation-level concerns, not design-level. Recording here so they are not lost.
