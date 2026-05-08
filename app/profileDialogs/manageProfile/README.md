# Manage Profile Dialog

Modal `BrowserWindow` opened from the **Profiles → Manage…** menu entry
when `multiAccount.enabled === true`. Lets the user rename existing
profiles inline and remove them (with native confirmation).

## Files

| File                 | Role                                                                        |
| -------------------- | --------------------------------------------------------------------------- |
| `index.js`           | `ManageProfileDialog` class — owns the BrowserWindow lifecycle and IPC.     |
| `manageProfile.html` | Markup for the list view + close button.                                    |
| `manageProfile.css`  | Styling, including dark-mode via `prefers-color-scheme`.                    |
| `manageProfile.js`   | Renderer-side row rendering, inline rename, remove click handling.          |
| `preload.js`         | `contextBridge` exposing `manageProfileApi.{rename,remove,close,onState,onError}`. |

## IPC channels

| Channel                  | Direction         | Payload                                          |
| ------------------------ | ----------------- | ------------------------------------------------ |
| `manage-profile-rename`  | renderer → main   | `{ id, name }`                                   |
| `manage-profile-remove`  | renderer → main   | `id` (main shows the destructive confirmation)   |
| `manage-profile-close`   | renderer → main   | _none_                                           |
| `manage-profile-state`   | main → renderer   | `{ profiles, activeId }`                         |
| `manage-profile-error`   | main → renderer   | `string` (validation / operation failure)        |

The `manage-profile-state` payload is pushed on first-show and on every
`add` / `remove` / `switch` / `update` event from `ProfilesManager`, so
the dialog stays in sync with mutations from other sources (Add-profile
dialog, Switch-to submenu, etc.).

The renderer-→-main channels follow the same single-instance dispatch
pattern as `JoinMeetingDialog` and `AddProfileDialog` — `ipcMain.on`
listeners are registered exactly once and route through whichever dialog
is currently visible.

## Lifecycle

1. `Menus.manageProfiles()` calls `manageProfileDialog.show()`.
2. The dialog window is created lazily on first `show()`; subsequent calls
   reuse the same `BrowserWindow` and just `show()`/`focus()` it. The
   `manage-profile-state` push happens on both first-show and re-show.
3. **Rename**:
   - Renderer trims the input and validates non-empty client-side.
   - On Enter / blur, the renderer sends `manage-profile-rename`.
   - Main calls `ProfilesManager.update({ id, name })`. Server-side
     validation (`#applyName`) trims and rejects empty.
   - On success, `ProfilesManager` emits `update` → dialog re-pushes state.
   - On failure, main sends `manage-profile-error` back to the renderer.
4. **Remove**:
   - Renderer click sends `manage-profile-remove`.
   - Main shows a native `dialog.showMessageBoxSync` warning (ADR-020
     § "Remove a profile" wording, verbatim).
   - On confirm, main calls `ProfilesManager.remove(id)`. The
     `ProfileViewManager.#destroyView` listener (already wired in 1c.1)
     destroys the `WebContentsView` and clears the partition's storage.
5. On `manage-profile-close` or window-`closed`, the dialog tears down its
   `ProfilesManager` event subscriptions and the next `show()` recreates
   the window.

## Why this is gated on `multiAccount.enabled`

`Menus` only instantiates `ManageProfileDialog` when `multiAccount.enabled
=== true`. With the flag off, the **Profiles** menu entry itself is
absent (see `app/menus/appMenu.js`), so there is no surface that could
call into the dialog. Keeping the gate here prevents allocating an extra
`BrowserWindow`-managing object for users who never use multi-account.

## Active and last-remaining guards

ADR-020 § "Remove a profile" requires that the active profile and the
last remaining profile cannot be removed; the UI disables the action
with a tooltip explaining why. `ProfilesManager.remove(id)` does **not**
enforce these rules — it auto-promotes the next profile in the list to
active, and accepts removing the last profile. This is intentional: the
backend stays simple and the UX rule lives next to the UX (this dialog).
The renderer disables and tooltips the Remove button accordingly.
