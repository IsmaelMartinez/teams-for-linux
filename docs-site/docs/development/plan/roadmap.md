# Development Roadmap

**Status:** Living document. Detailed per-issue and per-PR state lives in [GitHub Issues](https://github.com/IsmaelMartinez/teams-for-linux/issues), [Pull Requests](https://github.com/IsmaelMartinez/teams-for-linux/pulls), the [CHANGELOG](https://github.com/IsmaelMartinez/teams-for-linux/blob/main/CHANGELOG.md), and [ADRs](../adr/README.md). This document carries themes, principles, and parked work only.

---

## Principles

- **Validate first:** Run spikes before implementing complex features
- **Start simple:** Build MVP, add complexity only if needed
- **User-driven:** Implement Phase 2 features only when users request them
- **Linux-first:** Embrace Unix philosophy --- composable tools over monolithic features
- **Measured releases:** Accumulate meaningful changes rather than rapid incremental releases ([#2235](https://github.com/IsmaelMartinez/teams-for-linux/issues/2235))
- **Automate triage, not decisions:** Bots surface information; maintainers decide
- **Incremental configuration:** New features use nested config patterns from day one; existing flat options migrate opportunistically ([ADR-025](../adr/025-config-option-naming-convention.md))

---

## Active Themes

Current status is tracked via the linked GitHub labels. This section serves as an orientation map, not a real-time tracker.

- **Stability and Reliability**: auth recovery, network error scoping, media permission handling, drag-and-drop file uploads (restore `File.path` Electron now strips, [#2679](https://github.com/IsmaelMartinez/teams-for-linux/pull/2679)). Live: [bug](https://github.com/IsmaelMartinez/teams-for-linux/issues?q=is%3Aissue+is%3Aopen+label%3Abug).
- **Media and Calls**: camera and mic handling, speaking indicator, call drops on multi-interface systems. Live: [media](https://github.com/IsmaelMartinez/teams-for-linux/issues?q=is%3Aissue+is%3Aopen+label%3Amedia), [screen-sharing](https://github.com/IsmaelMartinez/teams-for-linux/issues?q=is%3Aissue+is%3Aopen+label%3Ascreen-sharing). Suppressing automatic audio/video device switching shipped (`media.preventDeviceSwitching`, [PR #2652](https://github.com/IsmaelMartinez/teams-for-linux/pull/2652)).
- **Downloads**: download-feedback manager shipped --- taskbar/KDE JobView progress and completion notifications ([#2512](https://github.com/IsmaelMartinez/teams-for-linux/issues/2512)). Save options `download.saveDirectory` / `download.alwaysAskWhereToSave` / `download.openWhenDone` plus a policy-block notification for M365/SharePoint-interrupted downloads shipped ([PR #2652](https://github.com/IsmaelMartinez/teams-for-linux/pull/2652)). Context-menu attachment download ("Download Attachment & Copy to Clipboard", "Save Open Document to File") through the authenticated session was closed unmerged ([PR #2654](https://github.com/IsmaelMartinez/teams-for-linux/pull/2654)); reopen if requested. Both split out of [#2645](https://github.com/IsmaelMartinez/teams-for-linux/pull/2645).
- **Linux Desktop Integration**: background portal integration for Flatpak shipped, so the sandboxed app requests background running and reports its status over `org.freedesktop.portal.Background`, with `SetStatus` used where the portal is v2 or newer ([#2815](https://github.com/IsmaelMartinez/teams-for-linux/issues/2815), [PR #2826](https://github.com/IsmaelMartinez/teams-for-linux/pull/2826)). Live: [flatpak](https://github.com/IsmaelMartinez/teams-for-linux/issues?q=is%3Aissue+is%3Aopen+label%3Aflatpak).
- **macOS Desktop Integration**: presence-status overlay on the Dock icon (`media.showStatusOnDockIcon`) and opt-out Apple-Silicon rendering/performance switches (`media.macPerformanceMode`, larger V8 heap gated to arm64) shipped ([PR #2653](https://github.com/IsmaelMartinez/teams-for-linux/pull/2653)).
- **Wayland Compatibility**: ozone-platform default reset under community testing ([#2508](https://github.com/IsmaelMartinez/teams-for-linux/issues/2508)). Live: [wayland](https://github.com/IsmaelMartinez/teams-for-linux/issues?q=is%3Aissue+is%3Aopen+label%3Awayland).
- **MQTT Integration**: presence, media state, screen-share topics shipped. Home Assistant auto-discovery shipped ([PR #2464](https://github.com/IsmaelMartinez/teams-for-linux/pull/2464), [PR #2571](https://github.com/IsmaelMartinez/teams-for-linux/pull/2571)). Microphone state shipped ([PR #2497](https://github.com/IsmaelMartinez/teams-for-linux/pull/2497)). Incoming-call topic shipped ([PR #2572](https://github.com/IsmaelMartinez/teams-for-linux/pull/2572)). Camera topic shipped ([PR #2582](https://github.com/IsmaelMartinez/teams-for-linux/pull/2582)). Live: [mqtt](https://github.com/IsmaelMartinez/teams-for-linux/issues?q=is%3Aissue+is%3Aopen+label%3Amqtt).
- **Notifications**: lifecycle stable; remaining work in [notifications](https://github.com/IsmaelMartinez/teams-for-linux/issues?q=is%3Aissue+is%3Aopen+label%3Anotifications).
- **Performance**: the ten-item audit is closed out in [ADR-026](../adr/026-performance-audit-outcomes.md). Bounded timestamp polling, a cached tray base icon and chunked `cacheManager` scans shipped in [PR #2837](https://github.com/IsmaelMartinez/teams-for-linux/pull/2837). The four not-planned items each carry a recorded reason, with a stated magnitude where a residual cost is accepted. Where a reopen trigger exists it needs no instrumentation, so a user-supplied DevTools profile or a reproducible idle-CPU report is enough to revisit one.
- **Config Schema as Single Source of Truth** ([#2597](https://github.com/IsmaelMartinez/teams-for-linux/issues/2597)): phases 0-2 shipped in v2.12.0 (drift fixes, generated reference + `config-schema.json` with CI drift guard, docs config explorer); 3a (`applyMode` + nested-field metadata, hard-failing generator lint) and 4 (warn-only startup validation) landed; 3b (in-app settings window) is the remaining phase ([research](../research/documentation-and-config-ux-research.md)). The settings window is the deliverable, and its restart-only MVP can ship on its own:
  - Build the restart-only settings MVP, reusing the `legacyConfigStore` override-on-boot layering and allowlisting writes to schema keys with type/choice plus deep prototype-pollution validation; defer the live-apply subset and the object-typed forms.

  The flat-to-nested config migration is an optional, independent companion rather than a prerequisite, and can land before, alongside, or after the window. Done before (migrate the remaining flat options to the nested names owned by [ADR-025](../adr/025-config-option-naming-convention.md), using whichever deprecation mechanism [#2841](https://github.com/IsmaelMartinez/teams-for-linux/issues/2841) settles on, tracked namespace by namespace in [#2842](https://github.com/IsmaelMartinez/teams-for-linux/issues/2842)) it de-risks the writer by collapsing config to one canonical nested shape. It can also ride on the window itself: since every save writes canonical nested keys, the UI passively migrates each user with no separate phase.
- **Testing Infrastructure**: cross-distro Docker tests passing for all 9 configurations ([ADR-016](../adr/016-cross-distro-testing-environment.md)); CI integration in progress.
- **Dev Experience**: stale bot tuning and a project-specific code-reviewer subagent are the next quick wins. ([PR template](https://github.com/IsmaelMartinez/teams-for-linux/pull/2544) landed 2026-05-15.)

---

## Awaiting User Feedback

Phase 2 work depending on a user trigger.

- **Quick Chat Access** ([#2109](https://github.com/IsmaelMartinez/teams-for-linux/issues/2109), shipped v2.7.4): notification click-to-chat, recent contacts cache, favorites list if requested.
- **Smartcard PIN Dialog** ([#2639](https://github.com/IsmaelMartinez/teams-for-linux/issues/2639), merged in [#2659](https://github.com/IsmaelMartinez/teams-for-linux/pull/2659), opt-in via `auth.clientCertificate.pinDialog.enabled`): WebAuthn PIN dialog migration onto the shared secure prompt, FIDO2 touch prompt ([#2631](https://github.com/IsmaelMartinez/teams-for-linux/issues/2631)) if requested.
- **SSO Web Sign-in Pre-fill** ([#2794](https://github.com/IsmaelMartinez/teams-for-linux/issues/2794), merged in [#2761](https://github.com/IsmaelMartinez/teams-for-linux/pull/2761), opt-in via `auth.webLogin.*`): account and password pre-fill on the Microsoft/federated web login form, with optional auto-advance and MFA method selection. Broader host coverage and passkey-aware flows only if requested.
- **Graph API Enhanced Features** ([research](../research/graph-api-integration-research.md)): calendar sync, mail preview notifications. Presence endpoint returns 403 because the Teams token lacks `Presence.Read` scope.

---

## Not Planned / Not Feasible

| Feature | Issue | Reason | Notes |
|---------|-------|--------|-------|
| Screen Lock Media Privacy | [#2106](https://github.com/IsmaelMartinez/teams-for-linux/issues/2106) | Closed --- no user interest | Reopen if requested |
| Meeting Join with ID | [#2152](https://github.com/IsmaelMartinez/teams-for-linux/issues/2152) | Microsoft limitation | Workaround: use meeting link via clipboard |
| Custom Notifications Phase 2 | [#2108](https://github.com/IsmaelMartinez/teams-for-linux/issues/2108) | Dropped --- didn't work for the user | MVP (v2.6.16) remains |
| GNOME Search Provider | [#2075](https://github.com/IsmaelMartinez/teams-for-linux/issues/2075) | Latency too high (~300-1100ms) | Technically feasible but poor UX |
| External Browser Auth | [#2017](https://github.com/IsmaelMartinez/teams-for-linux/issues/2017) | Not feasible | Teams manages OAuth internally |
| Multiple Windows | [#1984](https://github.com/IsmaelMartinez/teams-for-linux/issues/1984) | Rejected ([ADR-010](../adr/010-multiple-windows-support.md)) | Quick Chat is the alternative |
| useSystemPicker | --- | Rejected ([ADR-008](../adr/008-usesystempicker-electron-38.md)) | Reconsider when Electron improves Linux support |
| Disable Chat Spellcheck | [#2304](https://github.com/IsmaelMartinez/teams-for-linux/issues/2304) | Not feasible | Spellcheck is controlled by Teams/Chromium, not the wrapper |
| Formatting View on Compose | [#2318](https://github.com/IsmaelMartinez/teams-for-linux/issues/2318) | Not feasible | Teams UI internals; no injection point |

---

## Infrastructure

- **Bot Automation**: issue triage is a standalone Go service ([github-issue-triage-bot](https://github.com/IsmaelMartinez/github-issue-triage-bot), [ADR-018](../adr/018-issue-triage-bot-github-app-migration.md)).
- **Cross-Distro Testing**: 9 configurations on Docker, all passing ([ADR-016](../adr/016-cross-distro-testing-environment.md)).
- **Release Automation**: managed by [release-please](https://github.com/googleapis/release-please); merge the auto-generated Release PR to trigger a release.
- **Repo Health**: [repo-butler](https://github.com/IsmaelMartinez/repo-butler) generates a daily dashboard at [the portfolio page](https://ismaelmartinez.github.io/repo-butler/teams-for-linux.html).

---

## Related Documentation

- [Research Index](../research/README.md)
- [ADR Index](../adr/README.md)
- [Contributing Guide](../contributing.md)
- [Module Index](../module-index.md)
