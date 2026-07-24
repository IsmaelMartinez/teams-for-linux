# profileSwitcher

The in-app account switcher for the multi-account profile switcher (ADR-020
Phase 1c.2). Renders a small account **pill** in the **bottom-left corner** and
its **dropdown** (every profile + Add/Manage links).

## Architecture

The switcher is a single persistent **`WebContentsView`** created and owned by
[`ProfileViewManager`](../mainAppWindow/profileViewManager.js), added to the main
window's `contentView` as the **topmost** child.

- **At rest:** the view is a small square (`SWITCHER_PILL_SIZE`) flush to the
  window's bottom-left corner, showing just the active profile's avatar pill.
  Teams' left rail is empty down there, so nothing functional is covered — and
  profile views are **never inset** (they fill the whole window).
- **Dropdown open:** clicking the pill calls `setExpanded(true)`;
  `ProfileViewManager` grows the view to cover the whole content area so its
  transparent **scrim** dims the app and a click anywhere outside the dropdown
  dismisses it. The dropdown is anchored **above** the pill (opens upward). It
  closes on selection, scrim click, `Escape`, or blur.

> The pill is re-raised (`addChildView`) after every profile switch, because
> attaching a profile view would otherwise paint over it.

### Why bottom-left (and not a top strip / title bar)

An earlier iteration used a full-width top strip; on the root profile it
overlapped Teams' global search + back/forward, and every alternative top-band
position hit some Teams control (search center, nav left, account menu right)
(#2661 review). Teams' **bottom-left** is empty, so the pill lives there and
covers nothing. A native title-bar button isn't an option on Linux — with the
native frame the window controls are WM-drawn, and going frameless to draw them
ourselves is a CSD/SSD minefield, explicitly out of scope.

Profile 0 (the legacy `persist:teams-4-linux` partition) runs on the **root
window's `webContents`**, not a `WebContentsView`. Because the pill is a small
corner overlay (not a reserved strip), Profile 0 needs no special handling and
no auth-path rerouting.

## Files

| File | Role |
|------|------|
| `switcher.html` | Pill + dropdown markup, strict CSP, external assets only |
| `switcher.css` | Pill/dropdown styling; system font, neutral gray + per-profile `avatarColor`, dark mode via `prefers-color-scheme` |
| `switcher.js` | Renderer logic: paint pill, build dropdown, switch/add/manage, open/close, subscribe to state pushes |
| `preload.js` | `contextBridge` `profileSwitcherApi` (contextIsolation + sandbox) |

## IPC

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `profile-list` / `profile-get-active` / `profile-switch` | renderer→main (invoke) | **reused** existing `ProfilesManager` channels |
| `profile-switcher-open-add` | renderer→main | open the existing Add-profile dialog (handled by `Menus`) |
| `profile-switcher-open-manage` | renderer→main | open the existing Manage-profiles dialog (handled by `Menus`) |
| `profile-switcher-set-expanded` | renderer→main | grow the view to full-window while the dropdown is open (handled by `ProfileViewManager`) |
| `profile-switcher-state` | main→renderer | push `{ profiles, activeId }` on any add/update/switch/remove |

All channels are allowlisted in
[`app/security/ipcValidator.js`](../security/ipcValidator.js). Everything is
gated behind `multiAccount.enabled`: with the flag off, `ProfileViewManager`
is never constructed, so the pill is never created and none of the
`profile-switcher-*` handlers are registered.
