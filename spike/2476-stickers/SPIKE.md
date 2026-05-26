# Spike: custom stickers (#2476) — feasibility

**Status:** concluded — Phase 1 succeeded, proceeding with renderer-only implementation
**Issue:** [#2476](https://github.com/IsmaelMartinez/teams-for-linux/issues/2476)
**Pattern:** 4 (floating UI outside Teams DOM + synthetic event into Teams)

## What we are trying to verify

The headline question: **can we paste an image into Teams's chat compose box programmatically from the wrapper, such that Teams treats it as a normal chat attachment (uploads it, shows the thumbnail, sends it on Enter)?**

If yes, the rest of the feature (floating panel, folder watch, config option) is mechanical and follows existing wrapper patterns (`customBackground`, `customCSS`). If no, the feature either needs a fundamentally different approach (e.g., DOM injection — pattern 5, fragile) or routes to "Not Planned / Not Feasible".

## Findings from the research phase

### Synthetic ClipboardEvent has a known spec limitation

Per MDN's [paste_event](https://developer.mozilla.org/en-US/docs/Web/API/Element/paste_event) page: dispatching a synthetic paste event will not trigger the browser's default paste action. The page's listener still receives the event and can still read `event.clipboardData`, but no inline insertion happens unless the listener does it itself. Whether Teams's compose listener does its own insertion or relies on the browser default is the open question; if it relies on the browser default, synthetic paste will silently no-op.

Compounding this: `event.isTrusted` is `false` on synthetic events, and some apps explicitly reject untrusted paste. No direct evidence on whether Teams checks this.

### Teams compose is a model-owning rich editor, not plain contenteditable

The only recent reverse-engineering signal I found is a [2023-02-22 Microsoft Q&A thread](https://learn.microsoft.com/en-us/answers/questions/1183250/why-does-my-teams-userscript-have-no-effect) where a userscript author confirmed Teams overwrites their direct DOM mutations. This is consistent with a ProseMirror / Slate / Lexical-style editor that reconciles the DOM against its own model. Direct `Selection.insertNode` and `document.execCommand("insertImage", ...)` are unlikely to produce a sendable attachment (the editor will revert the mutation or, at best, leave an orphan `<img>` that the send pipeline ignores).

### Zero public prior art for synthetic-paste-into-Teams

Searched GitHub for projects pasting images into Teams via synthetic events. Found only server-side Bot Framework / Messaging Extension projects ([OfficeDev/microsoft-teams-apps-stickers](https://github.com/OfficeDev/microsoft-teams-apps-stickers), [NewFuture/custom-stickers-teams-extension](https://github.com/NewFuture/custom-stickers-teams-extension)). Both go through Microsoft's official compose-extension surface, which we cannot use from an Electron wrapper. Generic file-input-paste extensions exist but target `<input type=file>`, not contenteditable. The absence of prior art is a yellow flag.

### The spec-aligned fallback

Electron `clipboard.writeImage(nativeImage)` followed by `webContents.sendInputEvent({ type: 'keyDown', keyCode: 'V', modifiers: ['control'] })` (and matching `keyUp`) dispatches a real OS-level keystroke. `isTrusted` is `true`, Chromium runs the real paste pipeline, Teams sees a normal user paste. High confidence this works mechanically; the downside is the user's system clipboard gets clobbered each click. Mitigation: save/restore the prior clipboard contents around the operation.

[electron/electron#5523](https://github.com/electron/electron/issues/5523) (open since 2016) is about the menu-role 'paste' not forwarding image data. Using `sendInputEvent` for a real Ctrl+V keystroke sidesteps that issue, but worth knowing.

## Spike plan

### Phase 0: DevTools inspection (30 minutes, no code)

Before writing anything, open the running app, focus the compose box in a 1:1 chat, and inspect.

1. Open DevTools (Cmd/Ctrl+Shift+I).
2. In Elements, locate the compose element. Look for `<div id="new-message-...">` or similar. Note the actual id pattern, role, contenteditable attribute, and any data-* attributes.
3. Open Event Listeners panel for the compose element. List all `paste` listeners and their source files. If the source is bundled and minified, that's expected — but the listener count and whether any are passive matters.
4. With the compose focused, paste a real image (Cmd/Ctrl+V from system clipboard with an image on it) and watch the listener fire in the Sources panel debugger. Note whether the listener calls `event.preventDefault()` (signal that Teams ingests `clipboardData.files` itself, which is encouraging) or lets the default fire (signal that synthetic paste will no-op).
5. Note any `dragover` / `drop` listeners on the same element. The drop-to-attach path is an alternative ingestion route worth knowing about.

**Output:** append findings to this file under "Phase 0 results" below.

### Phase 1: synthetic ClipboardEvent (cheap, time-boxed 2-4 hours)

Try the cheap path first. The pasteable harness in `devtools-paste-test.js` does this entirely from the renderer; no main-process changes needed for the test.

1. Load `devtools-paste-test.js` into the DevTools Console of the running app.
2. Click the "Phase 1: synthetic paste" button in the floating overlay.
3. Watch the console for the result. The harness logs whether the listener fired (and what `event.defaultPrevented` reads after), and whether an image element actually landed in the compose surface 250ms later.
4. If an image lands and is sendable, this is the path. Skip Phase 2.

### Phase 2: clipboard.writeImage + synthetic paste-keystroke (if Phase 1 fails)

Falls back to the spec-aligned path. Requires main-process IPC because `clipboard.writeImage` and `sendInputEvent` are main-process APIs.

1. Add an IPC handler `paste-image-as-keystroke` that takes a PNG path (or buffer) and:
   - Snapshots the existing clipboard contents across all relevant formats — not just `clipboard.readImage()`. The minimum format set to preserve is text, HTML, RTF, bookmark, and image (use `clipboard.readText`, `readHTML`, `readRTF`, `readBookmark`, `readImage`, plus `clipboard.readBuffer(format)` for any custom MIME types the user might have). `readImage()`-then-`writeImage()` alone would silently destroy text or file clipboards, which is unacceptable for a feature the user invokes mid-conversation.
   - Calls `clipboard.writeImage(nativeImage)` with the sticker.
   - Dispatches a synthetic paste keystroke at the focused webContents via `sendInputEvent`. The modifier is **platform-aware**: `meta` on macOS, `control` on Linux and Windows (`process.platform === 'darwin' ? 'meta' : 'control'`). Hardcoding `control` would no-op on macOS where the wrapper also ships.
   - Restores the snapshotted clipboard contents after a short delay (~200ms is the rough lower bound for Teams's paste pipeline to have read; tune empirically).
2. The harness's "Phase 2: keystroke paste" button calls this IPC and waits for confirmation.
3. Verify the image lands in compose and survives the send.
4. Verify the system clipboard is restored to its prior contents — test all four states: text-only, HTML-formatted text, image-only, and file-path (Linux) / file-list (macOS/Windows). Any format that round-trips for a real user copy must round-trip here.

### Phase 3: decision

- **If Phase 1 works:** proceed with renderer-only implementation. Floating panel + folder list + synthetic paste. No new IPC channels beyond folder listing.
- **If Phase 2 works:** proceed with main-process-driven implementation. Floating panel triggers IPC, main writes to clipboard, dispatches keystroke, restores clipboard. Document the clipboard-clobber tradeoff in the config option's description.
- **If neither works:** report findings on #2476, route to "Not Planned / Not Feasible" with the supported alternative being Microsoft's official compose-extension surface (which requires an app registration, server, and is out of scope for the wrapper).

## Phase 0 results

Run via the harness's "Phase 0: inspect compose" button (a 1:1 chat with compose focused).

```
Compose element:
- selector:         div[id^="new-message-"]
- contenteditable:  true
- id pattern:       new-message-{uuid}  (e.g. new-message-b2a41cb8-8f7c-472b-b01e-2c9ca1b24f03)
- role:             textbox
- aria-label:       Type a message
- data-* attributes:
    - data-tid=ckeditor
    - data-is-focusable=true
    - data-shortcut-context=compose-field
    - data-tabster={"focusable":{"isDefault":true}, "observed":{"names":["chat-input"]}}

Editor framework signals:
- hasProseMirror:  false
- hasSlate:        false
- hasLexical:      false
- hasCkEditor:     true   ← Teams compose is CKEditor 5, not ProseMirror/Slate/Lexical

Paste listeners:
- count: unknown (Event Listeners panel not enumerable from JS; would need DevTools
  Elements > Event Listeners panel for the count)
- preventDefault on real paste: inferred YES (see Phase 1 — Teams handler called
  preventDefault on the synthetic event too, and CKEditor's clipboard pipeline is
  documented to consume paste events itself)
- reads clipboardData.files: inferred YES (Phase 1 succeeded with files-only DataTransfer)

Drop listeners: not inspected this round; the paste path works so drop isn't needed
for the spike's question. Worth knowing about as an alternative ingestion route if
the paste path ever regresses.
```

The CKEditor finding is significant — the research phase guessed ProseMirror / Slate / Lexical based on the 2023 Microsoft Q&A thread. CKEditor 5 has a documented clipboard plugin that handles paste events on its own root and dispatches into its model, which explains why synthetic paste worked despite the MDN-spec caution.

## Phase 1 results

Run via the harness's "Phase 1: synthetic paste" button (a 1:1 chat with compose focused). Verdict: **SUCCESS — synthetic paste works end-to-end, including upload and send.**

```
Pre-dispatch DataTransfer state:
- itemsLength: 1
- filesLength: 1
- types:       ["Files"]

Dispatch outcome:
- event.isTrusted:        false  (expected — synthetic event)
- dispatchEvent returned: false  (event was cancelled by Teams handler)
- event.defaultPrevented: true   ← Teams's CKEditor handler actively consumed the event,
                                   not a no-op

Compose mutation (300ms after dispatch):
- children:          before=1  after=1
- innerHTML length:  before=91 after=1068
- blob/data images:  before=0  after=1   newly inserted=1
- inserted src:      blob:https://teams.cloud.microsoft/...  (real Teams blob URL)
```

Console emitted: `Phase 1 likely SUCCESS — image appears in compose. Verify visually, then try to send the message.`

### Send verification (the real test)

Did the inserted blob image actually survive Teams's send pipeline, or just appear visually in compose?

- Visually confirmed: a 64×64 cyan "SPIKE" square appeared in the compose box.
- Pressed Enter to send.
- The image appeared in the chat history with timestamp and read-receipt checkmark.

That means the full pipeline accepted the synthetic-paste-inserted image: CKEditor model insertion → upload to Teams blob storage → send → delivered. Not a visual-only artifact.

### Noise

The console logged one `Unhandled error/rejection {"isTrusted": true}` line during the test. That's unrelated to the spike (note `isTrusted: true` — different event entirely, surfaced by Teams's own global handler). Not caused by, and does not affect, the synthetic-paste path.

## Phase 2 results

Not run. Phase 1 succeeded, so the spike's fallback path (`clipboard.writeImage` + `sendInputEvent` keystroke + clipboard snapshot/restore) is not needed. The Phase 2 design in this document is preserved as a future-proofing reference in case Teams ever changes its editor framework and the synthetic-paste path regresses.

## Out of scope for this spike

- Floating panel UI / theming
- Folder-watching for live updates
- Sticker metadata (alias, tags, recently-used)
- Config option wiring (`customStickers.enabled`, `customStickers.folder`)
- Internationalisation

These are mechanical follow-ups once the paste path is confirmed.
