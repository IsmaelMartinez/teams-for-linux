# Profiles Manager

Phase 1b foundation for the multi-account profile switcher described in
[ADR-020](../../docs-site/docs/development/adr/020-multi-account-profile-switcher.md).

This module owns persistence and CRUD for profile records. UI wiring
(`WebContentsView` creation, switcher dropdown, `Profiles` menu entry,
`Ctrl+Shift+1…5` shortcuts, first-run Profile 0 bootstrap) lands in later
phases — this module exposes the data surface those phases call.

## Activation

The IPC surface is registered only when `multiAccount.enabled === true` in
`config.json`. With the flag off, the module is not instantiated and the
six channels below are allowlisted but unanswered. ADR-020's invariant —
byte-identical pre-feature behavior when the flag is off — is preserved.

## Storage

Records live in `settingsStore` (electron-store, `settings.json`) under
`app.profiles`:

```json
{
  "app": {
    "profiles": {
      "list": [
        {
          "id": "11111111-2222-3333-4444-555555555555",
          "name": "My account",
          "partition": "persist:teams-profile-11111111-...",
          "avatarColor": "hsl(217, 65%, 45%)",
          "avatarInitials": "MA",
          "disableNotifications": false,
          "muted": false,
          "pinned": false
        }
      ],
      "activeId": "11111111-2222-3333-4444-555555555555"
    }
  }
}
```

`id` and `partition` are immutable for the lifetime of the profile;
`update()` ignores attempts to change them.

## API

| Method | Returns | Notes |
|---|---|---|
| `list()` | `Profile[]` | Empty array if nothing configured |
| `getActive()` | `Profile \| null` | |
| `switch(id)` | `Profile` | Throws on unknown id |
| `add(record)` | `Profile` | Generates `id`, derives `partition`, validates `name` |
| `update(id, patch)` | `Profile` | Drops `id` / `partition` from the patch |
| `remove(id)` | `{ removedId, activeId }` | Falls back to first remaining profile (or null) when removing the active one |

## IPC channels (six, allowlisted)

| Channel | Args | Returns |
|---|---|---|
| `profile-list` | — | `Profile[]` |
| `profile-get-active` | — | `Profile \| null` |
| `profile-switch` | `id` | `Profile` |
| `profile-add` | `record` | `Profile` |
| `profile-update` | `id, patch` | `Profile` |
| `profile-remove` | `id` | `{ removedId, activeId }` |

## What this PR explicitly does **not** do

- No `WebContentsView` creation or switching — that lands with the switcher UI.
- No first-run bootstrap of Profile 0 from the legacy
  `persist:teams-4-linux` partition. ADR-020 places that on the first
  launch *after the flag flips*; with no UI yet, there is nothing to show
  the bootstrapped profile, so the bootstrap is paired with the UI PR.
- No screen-preview-partition swap, no `CustomBackground` instance refactor,
  no `cleanExpiredAuthCookies` rework — those are part of Phase 1's
  shared-state audit and ship alongside the corresponding feature PRs.

The companion change in this PR migrates `app/login/index.js`'s module-level
`isFirstLoginTry` to a per-`webContents` `WeakMap` (ADR-020 § "Shared-state
audit", entry 1). This is preparatory: today there is one `webContents` so
the behavior is unchanged, but it removes the shared-state hazard before
profile switching can exercise it.
