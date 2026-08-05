---
id: 022-custom-notification-toast-scope
---

# ADR 022: Custom Notification Toast Scope

## Status

✅ Accepted (Phase 1 implemented, Phase 2 dropped)

## Context

Users repeatedly reported that OS-level notifications are unreliable on Linux. The application could freeze when no notification daemon was running, behaviour varied between desktop environments, and there was no notification history or actionable notification surface. Those reports motivated an investigation into an alternative, in-application notification path that would not depend on the host notification daemon at all.

The investigation was scoped in phases. Phase 1 was a minimum viable toast: show a small window for a Teams notification, dismiss it automatically, and focus the main window when clicked. Phase 2 was to be the larger piece of work, routing chat, calendar and activity notifications into that same custom surface and adding a session-based notification centre so users could review what they had missed. Phase 1 shipped in v2.6.16. Phase 2 was attempted and then dropped.

The relevant request behind Phase 2 was [#2039](https://github.com/IsmaelMartinez/teams-for-linux/issues/2039), with follow-up in [#2108](https://github.com/IsmaelMartinez/teams-for-linux/issues/2108). Phase 2 routing worked reliably on the maintainer's machine throughout development and testing, but the requesting user reported receiving no notifications at all. It was never established whether the implementation genuinely failed in that user's environment or whether their expectations differed from what had been built. Candidate explanations included desktop environment notification handling, Teams account type affecting DOM mutation behaviour, and a plain mismatch between the requested feature and the delivered one. None of them could be confirmed without diagnostics that were not available.

## Decision

Ship and keep the Phase 1 custom toast as an opt-in alternative to OS notifications, selected by `notificationMethod: "custom"`. Do not build Phase 2 (chat, calendar and activity notification routing, plus the session-based notification centre). Issue [#2039](https://github.com/IsmaelMartinez/teams-for-linux/issues/2039) was closed as not feasible given the ambiguity about whether the work was even solving the reported problem.

### Architecture

The shipped system lives entirely in `app/notificationSystem/`. `index.js` defines `CustomNotificationManager`, which reads `customNotification.toastDuration` from config (defaulting to 5000 ms), registers the two IPC listeners `notification-show-toast` and `notification-toast-click`, and tracks live toasts in an in-memory `Set` so they are not garbage collected while visible.

`app/notificationSystem/NotificationToast.js` wraps a single frameless, transparent, always-on-top `BrowserWindow` of 360 by 110 pixels that is `focusable: false` and `skipTaskbar: true`, so a toast never steals focus or appears as a task. It loads `notificationToast.html` with `notificationToastPreload.js` under `contextIsolation: true` and `nodeIntegration: false`, sends the notification payload once `did-finish-load` fires, positions itself via the shared `moveWindow(window, 'bottomRight')` helper in `app/utils/windowPositioner`, and arms a timer that closes the window after the configured duration. A click is relayed back over `notification-toast-click`, at which point the manager closes the originating toast and shows and focuses the main window.

Selection is driven by `notificationMethod` in `app/config/options.js`, which accepts `web` (the default), `electron` and `custom`. Only the `custom` value routes through this toast system, so users who do not opt in are unaffected. The design deliberately mirrors the pre-existing `IncomingCallToast` pattern rather than inventing a second convention for owned-window notifications.

### Rationale

A custom `BrowserWindow` was the only practical route. There are no viable third-party Electron notification packages, the surviving ones being five to nine years old, and the React-based libraries do not apply because Teams for Linux is an Electron wrapper around the Teams web app rather than a React application. `IncomingCallToast` had already proven the owned-window approach works in this codebase, and owning the window gives consistent behaviour across Linux, Windows and macOS without depending on a notification daemon.

Dropping Phase 2 follows from a testing problem rather than a design problem. The routing logic could not be validated end to end against the one user who wanted it. It worked for the maintainer and did not work (or did not appear to work) for the requester, and no diagnostic existed to tell those two situations apart. Shipping and maintaining routing logic that the only requesting user reports as non-functional would add permanent maintenance burden for unverifiable benefit, so the honest outcome was to stop. The Phase 2 notification centre was speculative on top of that: it was never requested independently, it adds a store, a second window class and five further IPC channels, and the project's stated philosophy for this feature is that each phase must be validated before the next one begins.

If custom notifications beyond the meeting toast are requested again by a different user, the intended approach is to first agree explicitly which notifications the user expects to see, then hand them a debug build with diagnostic logging so they can report exactly which events fire in their environment, and only then write routing logic. Note that the shared notification pipeline (sound and native delivery) continues to receive targeted fixes in `app/notifications/service.js`, for example [PR #2414](https://github.com/IsmaelMartinez/teams-for-linux/pull/2414) for [#2411](https://github.com/IsmaelMartinez/teams-for-linux/issues/2411). Those fixes are outside this ADR's scope and do not reopen the Phase 2 question.

## Alternatives Considered

### Phase 2: chat, calendar and activity notification routing

This was the headline follow-up, extending the custom system beyond meeting toasts so ordinary Teams notifications would render as custom toasts. It was implemented and tested, and it worked on the maintainer's machine. Rejected: the sole requesting user in [#2039](https://github.com/IsmaelMartinez/teams-for-linux/issues/2039) reported receiving no notifications at all, the root cause could not be isolated (environment, account type, or a mismatch between expectation and scope), and no second user asked for the feature, so there was no way to validate a fix and no justification for carrying the code.

### Session-based notification centre

A slide-in drawer backed by a `NotificationStore` holding the current session's notifications in memory, with read and unread state, a tray badge count, a clear-all action and five new IPC channels. Rejected: it depended on Phase 2 routing to have anything meaningful to display, it was never requested by users in its own right, and it adds substantial complexity and maintenance surface for speculative value.

### Enhanced toast features

Toast queue management with a visible cap, action buttons for view, dismiss and reply, hover to pause auto-dismiss, and vertical toast stacking. Rejected: deferred rather than dismissed on principle, but with no user reports of problems with the shipped toast and no adoption signal for `notificationMethod: "custom"`, building these would be speculative development ahead of demand.

### Third-party notification libraries

Existing Electron notification packages were surveyed as a way to avoid writing window management at all. Rejected: every surviving package is five to nine years old and unmaintained, and the actively maintained options are React component libraries that cannot be used inside a web-app wrapper that must not modify the Teams DOM.

### Rely on OS notifications only

Keeping `web` and `electron` as the only notification methods would have avoided the whole feature. Rejected: the original reports were precisely that OS notifications hang or misbehave on Linux when the notification daemon is absent or inconsistent, so users experiencing that had no working option at all.

## Consequences

### Positive

Users who hit OS notification problems have a working, daemon-independent alternative by setting `notificationMethod: "custom"`. The toast is small, self-contained and secure by construction (`contextIsolation` on, `nodeIntegration` off, both IPC channels allowlisted), and it reuses the existing `IncomingCallToast` conventions so there is one pattern for owned-window notifications rather than two. Users who do not opt in see no change. Declining Phase 2 keeps `app/notificationSystem/` at five small files with no store, no second window class and no additional IPC surface.

### Negative

The custom method covers only what is explicitly pushed over `notification-show-toast`, so it is not a general replacement for OS notifications across every Teams notification type. Users on the custom method cannot review notifications they missed, because there is no history or notification centre. The user who originally asked for broader coverage in [#2039](https://github.com/IsmaelMartinez/teams-for-linux/issues/2039) did not get a working outcome, and that issue was closed as not feasible rather than fixed. Any future attempt at broader routing starts from scratch, since the Phase 2 work was not merged.

### Known limitations

- No notification history: toasts are transient, and anything missed while away is gone.
- No queue or stacking: concurrent toasts are all created at the same `bottomRight` position and can overlap, as there is no queue cap or vertical arrangement.
- Auto-dismiss cannot be paused: the timer set in `NotificationToast.show()` is not cancelled on hover, so a long message may vanish mid-read.
- No action buttons: the only interaction is a click on the body, which closes the toast and focuses the main window.
- Toast content depends on whatever the renderer sends, and a payload without a `title` is discarded by `CustomNotificationManager` with a warning.
- Phase 2 routing behaviour in other users' environments remains undiagnosed, so we cannot say today whether a future implementation would work for them.

## References

- Research history: see git history for `docs-site/docs/development/research/custom-notification-system-research.md`
- [#2039 request that drove Phase 2, closed as not feasible](https://github.com/IsmaelMartinez/teams-for-linux/issues/2039)
- [#2108 Phase 2 follow-up](https://github.com/IsmaelMartinez/teams-for-linux/issues/2108)
- [#1979 implement notifications modal MVP](https://github.com/IsmaelMartinez/teams-for-linux/issues/1979)
- [#1981 add custom notification system to docs](https://github.com/IsmaelMartinez/teams-for-linux/issues/1981)
- [#1935 build notification modal component research](https://github.com/IsmaelMartinez/teams-for-linux/issues/1935)
- [#2411 double notification sound and missing dismiss event](https://github.com/IsmaelMartinez/teams-for-linux/issues/2411)
- [PR #2414 fix for #2411 in the shared notification pipeline](https://github.com/IsmaelMartinez/teams-for-linux/pull/2414)
- Module documentation: `app/notificationSystem/README.md`
- [Electron BrowserWindow API](https://www.electronjs.org/docs/latest/api/browser-window)
- [Microsoft Fluent Design](https://fluent2.microsoft.design/)
