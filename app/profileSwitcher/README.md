# profileSwitcher

The top-right in-app account switcher chrome for the multi-account profile
switcher (ADR-020 Phase 1c.2). Renders the account **pill** and its
**dropdown** (every profile + Add/Manage links).

## Architecture

The switcher is a single persistent **`WebContentsView` strip**, not a title
bar. It is created and owned by
[`ProfileViewManager`](../mainAppWindow/profileViewManager.js) and added to the
main window's `contentView` as the **topmost** child.

- **Collapsed:** the strip is `SWITCHER_CHROME_HEIGHT` (40px) tall, full-width,
  pinned at the top. Profile views (1+) are inset to `y: 40` so they sit below
  it.
- **Expanded:** when the pill is clicked the renderer calls
  `setExpanded(true)`; `ProfileViewManager` grows the strip to
  `SWITCHER_EXPANDED_HEIGHT` so the dropdown is not clipped. The strip's
  `WebContentsView` is transparent, so the area below the 40px bar shows a
  **scrim** that dims the Teams content (and collapses the dropdown when
  clicked) rather than a solid block. It collapses on selection, scrim click,
  `Escape`, or blur.

> The strip is re-raised (`addChildView`) after every profile switch, because
> attaching a profile view would otherwise paint over it.

### Why the strip is NOT a title bar

ADR-020's original prose mentioned a title bar; the locked plan and this
implementation use a `contentView` strip instead. Touching
`titleBarStyle` / `setTitleBarOverlay` / the `frame` config is a Linux
CSD/SSD minefield and is explicitly out of scope.

### Profile 0 top-overlap tradeoff (deliberate)

Profile 0 (the legacy `persist:teams-4-linux` partition) runs on the **root
window's `webContents`**, not a `WebContentsView` (see
`profileViewManager.js`). It is **not** inset, so the strip overlaps its top
~40px. That region is the wrapped Teams web client's empty title-bar space (no
interactive controls), so the overlap is cosmetic.

The alternative — promoting Profile 0 to its own `WebContentsView` so it could
be inset too — was rejected: it would reroute the auth-recovery and
`msteams://` deep-link handlers off `window.webContents`, an auth-critical
change. **Do not "fix" the overlap by promoting Profile 0** without re-doing
that analysis. If Teams ever puts an interactive control in that top region,
revisit then.

## Files

| File | Role |
|------|------|
| `switcher.html` | Strip markup (pill + dropdown), strict CSP, external assets only |
| `switcher.css` | Pill/dropdown styling; system font, 4/8/12/16 spacing, 6px radius, neutral gray + per-profile `avatarColor`, dark mode via `prefers-color-scheme` |
| `switcher.js` | Renderer logic: paint pill, build dropdown, switch/add/manage, expand/collapse, subscribe to state pushes |
| `preload.js` | `contextBridge` `profileSwitcherApi` (contextIsolation + sandbox) |

## IPC

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `profile-list` / `profile-get-active` / `profile-switch` | renderer→main (invoke) | **reused** existing `ProfilesManager` channels |
| `profile-switcher-open-add` | renderer→main | open the existing Add-profile dialog (handled by `Menus`) |
| `profile-switcher-open-manage` | renderer→main | open the existing Manage-profiles dialog (handled by `Menus`) |
| `profile-switcher-set-expanded` | renderer→main | grow/shrink the strip for the dropdown (handled by `ProfileViewManager`) |
| `profile-switcher-state` | main→renderer | push `{ profiles, activeId }` on any add/update/switch/remove |

All channels are allowlisted in
[`app/security/ipcValidator.js`](../security/ipcValidator.js). Everything is
gated behind `multiAccount.enabled`: with the flag off, `ProfileViewManager`
is never constructed, so the strip is never created and none of the
`profile-switcher-*` handlers are registered.
