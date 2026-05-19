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
- **Incremental configuration:** New features use nested config patterns from day one; existing flat options migrate opportunistically ([configuration organization research](../research/configuration-organization-research.md))

---

## Active Themes

Current status is tracked via the linked GitHub labels. This section serves as an orientation map, not a real-time tracker.

- **Stability and Reliability**: auth recovery, network error scoping, media permission handling. Live: [bug](https://github.com/IsmaelMartinez/teams-for-linux/issues?q=is%3Aissue+is%3Aopen+label%3Abug).
- **Media and Calls**: camera and mic handling, speaking indicator, call drops on multi-interface systems. Live: [media](https://github.com/IsmaelMartinez/teams-for-linux/issues?q=is%3Aissue+is%3Aopen+label%3Amedia), [screen-sharing](https://github.com/IsmaelMartinez/teams-for-linux/issues?q=is%3Aissue+is%3Aopen+label%3Ascreen-sharing).
- **Wayland Compatibility**: ozone-platform default reset under community testing ([#2508](https://github.com/IsmaelMartinez/teams-for-linux/issues/2508)). Live: [wayland](https://github.com/IsmaelMartinez/teams-for-linux/issues?q=is%3Aissue+is%3Aopen+label%3Awayland).
- **MQTT Integration**: presence, media state, screen-share, incoming-call topics. Live: [mqtt](https://github.com/IsmaelMartinez/teams-for-linux/issues?q=is%3Aissue+is%3Aopen+label%3Amqtt).
- **Notifications**: lifecycle stable; remaining work in [notifications](https://github.com/IsmaelMartinez/teams-for-linux/issues?q=is%3Aissue+is%3Aopen+label%3Anotifications).
- **Testing Infrastructure**: cross-distro Docker tests passing for all 9 configurations ([ADR-016](../adr/016-cross-distro-testing-environment.md)); CI integration in progress.
- **Dev Experience**: stale bot tuning and a project-specific code-reviewer subagent are the next quick wins. ([PR template](https://github.com/IsmaelMartinez/teams-for-linux/pull/2544) landed 2026-05-15.)

---

## Awaiting User Feedback

Phase 2 work depending on a user trigger.

- **Quick Chat Access** ([#2109](https://github.com/IsmaelMartinez/teams-for-linux/issues/2109), shipped v2.7.4): notification click-to-chat, recent contacts cache, favorites list if requested.
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
