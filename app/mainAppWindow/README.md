# Main App Window

Manages the primary BrowserWindow that hosts the Teams web interface.

## Components

- **[index.js](index.js)**: Entry point and window lifecycle management
- **[authRecovery.js](authRecovery.js)**: In-app auth recovery (`auth.reauthRecovery.enabled`): detection, per-surface state (root window or one profile view), the mid-call prompt and the clear-and-reload. See [Auth Recovery](#auth-recovery)
- **[browserWindowManager.js](browserWindowManager.js)**: Window creation, configuration, and event handling
- **[deepLinkRouter.js](deepLinkRouter.js)**: In-page routing for Teams deep links, on whichever webContents it is given
- **[deepLinkOpener.js](deepLinkOpener.js)**: Opens one deep link on one webContents: in-page route, else full navigation, else deferred while a call is active
- **[deepLinkTarget.js](deepLinkTarget.js)**: Which webContents external links open in: the root window, or the active profile's view when multi-account injects a getter
- **[callRegistry.js](callRegistry.js)**: Which renderers are in a call (a set of webContents ids; "a call is active" means non-empty)
- **[launchLinkHold.js](launchLinkHold.js)**: Holds a link that arrives before the active profile's view is ready, for that view's first load
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
- The call deferral stays global: any active call holds a full-navigation
  fallback, even one in another profile. "Active" is `callRegistry`: each
  profile's call is its own entry, removed on that sender's disconnect, its own
  `did-navigate` or its destroy, so one profile hanging up does not release a
  link while another is still in a call. A `did-navigate` in the link's own
  target cancels the held link; the root window's `did-navigate` cancels it
  only if it is held for the root (and clears the root's call entry).
- The user can switch profile while a link waits for a call or for the in-page
  probe (up to ~750 ms), so after the probe the opener rechecks that the link
  is still the newest and its target alive, then brings the target forward
  (`setDeepLinkActivator`, the notification-click activator; a no-op for the
  already-active profile) and focuses it right before the fallback load or the
  compose focus.
- Cold start and startup: while multi-account is on, the stored active profile
  lives in a view and that view is not wired up yet, an https link (the launch
  argument, or a second instance during startup) is held by `launchLinkHold`
  rather than sent to the root window, and handed to
  `ProfileViewManager.setLaunchUrl` as that view's first load. The root window
  (Profile 0, hidden behind the view) starts on its usual page. With the flag
  off, or Profile 0 active, nothing is held.
- After a second-instance link the target's webContents is focused as well as
  the window, so typing after the link lands in the active profile.

## Auth Recovery

`authRecovery.js` holds the opt-in in-app recovery (`auth.reauthRecovery.enabled`):
a trusted MSAL `InteractionRequired` signal clears the session's auth
localStorage keys and auth cookies and reloads it; a worker `UPR:` error only
feeds the login-popup correlation; during a call the user is asked instead
(sign in now, after the call, not now). `index.js` only wires it.

State is kept per **surface**: the root window (Profile 0, and the only
surface without multi-account) or one multi-account profile view. Cooldown,
failure-signal timestamp, popup dedupe, the mid-call prompt and the queued
recovery all belong to one surface, and recovery clears and reloads only that
surface's webContents and session.

- **Attribution.** The root window's and every profile view's
  `console-message` feed detection directly. The `window-error` and
  `unhandled-rejection` IPC handlers in `app/index.js` pass `event.sender`
  through `notifyRendererError`, mapped with `ProfileViewManager.resolveProfileId`.
  A popup belongs to the profile that opened it (it shares that profile's
  partition). A sender no profile owns (the switcher pill, a dialog, a popup
  of the root window before Profile 0 exists) is dropped, never credited to
  another profile. Without multi-account every renderer belongs to the root
  window, as before.
- **Calls.** `callRegistry.js` keeps the in-call senders; a surface is in a call
  when one of them (`activeIds()`) resolves to it. A call in profile A neither blocks profile
  B's silent recovery nor is ended by it; a recovery queued for "after the
  call" runs once no renderer of that surface is in a call, and a profile's
  own reload clears its call and its queued recovery. When it runs, it cancels
  a deep link held for the same surface (`cancelIfFor`); a link held for
  another profile still opens once no call is left.
- **Login popups.** The root window's about:blank and direct login popups
  (`onBeforeRequestHandler`, `onNewWindow`) correlate with and recover the
  root window. A profile view's direct login popup goes through
  `profileWindowOpenPolicy.js` and is taken only when that profile has a
  recent failure signal; it recovers that profile. A profile view's
  about:blank login popup is left alone: it opens as a real window the user
  can sign in from.
- **Persisted signal.** Only the root window persists its failure signal
  (`authRecovery.lastFailureSignalAt` in the settings store, unchanged).
  Profile views keep theirs in memory, since a popup they do not intercept
  still signs in inside the app. A removed profile, or a view that destroyed
  its own webContents, takes its state with it.
- **Mid-call prompt.** Parented to the root window; with multi-account it
  names the profile ("Teams needs you to sign in again to Work."). Profile
  names and ids are never logged; logs only carry `{ isRoot }` with
  multi-account on, and are unchanged without it.
- **Cookie hygiene (always on, #2296).** Expired auth cookies are cleaned from
  the root window's session before Teams loads, from each profile view's
  session before its first load (`ProfileViewManager`'s view-created hook), and
  from every live session after a resume from sleep.
