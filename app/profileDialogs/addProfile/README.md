# Add Profile Dialog

Modal `BrowserWindow` opened from the **Profiles → Add profile…** menu entry
when `multiAccount.enabled === true`. Lets the user create a new profile by
entering a name (required) and optional URL override / initials / avatar
colour.

## Files

| File              | Role                                                                 |
| ----------------- | -------------------------------------------------------------------- |
| `index.js`        | `AddProfileDialog` class — owns the BrowserWindow lifecycle and IPC. |
| `addProfile.html` | Form markup.                                                         |
| `addProfile.css`  | Styling, including dark-mode via `prefers-color-scheme`.             |
| `addProfile.js`   | Renderer-side validation, button wiring, error display.              |
| `preload.js`      | `contextBridge` exposing `addProfileApi.{submit,cancel,onError}`.    |

## IPC channels

| Channel                | Direction         | Payload                       |
| ---------------------- | ----------------- | ----------------------------- |
| `add-profile-submit`   | renderer → main   | `{ name, url?, avatarInitials?, avatarColor? }` |
| `add-profile-cancel`   | renderer → main   | _none_                        |
| `add-profile-error`    | main → renderer   | `string` (validation message) |

The `add-profile-submit` payload is forwarded directly to
`ProfilesManager.add()`, which performs the authoritative validation
(required name, length caps on initials/URL/colour). Validation failures
are bounced back to the renderer via `add-profile-error` so the user can
fix the input without losing the rest of the form.

The submit/cancel channels follow the same single-instance dispatch pattern
as `JoinMeetingDialog` — `ipcMain.on` listeners are registered exactly once
and route through whichever dialog is currently visible.

## Lifecycle

1. `Menus.addProfile()` calls `addProfileDialog.show()`.
2. The dialog window is created lazily on first `show()`; subsequent calls
   reuse the same `BrowserWindow` and just `show()`/`focus()` it.
3. On submit, `ProfilesManager.add()` is invoked from the main process,
   immediately followed by `ProfilesManager.switch()` so the user lands on
   the new profile's login flow without having to open Switch-to manually.
   Success closes the window; the resulting `add` and `switch` events fire
   through `ProfilesManager`'s emitter, causing `Menus` to rebuild the
   menu and `ProfileViewManager` to materialize and show the new profile's
   `WebContentsView` automatically.
4. On cancel or close, the dialog window is destroyed; the next `show()`
   recreates it.

## Why this is gated on `multiAccount.enabled`

`Menus` only instantiates `AddProfileDialog` when `multiAccount.enabled ===
true`. With the flag off, the **Profiles** menu entry itself is absent
(see `app/menus/appMenu.js`), so there is no surface that could call into
the dialog. Keeping the gate here prevents allocating an extra
`BrowserWindow`-managing object for users who never use multi-account.
