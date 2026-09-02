# Background Portal

Bare-minimum integration with `org.freedesktop.portal.Background`
(issue [#2815](https://github.com/IsmaelMartinez/teams-for-linux/issues/2815)).

On startup, when running inside a Flatpak sandbox (`FLATPAK_ID` set), the
module calls `RequestBackground` with a static reason and, when the portal is
version 2 or newer and the request is granted, `SetStatus` with a short
status line. Everything is fire-and-forget over the session D-Bus using
`@homebridge/dbus-native`; failures degrade to log lines.

What this does and does not change:

- GNOME's Background Apps menu (GNOME 44+) already lists windowless Flatpak
  apps automatically; this module is not what makes the app appear there.
- `RequestBackground` records the background permission, which stops the
  recurring "running in the background" prompt. If a user picked Forbid, the
  portal SIGKILLs the app whenever it runs windowless; that is portal policy,
  not something the app controls.
- `SetStatus` adds the "Running in background" line under the entry.
- Native, deb, AppImage and snap installs are unaffected: the portal's
  background monitor only tracks Flatpak instances and `SetStatus` rejects
  host callers.
- Autostart is left exactly as the user set it. `RequestBackground` conflates
  background permission with autostart management, and the portal reads a
  missing `autostart` option as an explicit `false`, so it unlinked
  `~/.config/autostart/<app-id>.desktop` on every launch
  ([#2936](https://github.com/IsmaelMartinez/teams-for-linux/issues/2936)).
  There is no way to opt out of that, so the module reads the user's current
  entry and sends the same state back, passing `commandline` from the existing
  `Exec` so a customised launch command survives the portal's rewrite. The app
  has no autostart feature of its own and does not enable it for anyone.

Diagnostic log lines (no PII): portal version, `RequestBackground`
response code (0 granted, 1 dismissed, 2 error), and status-set confirmation.
