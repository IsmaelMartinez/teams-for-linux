# Profile Notifications

Per-profile notification flags for multi-account mode
([ADR-020](../../docs-site/docs/development/adr/020-multi-account-profile-switcher.md)
Phase 2). Registered only when `multiAccount.enabled` is on.

| Flag | Effect |
|------|--------|
| `disableNotifications` | No toast from this profile, whatever the `notificationMethod`. Its unread still counts toward the tray badge and the switcher pill. |
| `muted` | No notification sound from this profile, and toasts are created `silent` so the OS plays none either. The incoming-call ring is Teams' own page audio and is not covered. |

Both live on the profile record in `ProfilesManager` and are toggled from
**Profiles → Manage profiles…**.

Incoming-call toasts follow `enableIncomingCallToast`, exactly as they do
with the global `disableNotifications`: a call is not a message
notification, and dropping it per profile would risk a missed call.

## Where the flags are enforced

In each Teams renderer, by the preload's `Notification` override
(`app/browser/preload.js`). That is the only possible gate for the default
`web` method, where Chromium shows the toast without involving main. The
`electron` method is covered by the same override passing `silent` through to
`NotificationService`, which then skips its sound.

## How a renderer learns its flags

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `profile-get-notification-flags` | renderer → main (invoke) | pull on load; main resolves the sender's profile, so a page can only read its own |
| `profile-notification-flags` | main → renderer | push to every live renderer of a profile (its view and popups) when that profile is updated |

An unattributed renderer (the root window before Profile 0 exists) gets both
flags off.
