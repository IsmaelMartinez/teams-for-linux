---
id: 025-config-option-naming-convention
---

# ADR 025: Configuration Option Naming Convention

## Status

✅ Accepted (2026-08-11)

## Context

The configuration organization research (started 2025-11-09, since deleted, with the Related list below pointing at its git history) audited the flat yargs-based configuration and found related options scattered across categories, negative and positive naming mixed (`disableNotifications` beside `trayIconEnabled`), inconsistent abbreviations (`customBGServiceBaseUrl` beside `isCustomBackgroundEnabled`), and no rule for when options should become a nested object. It settled a convention and a target layout, and its 2026-01-18 conclusion rejected a big-bang migration in favour of incremental evolution: new features use nested keys from day one, existing flat options migrate opportunistically as their modules are refactored. That has run for months, and several options the research tracked as deprecated have since been removed outright, making hard removal rather than long-lived aliasing the precedent (see `app/intune/README.md`). Today `app/config/options.js` declares 72 top-level options, 17 object-typed with `fields` metadata and 55 still flat, with `docs-site/static/config-schema.json` the generated source of truth.

## Decision

### Naming convention

Rule zero: new options are always nested, and the flat top-level namespace is closed to additions. First check `docs-site/static/config-schema.json` (or `app/config/options.js`) for a namespace that already owns your feature area and add your leaf there; create a new parent only when none fits.

Nest under an object when any of these hold: three or more options relate to one feature, options share a common prefix, an option only matters when a sibling gate is enabled, or they describe a single conceptual feature. Dependents always nest under their gate (`mqtt.brokerUrl` under `mqtt.enabled`).

Master feature gates use positive naming: the gate leaf is `enabled`, never a `disable*` name, and a gate earns its own object only when it has dependent siblings; a standalone boolean uses a positive `<feature>Enabled`-style leaf instead. Both forms ship today: `media.camera.resolution.enabled` gates its `mode`, `width` and `height` siblings, while `media.video.menuEnabled` stands alone. Escape hatches that exist purely to switch a platform behaviour off (`disableGpu`, `disableTimestampOnCopy`, `network.disableQuic`) keep negative names, since inverting them obscures the workaround. A few shipped leaves (`media.microphone.disableAutogain`, `media.preventDeviceSwitching`) carry negative names predating this ADR and are not precedent.

Spell words out rather than abbreviating (`customBackground`, not `customBG`), and rely on the nesting to keep full names short (`tray.enabled` rather than `trayIconEnabled`).

### Resolved rename mapping

The table maps every flat option to its nested target. Four renames invert a boolean, marked in the Inverted column, so tooling must negate those values rather than copy them; a blank cell means copy unchanged. For example `disableNotifications: true` becomes `notifications.enabled: false`, and defaults stay behaviour-preserving under inversion (`disableNotifications` defaults to `false`, so `notifications.enabled` defaults to `true`).

None of these nested targets are implemented yet. The flat names on the left are the only names the app accepts today, and applying this table to a config file now will get those keys ignored with a startup warning. When a rename does ship, the old name will not disappear silently: it produces a startup warning and the change is announced in the release notes. Whether it also keeps applying for a deprecation window, or stops taking effect the day the rename lands, is still being decided in [#2841](https://github.com/IsmaelMartinez/teams-for-linux/issues/2841), where immediate removal is one of the live outcomes. That decision must be settled before the first rename.

The `notifications`, `idleDetection`, `network` and `auth` targets are shipped objects that already hold unrelated leaves; merging renamed options into them is intentional, and every leaf key below was checked against the shipped fields with no collisions.

| Flat option | Nested target | Inverted |
|-------------|---------------|----------|
| `appTitle` | `app.title` | |
| `url` | `app.url` | |
| `partition` | `app.partition` | |
| `frame` | `window.frame` | |
| `menubar` | `window.menubar` | |
| `minimized` | `window.minimized` | |
| `closeAppOnCross` | `window.closeOnCross` | |
| `minimizeOnClose` | `window.minimizeOnClose` | |
| `alwaysOnTop` | `window.alwaysOnTop` | |
| `class` | `window.class` | |
| `customCSSName` | `appearance.cssName` | |
| `customCSSLocation` | `appearance.cssLocation` | |
| `followSystemTheme` | `appearance.followSystemTheme` | |
| `trayIconEnabled` | `tray.enabled` | |
| `appIcon` | `tray.icon` | |
| `appIconType` | `tray.iconType` | |
| `useMutationTitleLogic` | `tray.useMutationTitleLogic` | |
| `disableNotifications` | `notifications.enabled` | Yes |
| `disableNotificationSound` | `notifications.sound.enabled` | Yes |
| `disableNotificationSoundIfNotAvailable` | `notifications.sound.onlyWhenAvailable` | |
| `disableNotificationWindowFlash` | `notifications.windowFlash` | Yes |
| `disableBadgeCount` | `notifications.badgeCountEnabled` | Yes |
| `notificationMethod` | `notifications.method` | |
| `defaultNotificationUrgency` | `notifications.urgency` | |
| `enableIncomingCallToast` | `incomingCalls.toast` | |
| `incomingCallCommand` | `incomingCalls.command` | |
| `incomingCallCommandArgs` | `incomingCalls.commandArgs` | |
| `awayOnSystemIdle` | `idleDetection.setAwayOnIdle` | |
| `appIdleTimeout` | `idleDetection.timeout` | |
| `appIdleTimeoutCheckInterval` | `idleDetection.checkInterval.detectIdle` | |
| `appActiveCheckInterval` | `idleDetection.checkInterval.detectActive` | |
| `authServerWhitelist` | `auth.serverWhitelist` | |
| `ssoBasicAuthUser` | `auth.basic.user` | |
| `ssoBasicAuthPasswordCommand` | `auth.basic.passwordCommand` | |
| `clientCertPath` | `auth.clientCertificate.path` | |
| `clientCertPassword` | `auth.clientCertificate.password` | |
| `customCACertsFingerprints` | `auth.customCACertificateFingerprints` | |
| `proxyServer` | `network.proxyServer` | |
| `isCustomBackgroundEnabled` | `customBackground.enabled` | |
| `customBGServiceBaseUrl` | `customBackground.serviceBaseUrl` | |
| `customBGServiceConfigFetchInterval` | `customBackground.configFetchInterval` | |
| `defaultURLHandler` | `urlHandling.defaultHandler` | |
| `meetupJoinRegEx` | `urlHandling.meetupJoinRegEx` | |
| `onNewWindowOpenMeetupJoinUrlInApp` | `urlHandling.openMeetupJoinInApp` | |
| `globalShortcuts` | `shortcuts.global` | |
| `disableGlobalShortcuts` | `shortcuts.disableWhileFocused` | |
| `disableGpu` | `performance.disableGpu` | |
| `electronCLIFlags` | `performance.electronCLIFlags` | |
| `clearStorageData` | `storage.clearData` | |
| `webDebug` | `development.webDebug` | |
| `watchConfigFile` | `development.watchConfigFile` | |
| `chromeUserAgent` | `platform.chromeUserAgent` | |
| `emulateWinChromiumPlatform` | `platform.emulateWindowsChromium` | |
| `spellCheckerLanguages` | `platform.spellCheckerLanguages` | |
| `disableTimestampOnCopy` | `platform.disableTimestampOnCopy` | |

Notes on specific rows. `disableGlobalShortcuts` is an array of accelerators to disable while the app is focused, not a boolean, so its rename clarifies rather than inverts. `disableNotificationSoundIfNotAvailable` is not inverted either: `true` already means the sound plays only while status is Available, exactly what `onlyWhenAvailable: true` means. The `idleDetection.checkInterval` leaves are named for what each poll detects: `app/browser/notifications/activityManager.js` uses `appIdleTimeoutCheckInterval` while active (watching for idle onset) and `appActiveCheckInterval` while idle (watching for the return to activity); plain `.idle` and `.active` would plausibly be wired backwards, and `app/idle/README.md` documented the pair backwards until corrected alongside this ADR. `awayOnSystemIdle` targets `idleDetection.setAwayOnIdle` rather than an `enabled` gate because `idleDetection` ships as an always-on object with no master switch.

`disableBadgeCount` and `minimizeOnClose` had no target in the research mapping and are decided here as `notifications.badgeCountEnabled` (inverted, suffixed because a plain `badgeCount` boolean reads as a number) and `window.minimizeOnClose`. `minimizeOnClose` overlaps semantically with `closeAppOnCross`, both changing what the close cross does, and is ignored when `closeAppOnCross` is true; that is an observation only, and collapsing them is out of scope. `storage.clearData` corresponds to Electron's session `clearStorageData` API, the namespace supplying the word storage the leaf would otherwise stutter.

On the `auth` rows, `authServerWhitelist` lands at `auth.serverWhitelist` outside `auth.basic`, being the Negotiate/NTLM server allowlist rather than a credential. `clientCertPath` and `clientCertPassword` target `auth.clientCertificate.*` rather than the research doc's `auth.certificate.*`, since `auth.clientCertificate.pinDialog.enabled` has shipped (ADR-024) and two adjacent certificate namespaces would be worse. `auth.basic.*` stays distinct from the shipped `auth.webLogin.user` and `auth.webLogin.passwordCommand` despite similar leaf names: `auth.basic.*` feeds Electron's HTTP Basic/NTLM `login` dialog for proxy and intranet challenges, `auth.webLogin.*` pre-fills the Microsoft web sign-in form. Both remain.

## Alternatives Considered

### Re-parenting shipped nested objects

The research mapping also re-parented three already-nested objects: `cacheManagement` to `storage.cacheManagement`, `logConfig` to `development.logConfig`, `msTeamsProtocols` to `urlHandling.msTeamsProtocols`. Rejected: these are already discoverable, correctly grouped objects, and re-parenting a working namespace breaks every existing user config for zero gain, which is pure churn. The `storage` and `development` namespaces therefore start smaller than envisioned (`storage` initially holds only `clearData`), acceptably so.

### Runtime aliasing of old names

An alias layer keeping flat names working forever was rejected by the original research and stays rejected; the precedent is hard removal after a deprecation window, as with `ssoInTuneEnabled` and its siblings (`app/intune/README.md`). That rejection is about a permanent layer. Whether a time-boxed fallback reads the old key for one deprecation window is a separate question and is open in [#2841](https://github.com/IsmaelMartinez/teams-for-linux/issues/2841).

## Consequences

### Positive

Contributors get one canonical answer for naming a new option and for where an existing flat option will land, without reading a 1600-line research document. The mapping is stable enough for tooling to consume once a migration mechanism is chosen, and that choice is deliberately left open here and tracked in [#2841](https://github.com/IsmaelMartinez/teams-for-linux/issues/2841). One candidate already exists in the codebase and is worth evaluating first: yargs' own `deprecated` field, which `checkUsedDeprecatedValues` in `app/config/index.js` reads on every startup, warning for any deprecated key present in the config file, system-wide or user, and which no option declares yet. On its own it only warns, since it neither maps an old name to its successor nor handles the four inversions, so it covers part of the problem rather than all of it.

### Negative

The four inversions mean a naive key-copy migration would silently flip user intent, so tooling must consult the Inverted column. This table is hand-maintained and can drift from `app/config/options.js` until something pins the two together in code.

### Neutral

A permanent alias layer and a `--migrate-config` codemod stay deferred, renames proceed namespace by namespace as tracked in [#2842](https://github.com/IsmaelMartinez/teams-for-linux/issues/2842), and the four occupied namespaces will mix long-shipped and newly-arrived leaves.

## Related

- [ADR-024](024-smartcard-pkcs11-pin-dialog.md): shipped the `auth.clientCertificate` namespace this ADR aligns with
- Roadmap: [Config Schema as Single Source of Truth](../plan/roadmap.md) (#2597), where the in-app settings window is tracked
- [#2841](https://github.com/IsmaelMartinez/teams-for-linux/issues/2841), the deprecation window decision that must precede the first rename, and [#2842](https://github.com/IsmaelMartinez/teams-for-linux/issues/2842), which tracks the migration itself
- [Documentation, Contributing, and Config UX research](../research/documentation-and-config-ux-research.md), which builds on this convention
- `app/config/options.js` and `docs-site/static/config-schema.json`, the live inventory
- Research history: see git history for `docs-site/docs/development/research/configuration-organization-research.md`
