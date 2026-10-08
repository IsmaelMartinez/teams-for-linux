# Profile Unread Aggregator

ADR-020 Phase 2. With `multiAccount.enabled`, every profile `WebContentsView`
runs the same title-scrape → badge pipeline (`app/browser/tools/
mutationTitle.js` → `trayIconRenderer.js`), so main receives `tray-update`
and `set-badge-count` from **every** profile — and the previous handlers were
last-write-wins: a background profile settling to 0 cleared the badge for the
profile on screen.

`ProfileUnreadAggregator` makes main authoritative:

- **Dock/taskbar badge** = sum of unread across profiles.
- **Tray tooltip** = `App title (total)` plus the top-3 profiles by count.
- **Tray icon** = the sender's own composited icon while at most one profile
  is unread (identical to single-account today); with several unread, main
  asks the active surface's renderer to composite the summed count
  (`render-aggregate-badge` → `aggregate-badge-rendered`, reusing
  `trayIconRenderer`'s canvas path — main has no canvas).
- Buckets are attributed via `SenderProfileMap`, and **only a profile's
  primary surface may write them** (the root window or a profile view —
  never popups/webview guests, whose own window titles scrape to 0 and
  would zero their profile). The root window's pre-bootstrap updates key by
  sender and re-key to Profile 0 the moment it exists.
- A profile stops contributing the moment it is removed **or** its view dies
  outside removal (`onProfileViewGone`) — with no live surface left to
  report, holding the last count would inflate the badge for the session.
- Replies on `aggregate-badge-rendered` are matched by an unguessable
  request id and the responding webContents' identity, and must be a
  bounded `data:image/` URL (`badgeRenderBridge.js`).

Flag off, none of this is constructed: `tray-update` and `set-badge-count`
keep their original single-sender behaviour.
