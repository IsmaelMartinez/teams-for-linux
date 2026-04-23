# Join Meeting Window Takeover (Issue #2322)

:::info Iterative Implementation
Issue [#2322](https://github.com/IsmaelMartinez/teams-for-linux/issues/2322) reports that the "Join Meeting" action from the tray/app menu replaces the whole window content, leaving the user stranded on the "meeting ended" screen with no visible way back to chat. The first iteration of the fix lands alongside this research. Further iterations are possible once we have user feedback from non-enforced-anonymous orgs.
:::

Date: 2026-04-20
Issue: [#2322](https://github.com/IsmaelMartinez/teams-for-linux/issues/2322)
Status: First iteration shipped; follow-up options documented below

## Background

The "Join Meeting" flow (introduced in PR #1856) lets users paste a meeting link and join without manually navigating Teams. The handler in `app/menus/index.js` called `this.window.webContents.loadURL(meetingUrl)` on the main BrowserWindow. That replaced the entire Teams SPA document with whatever Microsoft returns for the `/l/meetup-join/...` path, which is typically a standalone meeting launcher rather than a route inside the authenticated Teams shell. When the meeting ended, the user landed on Microsoft's post-call screen (containing the "Rejoin" / "Sign in" / "Meetings are just one tool in our belt" copy) with no sidebar and no obvious path back to chat. The issue log excerpt `ReactHandler: Teams app element not found` is consistent with this: the Teams React root no longer exists in the document after the takeover.

The reported workaround was `Alt-Left` twice, which is undiscoverable and depends on webContents navigation history being intact.

## Reproduction

Confirmed on macOS dev build with the reporter's meeting URL. The behaviour has two distinct causes that look the same from the outside.

The first cause is the `loadURL` call itself. Even when the user's org would have allowed an authenticated in-SPA join, calling `loadURL` from the main process creates a fresh document load against Microsoft's servers, and that entry point routes to the standalone launcher. This case is tractable: we can avoid it by navigating inside the already-loaded, authenticated Teams page via `executeJavaScript`, using the same-origin deep-link pattern that the quick chat feature uses (see ADR 014).

The second cause is org policy. When the meeting's tenant does not match the signed-in user's tenant, or when the target org forces anonymous/guest join, Microsoft's servers redirect the URL into the anonymous meeting experience regardless of how the navigation starts. That experience is a full-page takeover by design, and the post-meeting screen is the "Rejoin" page shown in the issue. We cannot prevent this from the client — Microsoft decides based on tenant and policy. This is what was observed during reproduction on a maintainer's account.

## First iteration (shipped)

Two complementary changes land together.

The `joinMeetingWithUrl` handler no longer calls `loadURL`. It snapshots the current webContents URL into `this.preJoinUrl`, then runs an `executeJavaScript` snippet that constructs a same-origin URL from the meeting path and assigns `window.location`. When the org allows authenticated join, this keeps the user inside the Teams SPA with the sidebar preserved, mirroring how the quick chat deep links work. When the org forces anonymous join, this makes no difference — Microsoft's redirect chain still takes over the window — but there is no downside compared to the previous behaviour.

For the cases we cannot prevent, a new `Return to Teams` app-menu entry was added next to `Join Meeting`. It prefers the snapshotted `preJoinUrl` (validated against the Teams hostname allow-list) and falls back to the configured `url` default (`https://teams.cloud.microsoft`). This replaces the undiscoverable `Alt-Left` workaround with a visible recovery action. The menu item is always present rather than conditionally shown, because users can get pushed out of the Teams shell through other flows too (login redirects, deep links clicked from elsewhere).

## Caveats

The same-origin trick only helps when the Teams SPA is actually loaded and authenticated. If the user has not logged in yet, `executeJavaScript` still runs in whatever document is loaded, which is fine in practice because the flow only makes sense post-login, but we are not explicitly guarding against the pre-login case.

We cannot verify the authenticated-org path in this project's CI or on the maintainer's personal account because the only available meeting link points to an org that enforces anonymous join. Whether the same-origin navigation actually preserves the sidebar in authenticated-org cases is still unconfirmed and depends on a user with the right setup reporting back. The change is still worth shipping because it is strictly no worse than `loadURL` and it matches the documented pattern used elsewhere in the codebase.

The `Return to Teams` item uses `loadURL` on the main window, which is the correct tool when the window is already outside the SPA (for example on the anonymous post-meeting page). It does not attempt any graceful state transition; the user gets a fresh Teams load. This is acceptable because the alternative — sitting on the Microsoft "Rejoin" page with no way forward — is worse.

The snapshotted `preJoinUrl` is per-`Menus`-instance memory, lost on app restart. That is fine for the recovery use case but means we cannot restore the previous chat after a crash or reboot.

## Follow-up iterations

Several directions are possible if user reports indicate the first iteration is insufficient.

Auto-detecting the "meeting ended" page via `did-navigate` events and either prompting or auto-navigating back is the next obvious step. The risk is that the same page is where the legitimate "Rejoin" button lives, so auto-redirect would frustrate users who want to rejoin. A prompt ("You left a meeting. Return to Teams?") is safer but adds a modal to a flow that should feel native.

Opening the meeting in a dedicated BrowserWindow is the cleanest UX — the main Teams app is never disturbed, and closing the meeting window returns focus to chat. This conflicts with the spirit of ADR 010 (which rejected general multi-window chat workflows), but a transient meeting popup is a narrower pattern and matches how the official Windows Teams client behaves. If adopted it should be its own ADR, because it introduces questions about window lifecycle, camera/mic permissions across windows, and interaction with the existing tray/quit behaviour.

A keyboard accelerator for `Return to Teams` (for example `Ctrl+Shift+T`) would improve discoverability further. It was intentionally omitted in the first iteration to avoid shortcut churn before we know the feature is useful.

## Related

- Issue [#2322](https://github.com/IsmaelMartinez/teams-for-linux/issues/2322) — Join Meeting replaces whole window content
- PR [#1856](https://github.com/IsmaelMartinez/teams-for-linux/pull/1856) — original Join Meeting feature
- [ADR 014](../adr/014-quick-chat-deep-link-approach.md) — same-origin deep link pattern reused here
- [ADR 010](../adr/010-multiple-windows-support.md) — relevant if a meeting popup is ever proposed
