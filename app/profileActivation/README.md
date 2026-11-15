# Profile Activation

Multi-account only ([ADR-020](../../docs-site/docs/development/adr/020-multi-account-profile-switcher.md) Phase 2): clicking a notification switches to the profile that raised it. Without it the click lands in that profile's hidden view, and Teams opens the conversation where nobody can see it.

`createProfileActivator()` resolves the raising renderer's profile through the sender map and switches to it when it isn't already active. It never throws, because it runs inside notification and IPC callbacks.

| Notification method | How the click arrives |
|---------------------|-----------------------|
| `electron` | `NotificationService` knows the sender; it activates the profile before showing the window. `clickAction: "none"` still does nothing. |
| `custom` | `CustomNotificationManager` remembers which renderer raised each toast and activates it on click. |
| `web` (default) | Chromium handles the click inside the page, so the preload reports a trusted click on `notification-web-clicked`. Main resolves the sender, so a page can only bring its own profile forward, and `event.isTrusted` keeps page script from faking a click. |
