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
| `switch(id)` | `Profile` | Throws on unknown id; emits `switch` |
| `add(record)` | `Profile` | Generates `id`, derives `partition`, validates `name`; emits `add` |
| `update(id, patch)` | `Profile` | Drops `id` / `partition` from the patch; emits `update` |
| `remove(id)` | `{ removedId, activeId }` | Falls back to first remaining profile (or null) when removing the active one; emits `remove` |
| `bootstrapLegacyProfile(name?)` | `Profile` | **Main-process only.** Creates Profile 0 against `persist:teams-4-linux` so the user's existing login survives the first flag flip (ADR-020 § "First-run bootstrap"). Throws if any profile already exists. Not exposed via IPC — a renderer being able to point a profile at an arbitrary partition string would let it hijack any session. |

## Lifecycle hooks

`ProfilesManager` is a small in-process `EventEmitter`. Main-side consumers
(`ProfileViewManager`, the future menu builder) subscribe via `on()` /
`off()`:

| Event | Payload |
|---|---|
| `add` | `Profile` |
| `update` | `Profile` |
| `switch` | `Profile` |
| `remove` | `{ removedId, activeId }` |

The events are local to the main process — they do not change the IPC
surface and do not require allowlisting.

## IPC channels (six, allowlisted)

| Channel | Args | Returns |
|---|---|---|
| `profile-list` | — | `Profile[]` |
| `profile-get-active` | — | `Profile \| null` |
| `profile-switch` | `id` | `Profile` |
| `profile-add` | `record` | `Profile` |
| `profile-update` | `id, patch` | `Profile` |
| `profile-remove` | `id` | `{ removedId, activeId }` |

## What 1c.1 does **not** do

- No switcher UI, no Profiles menu entry, no `Ctrl+Shift+1…5` shortcuts —
  those land in Phase 1c.2 alongside the renderer dialogs.
- No screen-preview-partition swap, no `CustomBackground` instance
  refactor, no `cleanExpiredAuthCookies` rework — those are Phase 1c.3
  cleanups.

## Companion modules

- `app/mainAppWindow/profileViewManager.js` (Phase 1c.1) — owns the
  per-profile `WebContentsView` overlays and the first-run bootstrap. It
  subscribes to the events documented above so any future caller of
  `add` / `switch` / `remove` (including the upcoming switcher UI) keeps
  the view set in sync without extra wiring.
- `app/login/index.js` (landed in Phase 1b) — migrates the login
  retry-state from a module-level boolean to a per-`webContents` `WeakMap`
  so a switch mid-401 does not look like a retry on the previous profile.
