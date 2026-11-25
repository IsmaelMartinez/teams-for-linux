# Main App Window

Manages the primary BrowserWindow that hosts the Teams web interface.

## Components

- **[index.js](index.js)**: Entry point and window lifecycle management
- **[browserWindowManager.js](browserWindowManager.js)**: Window creation, configuration, and event handling
- **[deepLinkRouter.js](deepLinkRouter.js)**: In-page routing for Teams deep links, on whichever webContents it is given
- **[deepLinkOpener.js](deepLinkOpener.js)**: Opens one deep link on one webContents: in-page route, else full navigation, else deferred while a call is active
- **[deepLinkTarget.js](deepLinkTarget.js)**: Which webContents external links open in: the root window, or the active profile's view when multi-account injects a getter
- **[deferredDeepLink.js](deferredDeepLink.js)**: The one-slot holder for a link waiting out a call
- **[msalCookiePersistence.js](msalCookiePersistence.js)**: Promotes the `msal.cache.encryption` session cookie to a persistent one so sign-in survives restarts. Installed once per session on the root window and on every multi-account profile view (#3183)
- **[protocolLink.js](protocolLink.js)**: Protocol schemes the app registers, `web+msteams:` normalisation and resolving launch arguments to the URL to open

## Responsibilities

- Window state management (minimize, maximize, close)
- Web contents configuration and security settings
- Integration with Teams web interface
- Call event handling and screen sharing coordination
- Deep link handling for `msteams:` and `web+msteams:` protocol links and HTTPS Teams links.
  Teams' launcher page picks between the two schemes server side, so the app registers both
  and `resolveLaunchUrl` (behind `processArgs`) drops the `web+` prefix before matching.

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

### Which webContents a link opens in

Without multi-account, always the root window's webContents. With
`multiAccount.enabled`, `app/index.js` calls `setDeepLinkTarget(getControlWebContents)`
so a link opens in the **active profile's** webContents: the root window for
Profile 0, the profile's `WebContentsView` for any other. A getter that
answers null, a destroyed webContents or throws falls back to the root window.
This covers a second instance (`msteams:` / https links, browser redirector
extensions), the Join Meeting dialog and menu entry (see `app/menus`), and the
launch link at cold start.

- The target is resolved **once per link** and kept for the whole of
  `openDeepLink`, including a deferred release: switching profile while a link
  waits does not move it. If that webContents is destroyed by release time
  (the profile was removed) the link is dropped and a debug line (no URL) says
  so; it never falls back to another profile.
- The call deferral stays global (`callActive`): any active call holds a
  full-navigation fallback, even one in another profile. That is deliberately
  conservative, and what a single window always did. A `did-navigate` in the
  link's own target cancels the held link (the root window's `did-navigate`
  still does too, and also resets `callActive`).
- Cold start: when the stored active profile lives in a view, `onAppReady`
  keeps the https launch link out of the root window and hands it to
  `ProfileViewManager.setLaunchUrl`, which uses it as that view's first load.
  The root window (Profile 0, hidden behind the view) starts on its usual page.
- After a second-instance link the target's webContents is focused as well as
  the window, so typing after the link lands in the active profile.
