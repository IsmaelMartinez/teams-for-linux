# Main App Window

Manages the primary BrowserWindow that hosts the Teams web interface.

## Components

- **[index.js](index.js)**: Entry point and window lifecycle management
- **[browserWindowManager.js](browserWindowManager.js)**: Window creation, configuration, and event handling
- **[deepLinkRouter.js](deepLinkRouter.js)**: In-page routing for Teams deep links

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
selector cascade, backs off at the first user input): the SPA opens the
conversation but leaves focus wherever it was.
