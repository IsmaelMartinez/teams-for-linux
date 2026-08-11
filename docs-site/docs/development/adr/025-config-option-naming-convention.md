---
id: 025-config-option-naming-convention
---

# ADR 025: Configuration Option Naming Convention

## Status

✅ Accepted (2026-08-11)

## Context

The configuration organization research (started 2025-11-09, formerly at `docs-site/docs/development/research/configuration-organization-research.md`, now deleted with git history preserving the full investigation) audited the flat yargs-based configuration and found related options scattered across categories, a mix of negative (`disableNotifications`) and positive (`trayIconEnabled`) naming, inconsistent abbreviations (`customBGServiceBaseUrl` next to `isCustomBackgroundEnabled`), and no clear rule for when a group of options should become a nested object. The research settled a naming convention and a target nested layout, and its 2026-01-18 conclusion rejected any coordinated big-bang migration in favour of incremental evolution: new features use nested keys from day one, and existing flat options migrate opportunistically when their modules are refactored.

That decision has been operating for months. Several options the research tracked as deprecated (`screenSharingThumbnail`, `screenLockInhibitionMethod`, `videoMenu`, `ssoInTuneEnabled`, `ssoInTuneAuthUser`, flat `disableAutogain`) have since been removed outright, and the precedent is hard removal rather than long-lived aliasing (see `app/intune/README.md`). As of this ADR, `app/config/options.js` declares 72 top-level options, of which 17 are object-typed with `fields` metadata and 55 remain flat; `docs-site/static/config-schema.json` is the generated source of truth for the live inventory. This ADR closes the research document by extracting its two load-bearing artifacts, the convention and the resolved rename mapping, and resolving the conflicts that have accumulated between the research-era mapping and what has actually shipped.

## Decision

### Naming convention

Rule zero: new options are always nested. The flat top-level namespace is closed to new additions. Before naming anything, check `docs-site/static/config-schema.json` (or `app/config/options.js`) for an existing namespace that already owns your feature area and add your leaf there; create a new parent object only when no existing namespace fits.

Nest an option under an object when any of these hold: three or more options relate to one feature, options share a common prefix, an option only matters when a sibling gate is enabled, or the options describe a single conceptual feature. Dependent options always nest under their gate (for example `mqtt.brokerUrl` under `mqtt.enabled`).

Master feature gates use positive naming: the gate leaf is `enabled`, never a `disable*` name. A boolean gate earns its own object with an `enabled` leaf only when it has dependent sibling options; a standalone boolean inside a namespace uses a positive `<feature>Enabled`-style leaf instead. Both forms have shipped: `media.camera.resolution.enabled` gates its dependent `mode`, `width`, and `height` siblings, while `media.video.menuEnabled` stands alone. Escape-hatch switches whose entire purpose is to turn a platform behaviour off (`disableGpu`, `disableTimestampOnCopy`, the shipped `network.disableQuic`) keep their negative names, because inverting them would make the workaround semantics less obvious; the positive rule targets feature gates. A few shipped nested leaves (`media.microphone.disableAutogain`, `media.preventDeviceSwitching`) carry negative names that predate this ADR and are not precedent.

Spell words out rather than abbreviating (`customBackground`, not `customBG`), and rely on the nesting to keep full names short (`tray.enabled` rather than `trayIconEnabled`).

### Resolved rename mapping

The table maps every currently flat option to its nested target. Four renames invert a boolean's meaning, marked in the Inverted column; any future migration tooling must negate the value for these, not copy it. A blank Inverted cell means the value is copied unchanged. As a worked example of an inversion, `disableNotifications: true` becomes `notifications.enabled: false`; the defaults are behaviour-preserving under inversion (`disableNotifications` defaults to `false`, so `notifications.enabled` will default to `true`).

None of these nested targets are implemented yet. The flat names on the left are the only names the app accepts today, and applying this table to a config file now will cause those keys to be ignored with a startup warning. When a rename does ship, the flat name remains supported until `renamedTo` metadata and migration tooling ship alongside it, and removal happens only after a deprecation window announced in the release notes.

The `notifications`, `idleDetection`, `network`, and `auth` targets are shipped nested objects with unrelated existing leaves (`notifications` holds `timeoutType` and `electron.clickAction`, `idleDetection` holds `forceState` and `stateFile`, `network` holds `webRTCIPHandlingPolicy` and `disableQuic`, `auth` holds the `intune`, `webauthn`, `reauthRecovery`, `clientCertificate`, `webLogin`, and `keepMsalCacheEncryptionCookie` groups); merging the renamed options into those occupied namespaces is intentional, and the leaf keys below were checked against the shipped fields with no collisions.

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

Notes on specific rows. `disableGlobalShortcuts` is an array of accelerators to disable while the app is focused, not a boolean, so the rename clarifies rather than inverts. `disableNotificationSoundIfNotAvailable` is not inverted either: `true` already means the sound plays only while the user's status is Available, which is exactly what `onlyWhenAvailable: true` means. The `idleDetection.checkInterval` leaves are named for what the poll detects, because the live code (`app/browser/notifications/activityManager.js`) uses `appIdleTimeoutCheckInterval` as the poll interval while the user is active (watching for idle onset) and `appActiveCheckInterval` while idle (watching for the return to activity); plain `.idle`/`.active` leaves would plausibly be wired backwards, and `app/idle/README.md` documented these two backwards until it was corrected alongside this ADR. `awayOnSystemIdle` targets `idleDetection.setAwayOnIdle` rather than an `enabled` gate because `idleDetection` ships as an always-on object with no master switch. `authServerWhitelist` lands at `auth.serverWhitelist`, outside `auth.basic`, because it is the Negotiate/NTLM server allowlist rather than a credential. `disableBadgeCount` and `minimizeOnClose` had no target in the research mapping and are decided here: `notifications.badgeCountEnabled` (inverted, and carrying the `Enabled` suffix because a boolean named plain `badgeCount` would read as a number) and `window.minimizeOnClose`. `storage.clearData` corresponds to Electron's session `clearStorageData` API; the namespace supplies the word storage, and repeating it in the leaf would recreate the stutter the convention avoids. There is a semantic overlap between `minimizeOnClose` and `closeAppOnCross`, both of which change what the close cross does and the former of which is ignored when the latter is true; that overlap is recorded here as an observation, and collapsing the two into one option is out of scope for this ADR. `clientCertPath` and `clientCertPassword` target `auth.clientCertificate.*` rather than the research doc's `auth.certificate.*`, because `auth.clientCertificate.pinDialog.enabled` has since shipped (ADR-024) and two adjacent certificate namespaces would be worse than either. Finally, `auth.basic.*` is distinct from the shipped `auth.webLogin.user` and `auth.webLogin.passwordCommand` despite the similar leaf names: `auth.basic.*` feeds Electron's HTTP Basic/NTLM `login` dialog for proxy and intranet challenges, while `auth.webLogin.*` pre-fills the Microsoft web sign-in form. They are different flows and both remain.

## Alternatives Considered

### Re-parenting shipped nested objects

The research mapping also moved three already-nested objects to new parents: `cacheManagement` to `storage.cacheManagement`, `logConfig` to `development.logConfig`, and `msTeamsProtocols` to `urlHandling.msTeamsProtocols`. Rejected: these options are already discoverable, correctly grouped objects, and renaming a working nested namespace to another nested namespace breaks every existing user config for zero discoverability gain, which is pure churn. A consequence is that the `storage` and `development` namespaces start smaller than the research envisioned (`storage` initially holds only `clearData`), which is acceptable.

### Runtime aliasing of old names

Keeping flat names working forever via an alias layer was rejected by the original research and stays rejected; the project precedent is hard removal after a deprecation window, as with `ssoInTuneEnabled` and its siblings (`app/intune/README.md`).

## Consequences

### Positive

Contributors have one canonical answer for what a new option must be called and where an existing flat option will land, without reading a 1600-line research document. The mapping is stable enough for tooling to consume: the delivery vehicle is additive `renamedTo` metadata on the flat entries in `app/config/options.js` (a field on a flat option's declaration pointing at its nested successor; new options never need it), surfaced in the generated docs and as `app/config/validator.js` startup warnings, tracked on the roadmap.

### Negative

The four inverted renames mean a naive key-copy migration would silently flip user intent, so any future tooling must consult the Inverted column. Until `renamedTo` metadata ships, this table is maintained by hand and can drift from `app/config/options.js`.

### Neutral

Runtime aliasing and an automated `--migrate-config` codemod remain explicitly deferred; renames continue to happen opportunistically, module by module, with `renamedTo` metadata as the only committed mechanism. The merges into `notifications`, `idleDetection`, `network`, and `auth` mean those objects will mix long-shipped and newly-arrived leaves, which is intentional.

## Related

- [ADR-024](024-smartcard-pkcs11-pin-dialog.md): shipped the `auth.clientCertificate` namespace this ADR aligns with
- Roadmap: [Config Schema as Single Source of Truth](../plan/roadmap.md) (#2597), where `renamedTo` metadata and the settings window are tracked
- [Documentation, Contributing, and Config UX research](../research/documentation-and-config-ux-research.md), which builds on this convention
- `app/config/options.js` and `docs-site/static/config-schema.json`, the live inventory
- Research history: see git history for `docs-site/docs/development/research/configuration-organization-research.md`
