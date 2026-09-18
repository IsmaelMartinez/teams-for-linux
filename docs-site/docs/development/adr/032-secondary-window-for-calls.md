---
id: 032-secondary-window-for-calls
---

# ADR 032: Opt-in Secondary Window for the Same Account During Calls

## Status

🚧 Proposed (2026-09-18). Supersedes [ADR-010](010-multiple-windows-support.md).

## Context

[#2971](https://github.com/IsmaelMartinez/teams-for-linux/issues/2971) asks for a way to keep a meeting (typically with shared slides) on one monitor while the rest of Teams stays usable on another, so an unexpected message from someone else can be read and answered without leaving the call. The Windows client covers this with pop-out windows. Teams for Linux has a single window, and the two earlier requests were closed: [#2499](https://github.com/IsmaelMartinez/teams-for-linux/issues/2499) (a separate window for the running call) because the call lives in the renderer and cannot be moved to another `BrowserWindow` without tearing it down, and [#1984](https://github.com/IsmaelMartinez/teams-for-linux/issues/1984) (multiple windows for one account), which shipped QuickChat instead ([ADR-015](015-quick-chat-inline-messaging.md)). ADR-010 recorded the general rejection of multi-window in November 2025.

Several of ADR-010's premises no longer hold, and the rest were checked before writing this record:

- **The web app allows concurrent instances of the same account, including during a call.** On 2026-09-10 a meeting joined in the client was joined again from a browser tab: no prompt, no forced hand-over, both instances stayed in, the roster showed one participant. On 2026-09-18 a spike ran the app from source with a probe that opened a second `BrowserWindow` on `persist:teams-4-linux` with the production `preload.js` while a meeting was active in the main window. The second window loaded already signed in within a second, worked as a full client for several minutes (chats, calendar, unread counts in its title, the running meeting's own chat) and the call in the first window stayed untouched. Main-window renderer errors were identical in count and type before and after (the usual Teams `Apollo Invariant Violation` noise). ADR-010's "potential authentication/session conflicts" did not materialise.
- **QuickChat is outbound only.** It resolves a contact and sends a message through Graph. It shows no thread history and no incoming replies, cannot reach people without prior chat history, and cannot answer the inbound case (someone new writes during a meeting). The maintainer confirmed this scope in #2971.
- **Teams' own "Add shared display" is not a shortcut.** [#2983](https://github.com/IsmaelMartinez/teams-for-linux/issues/2983) reports it as a no-op in the wrapper. Attaching to the renderer while clicking it showed no `window.open`, no new target (observed with `Page.windowOpen` and `Target.setDiscoverTargets`, which fire even when the embedder later denies the window), no console output and no exception. The bundles show it is `ByodExtendToRoomDisplayButton`, a BYOD pop-out driven by Teams' multi-window layer (`CallingMultiWindowService`, `MultiWindowExperience` vs `SingleWindowExperience`, `isDesktopApp`), where windows are created by the desktop host through internal windowing intents. In a browser the client runs the single-window experience and the action has no host to talk to. `screen.isExtended` is true and the window-management permission is granted inside the wrapper, so multi-monitor detection is not the blocker.
- **The pieces the feature needs already exist.** `onNewWindow` in `app/mainAppWindow/index.js` intercepts meeting links (`meetupJoinRegEx`) and loads them in the main window; `profileWindowOpenPolicy.js` ([ADR-020](020-multi-account-profile-switcher.md)) is a reusable window-open policy for a non-main webContents; the in-app screen-share picker is registered per session with `setDisplayMediaRequestHandler`, so a second window on the same partition inherits it; `speakingIndicator` emits `teams-call-connected` / `teams-call-disconnected` from WebRTC stats; the Teams-session Graph token ([ADR-030](030-graph-api-teams-session-token.md)) carries `Calendars.Read`, and `GraphApiClient.getCalendarView()` returns events with `onlineMeeting.joinUrl` in the `l/meetup-join/` form the interceptor already matches.

Two things were tried and ruled out while shaping the scope. Detecting "the user is about to join" from the window title is not reliable: inside the Calendar section the title stays on `Meeting join | <subject>` across the overview, the event details and the pre-join screen, and only changes when leaving the section; the URL never changes. And "move the current meeting" (open its `joinUrl` in the second window, then reload the main window to drop its leg of the call) only worked because a reload ended the call. [#2976](https://github.com/IsmaelMartinez/teams-for-linux/issues/2976) removed that: since [PR #2988](https://github.com/IsmaelMartinez/teams-for-linux/pull/2988) a deep link the SPA declines during a call is held in `DeferredDeepLink` and released on `teams-call-disconnected` (newest navigation wins, cancellable), and auth recovery is queued until the call ends the same way. With reloads no longer ending calls, "move current meeting" would leave the account in the meeting twice, so it is out.

## Decision

Add an **opt-in secondary window**: a second `BrowserWindow` on the same session partition as the active profile, loading the Teams web app, so that a call can live in one window while the other stays a full Teams client. The call is never moved; it lives in whichever window it was joined or answered from.

Scope for the first phase:

- **Configuration.** `secondaryWindow.enabled` (default `false`). Nothing changes for existing users unless they opt in.
- **Lifecycle.** One secondary window at most, reused while it exists. Created on demand, never at startup. Bounds and monitor are persisted and restored. It stays open until the user closes it (no automatic close in this phase; the maintainer asked for less lifecycle code and no typing guard, with auto-close as a possible later opt-in). Closing it only closes it: it never minimises to the tray, never quits the app, and never affects the main window.
- **Triggers.** A menu entry and configurable shortcut open or focus it. When the option is on, meeting links caught by `meetupJoinRegEx` in `onNewWindow` load in the secondary window instead of the main one, landing on the pre-join screen, and the link context menu gains "Join in secondary window". Optionally (`secondaryWindow.openOnCall`, default `false`) the window opens when `teams-call-connected` fires for the main window, giving the rest of Teams next to an answered call without any manual step.
- **Swap windows.** An action that exchanges the bounds of the two windows, so a call that landed on the small monitor moves there in one shortcut without touching the call itself.
- **Window role in the preload.** The main process passes a role to `preload.js` (`main` or `secondary`) and the module list is filtered by it. The secondary keeps the media tools (`overrideMicConstraints`, `disableAutogain`, `ignoreSystemMute`, `cameraResolution`, `cameraAspectRatio`, `preventDeviceSwitching`) and `speakingIndicator`, so a call joined there still reports its state; it drops the title observer (`mutationTitle`, today gated by `useMutationTitleLogic`), `trayIconRenderer`, `dockIconRenderer`, `mqttStatusMonitor`, notification and activity handling, and QuickChat wiring, which stay owned by the main window. A role flag rather than a second preload file keeps the security wiring (`contextIsolation`, IPC allowlist) identical.
- **Call ownership.** Call state becomes "which webContents owns the call", a single main-process source fed by `teams-call-connected` with its sender. It feeds MQTT in-call reporting, the `openOnCall` trigger, and the `callActive` guards used by auth recovery and deep links, so a reload in the window that does not own the call stays allowed and a reload in the one that does gets the existing prompt. The state carries what `callActive` protects today after [PR #2988](https://github.com/IsmaelMartinez/teams-for-linux/pull/2988): the `DeferredDeepLink` queue and the recovery queued for call end are released when the owning window's call ends, not when any call ends, and a deep link aimed at the window that does not own the call can route immediately. The `did-navigate` reset of `callActive` becomes per window.
- **Multi-account.** Phase one is root profile only: with `multiAccount.enabled` the secondary window is not offered. Profile views also emit `teams-call-connected`, and today's handler does not look at the sender; the follow-up is for the secondary window to take the partition of the call-owning webContents, using `profileWindowOpenPolicy` for its window-open handling.

Second phase, once the first has landed: **Join upcoming meeting in the secondary window**. Behind `graphApi.enabled`, a menu entry or shortcut calls `getCalendarView()` for the current or next event and opens its `joinUrl` in the secondary window, with a small picker when several overlap.

Out of scope, on purpose: moving a live call between instances (#2499 stands), redirecting the purple Join button (it is resolved inside the SPA and would need DOM hooks into the Teams UI), relocating a 1:1 call that was already answered (Teams web offers no transfer between instances), "Meet now" automation (no calendar event, though it can be started from the secondary window directly), and Teams' "Add shared display" (host-gated, see Context).

## Consequences

### Positive

The user's case is covered without touching the Teams DOM: the secondary window is the same web app the browser tab test used, so it follows Microsoft's changes rather than ours. The pieces are already in the codebase (meeting-link interception, per-session screen-share picker, window-open policy, call events, Graph calendar access), so the new code is window lifecycle, a role flag in the preload, and a call-ownership source that the app needs anyway for [#2976](https://github.com/IsmaelMartinez/teams-for-linux/issues/2976). Opt-in keeps the default experience byte-identical.

### Negative

Two renderers of the Teams web app roughly double memory while the secondary window is open. Call ownership adds a concept that several modules must respect (`callActive` guards, MQTT, auth recovery), and mid-call auth recovery in the secondary window is untested. The secondary window has no tray, badge or notification integration by design, so a user who lives in it during a call relies on the main window for alerts. Microsoft could reintroduce a single-instance lock in the web app; the wrapper does not depend on its absence (the window would simply show whatever the web app shows, as a browser tab would), but the feature would lose most of its value. Multi-account users wait for the second phase.

### Neutral

This record supersedes ADR-010; ADR-015 (QuickChat) stays valid for quick replies and is unaffected. `onNewWindowOpenMeetupJoinUrlInApp` keeps its meaning; the secondary window only changes where an in-app meeting link is loaded. The e2e suite needs a case that opens the secondary window with the `secondary` role and asserts the module split, and a unit test for the call-ownership source.

## Alternatives Considered

### QuickChat only

Already shipped for #1984. Covers "send a quick message during a call" but not reading a thread, seeing incoming messages, channels, or contacts without prior history. Insufficient for the inbound case that motivates #2971.

### Let Teams' "Add shared display" pop-out open in-app

Would have been most of the feature with almost no code. Ruled out by the #2983 investigation: the action never reaches the embedder, it depends on the desktop host's windowing layer.

### Automatic redirection of the Join button

Detect the pre-join screen and open the meeting in the secondary window automatically. The only DOM-free signals (window title, URL, `history.state`) do not distinguish the pre-join screen from the calendar views, and hooking the Teams DOM is the fragility this project avoids. Replaced by meeting-link routing now and calendar-based "join upcoming" in the second phase.

### Move the current meeting by reloading the main window

Opens the meeting in the secondary window and reloads the main one so its leg of the call ends. Works today only as a side effect of reloads ending calls, which #2976 is fixing; afterwards the account would be in the meeting twice. Dropped.

### Independent second instance with its own user data directory

ADR-010's option 1, already possible with `--user-data-dir`. Separate login, separate tray icon, no coordination, and it does not solve the badge and notification duplication. Not the integrated experience requested.

### Auto-close the secondary window when the call ends

Proposed initially. Deferred: it needs a guard so a window the user is typing in does not vanish, adds lifecycle code, and removes a chat someone may still be reading. Can return as an opt-in once the manual lifecycle has proven itself.

## Related

- [ADR-010](010-multiple-windows-support.md): Multiple Windows Support (superseded by this record)
- [ADR-015](015-quick-chat-inline-messaging.md): Quick Chat inline messaging
- [ADR-020](020-multi-account-profile-switcher.md): Multi-account support, `profileWindowOpenPolicy`
- [ADR-030](030-graph-api-teams-session-token.md): Graph API access via the Teams session token
- [#2971](https://github.com/IsmaelMartinez/teams-for-linux/issues/2971): the request and the scope discussion
- [#1984](https://github.com/IsmaelMartinez/teams-for-linux/issues/1984), [#2499](https://github.com/IsmaelMartinez/teams-for-linux/issues/2499): earlier requests
- [#2976](https://github.com/IsmaelMartinez/teams-for-linux/issues/2976): reloads must not end an active call
- [#2983](https://github.com/IsmaelMartinez/teams-for-linux/issues/2983): "Add shared display" investigation
- `app/mainAppWindow/index.js` (`onNewWindow`, `callActive`), `app/mainAppWindow/profileWindowOpenPolicy.js`, `app/browser/preload.js` (module list), `app/browser/tools/speakingIndicator.js`, `app/graphApi/index.js` (`getCalendarView`)
