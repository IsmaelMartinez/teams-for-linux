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

Nest an option under an object when any of these hold: three or more options relate to one feature, options share a common prefix, an option only matters when a sibling gate is enabled, or the options describe a single conceptual feature. Dependent options always nest under their gate (for example `mqtt.brokerUrl` under `mqtt.enabled`).

Boolean feature gates use positive naming: the leaf is `enabled`, never a `disable*` name. Escape-hatch switches whose entire purpose is to turn a platform behaviour off (`disableGpu`, `disableTimestampOnCopy`, the shipped `network.disableQuic`) keep their negative names, because inverting them would make the workaround semantics less obvious; the positive rule targets feature gates.

Spell words out rather than abbreviating (`customBackground`, not `customBG`), and rely on the nesting to keep full names short (`tray.enabled` rather than `trayIconEnabled`).

### Resolved rename mapping

The table maps every currently flat option to its nested target. Four renames invert a boolean's meaning, marked in the Inverted column; any future migration tooling must negate the value for these, not copy it. The `notifications`, `idleDetection`, and `network` targets are shipped nested objects with unrelated existing leaves (`notifications` holds `timeoutType` and `electron.clickAction`, `idleDetection` holds `forceState` and `stateFile`, `network` holds `webRTCIPHandlingPolicy` and `disableQuic`); merging the renamed options into those occupied namespaces is intentional, and the leaf keys below were checked against the shipped fields with no collisions.

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
| `disableBadgeCount` | `notifications.badgeCount` | Yes |
| `notificationMethod` | `notifications.method` | |
| `defaultNotificationUrgency` | `notifications.urgency` | |
| `enableIncomingCallToast` | `incomingCalls.toast` | |
| `incomingCallCommand` | `incomingCalls.command` | |
| `incomingCallCommandArgs` | `incomingCalls.commandArgs` | |
| `awayOnSystemIdle` | `idleDetection.setAwayOnIdle` | |
| `appIdleTimeout` | `idleDetection.timeout` | |
| `appIdleTimeoutCheckInterval` | `idleDetection.checkInterval.idle` | |
| `appActiveCheckInterval` | `idleDetection.checkInterval.active` | |
| `authServerWhitelist` | `auth.serverWhitelist` | |
| `ssoBasicAuthUser` | `auth.basic.user` | |
| `ssoBasicAuthPasswordCommand` | `auth.basic.passwordCommand` | |
| `clientCertPath` | `auth.clientCertificate.path` | |
| `clientCertPassword` | `auth.clientCertificate.password` | |
| `customCACertsFingerprints` | `auth.customCACertsFingerprints` | |
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
| `clearStorageData` | `storage.clearStorageData` | |
| `webDebug` | `development.webDebug` | |
| `watchConfigFile` | `development.watchConfigFile` | |
| `chromeUserAgent` | `platform.chromeUserAgent` | |
| `emulateWinChromiumPlatform` | `platform.emulateWinChromiumPlatform` | |
| `spellCheckerLanguages` | `platform.spellCheckerLanguages` | |
| `disableTimestampOnCopy` | `platform.disableTimestampOnCopy` | |

Notes on specific rows. `disableGlobalShortcuts` is an array of accelerators to disable while the app is focused, not a boolean, so the rename clarifies rather than inverts. `disableBadgeCount` and `minimizeOnClose` had no target in the research mapping and are decided here: `notifications.badgeCount` (inverted, following the other notification booleans) and `window.minimizeOnClose`. There is a semantic overlap between `minimizeOnClose` and `closeAppOnCross`, both of which change what the close cross does and the former of which is ignored when the latter is true; that overlap is recorded here as an observation, and collapsing the two into one option is out of scope for this ADR. `clientCertPath` and `clientCertPassword` target `auth.clientCertificate.*` rather than the research doc's `auth.certificate.*`, because `auth.clientCertificate.pinDialog.enabled` has since shipped (ADR-024) and two adjacent certificate namespaces would be worse than either. Finally, `auth.basic.*` is distinct from the shipped `auth.webLogin.user` and `auth.webLogin.passwordCommand` despite the similar leaf names: `auth.basic.*` feeds Electron's HTTP Basic/NTLM `login` dialog for proxy and intranet challenges, while `auth.webLogin.*` pre-fills the Microsoft web sign-in form. They are different flows and both remain.

## Alternatives Considered

### Re-parenting shipped nested objects

The research mapping also moved three already-nested objects to new parents: `cacheManagement` to `storage.cacheManagement`, `logConfig` to `development.logConfig`, and `msTeamsProtocols` to `urlHandling.msTeamsProtocols`. Rejected: these options are already discoverable, correctly grouped objects, and renaming a working nested namespace to another nested namespace breaks every existing user config for zero discoverability gain, which is pure churn. A consequence is that the `storage` and `development` namespaces start smaller than the research envisioned (`storage` initially holds only `clearStorageData`), which is acceptable.

### Runtime aliasing of old names

Keeping flat names working forever via an alias layer was rejected by the original research and stays rejected; the project precedent is hard removal after a deprecation window, as with `ssoInTuneEnabled` and its siblings (`app/intune/README.md`).

## Consequences

### Positive

Contributors have one canonical answer for what a new option must be called and where an existing flat option will land, without reading a 1600-line research document. The mapping is stable enough for tooling to consume: the delivery vehicle is additive `renamedTo` metadata on the flat entries in `app/config/options.js`, surfaced in the generated docs and as `app/config/validator.js` startup warnings, landing in a separate follow-up PR.

### Negative

The four inverted renames mean a naive key-copy migration would silently flip user intent, so any future tooling must consult the Inverted column. Until `renamedTo` metadata ships, this table is maintained by hand and can drift from `app/config/options.js`.

### Neutral

Runtime aliasing and an automated `--migrate-config` codemod remain explicitly deferred; renames continue to happen opportunistically, module by module, with `renamedTo` metadata as the only committed mechanism. The merges into `notifications`, `idleDetection`, and `network` mean those objects will mix long-shipped and newly-arrived leaves, which is intentional.

## Related

- [ADR-024](024-smartcard-pkcs11-pin-dialog.md): shipped the `auth.clientCertificate` namespace this ADR aligns with
- Roadmap: [Config Schema as Single Source of Truth](../plan/roadmap.md) (#2597), where `renamedTo` metadata and the settings window are tracked
- [Documentation, Contributing, and Config UX research](../research/documentation-and-config-ux-research.md), which builds on this convention
- `app/config/options.js` and `docs-site/static/config-schema.json`, the live inventory
- Research history: see git history for `docs-site/docs/development/research/configuration-organization-research.md`
