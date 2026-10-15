# Main App Window

Manages the primary BrowserWindow that hosts the Teams web interface.

## Components

- **[index.js](index.js)**: Entry point and window lifecycle management
- **[browserWindowManager.js](browserWindowManager.js)**: Window creation, configuration, and event handling
- **[deepLinkRouter.js](deepLinkRouter.js)**: In-page routing for Teams deep links
- **[callStateTracker.js](callStateTracker.js)**: Per-window call state behind `browserWindowManager.callState`

## Responsibilities

- Window state management (minimize, maximize, close)
- Web contents configuration and security settings
- Integration with Teams web interface
- Call event handling and screen sharing coordination
- Deep link handling for `msteams:` protocol links and HTTPS Teams links

## Deep Link Routing

`onAppSecondInstance` navigates the window to a resolved deep link, which
replaces the document and cold-boots the SPA. Launcher links avoid that:
`deepLinkRouter` assigns the equivalent `#/l/...` route to the main frame
instead, guarded by a check on the main frame (the configured origin, or any
known Teams host). The SPA rewrites the fragment or retitles the document when
it handles the route, and anything left unconsumed falls back to the full
navigation — except during a call, where the reload would end it: the link then
waits in `deferredDeepLink` for `teams-call-disconnected`, like a queued auth
recovery. That slot holds one link and the newest navigation wins: a later link
(however it ends up opening), any `did-navigate`, or a queued auth recovery
cancels it, up to the moment it opens. After an in-page route to a chat or a
message, `focusCompose` puts the caret in the compose box (best effort,
selector cascade, only once the view has stopped mutating so the caret never
lands in the chat being left, takes focus back from the highlighted message, backs
off when the user points elsewhere, types into another field or navigates with
the keyboard): the SPA opens the
conversation but leaves focus wherever it was.

## Call State

The renderer reports `call-connected` / `call-disconnected` over IPC and
`browserWindowManager` keeps one entry per reporting webContents in a
`CallStateTracker` ([ADR-032](../../docs-site/docs/development/adr/032-secondary-window-for-calls.md)):
a disconnect only clears the window it came from, and a renderer destroyed
mid-call is dropped and announced as `teams-call-disconnected` so nothing stays
stuck. Screen-lock inhibition follows the derived state: the single Electron
`powerSaveBlocker` is held while any window is in a call, and in
`WakeLockSentinel` mode the `enable-wakelock` / `disable-wakelock` messages go
to the renderer that holds the call, with `attachWakeLockRestore(window)`
re-acquiring the lock on `restore` / `show` only for a window whose own
document is in a call. `index.js` asks the tracker rather than keeping a flag:
the deep-link fallback reload is deferred while *this* window is in a call
(`isMainCallActive`), while auth recovery, which clears the shared partition,
waits on any call in any window (`isAnyCallActive`). A `did-navigate` clears
the main window's own entry through `clearCall`, since a reload resets the
renderer's state without reporting a disconnect.
