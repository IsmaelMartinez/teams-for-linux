# Development Roadmap

**Last Updated:** 2026-03-10
**Current Version:** v2.7.10 (Electron 39.5.1)
**Status:** Living Document --- stabilising on Electron 39, preparing v2.7.11

This document outlines the development direction for Teams for Linux. It focuses on themes and priorities rather than individual PRs --- see [GitHub Issues](https://github.com/IsmaelMartinez/teams-for-linux/issues) and [Pull Requests](https://github.com/IsmaelMartinez/teams-for-linux/pulls) for granular tracking.

---

## Principles

- **Validate first:** Run spikes before implementing complex features
- **Start simple:** Build MVP, add complexity only if needed
- **User-driven:** Implement Phase 2 features only when users request them
- **Linux-first:** Embrace Unix philosophy --- composable tools over monolithic features
- **Measured releases:** Accumulate meaningful changes rather than rapid incremental releases ([#2235](https://github.com/IsmaelMartinez/teams-for-linux/issues/2235))
- **Automate triage, not decisions:** Bots surface information; maintainers decide
- **Incremental configuration:** New features use nested config patterns from day one; existing flat options migrate opportunistically (see [configuration organization research](../research/configuration-organization-research.md))

---

## Active Themes

### Stability and Reliability

The primary focus for the v2.7.x line. Auth recovery after sleep, network error scoping (only reload on main-frame failures, not sub-frames), and media permission handling are the key areas. The goal is a solid, dependable experience before considering major dependency upgrades.

### Media and Calls

Camera and microphone issues remain the most common user-reported bugs. Recent work adds explicit permission check handling so the browser correctly reports "granted" for media queries. A speaking indicator ([#2290](https://github.com/IsmaelMartinez/teams-for-linux/issues/2290)) has been implemented using WebRTC `getStats()` to give users three-state feedback (speaking, silent, muted) during calls — ready for user testing in v2.7.11.

Longer-standing camera issues ([#2169](https://github.com/IsmaelMartinez/teams-for-linux/issues/2169)) and call failures ([#2231](https://github.com/IsmaelMartinez/teams-for-linux/issues/2231)) are upstream-blocked and depend on Chromium/Electron improvements.

### Wayland Compatibility

Wayland support is improving incrementally. Screen source selection has been simplified for better Wayland compatibility, and short Teams deep links now work across all link types. Idle status on Wayland ([#1827](https://github.com/IsmaelMartinez/teams-for-linux/issues/1827)) remains blocked on Electron's `powerMonitor` API not supporting Wayland idle detection natively.

### MQTT Integration

The MQTT integration is mature for presence status, media state, and inbound commands. The remaining work is a null sourceId fix for screen sharing publish and the broader screen sharing status feature ([#2107](https://github.com/IsmaelMartinez/teams-for-linux/issues/2107), awaiting user feedback). Phase 2 extended status (granular WebRTC camera/mic monitoring) is parked until users confirm they need it.

### Testing Infrastructure

Cross-distro testing shipped in v2.7.9 with Docker-based environments supporting 12 configurations (4 distros x 3 display servers). Authenticated Playwright tests landed in v2.7.10. Future improvements include pre-built container images, CI regression testing for Dockerfiles, and pre-auth smoke tests.

---

## Next Patch Release (v2.7.11)

v2.7.11 continues the stability theme with several bug fixes (emoji colon input, short Teams deep links, MQTT screen sharing, media permission handling) plus the speaking indicator ([#2290](https://github.com/IsmaelMartinez/teams-for-linux/issues/2290)) as a new user-testable feature using WebRTC `getStats()` for three-state mute/speaking detection.

---

## Next Minor Release (v2.8.0) --- Deferred

Electron 40 is a major dependency upgrade (Chromium 144, Node.js 24, V8 14.4). The [research is complete](../research/electron-40-migration-research.md) and there are no blocking breaking changes, but the priority is stabilising on Electron 39 first. The Dependabot PR [#2223](https://github.com/IsmaelMartinez/teams-for-linux/pull/2223) remains open and will be merged after the v2.7.x line is confirmed stable.

The notification sound overhaul Phase 2 (custom sound configuration, [research complete](../research/notification-sound-overhaul-research.md)) may bundle with the Electron upgrade if timing aligns.

---

## Awaiting User Feedback

These features have completed initial implementation. Further phases depend on user requests.

### Quick Chat Access

Shipped in v2.7.4 ([#2109](https://github.com/IsmaelMartinez/teams-for-linux/issues/2109)). Phase 2 (if requested): notification click-to-chat, recent contacts cache, favorites list.

### MQTT Extended Status Phase 2

[Research complete](../research/mqtt-extended-status-investigation.md). Phase 1 shipped. Phase 2 (if requested): WebRTC monitoring for camera/microphone state, granular media state topics. Trigger: user confirms they need granular camera/mic state for home automation.

### Graph API Enhanced Features

[Research complete](../research/graph-api-integration-research.md). Phase 1 POC shipped. Phase 2 (if requested): calendar sync with desktop notifications, mail preview notifications, retry logic. Note: Presence endpoint returns 403 --- Teams token lacks `Presence.Read` scope.

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

---

## Infrastructure

### Bot Automation

The issue triage bot has been migrated to a standalone Go service ([github-issue-triage-bot](https://github.com/IsmaelMartinez/github-issue-triage-bot)), deployed as a GitHub App on Google Cloud Run with Neon PostgreSQL and Gemini 2.5 Flash. See [ADR-018](../adr/018-issue-triage-bot-github-app-migration.md). Remaining work (data seeding, public dashboard, Batch 3 pre-research prompts) lives in that repo.

### Cross-Distro Testing

Shipped in v2.7.9 ([ADR-016](../adr/016-cross-distro-testing-environment.md)). Docker-based environment supporting 12 configurations with VNC for interactive testing. Authenticated Playwright tests landed in v2.7.10. Future: pre-built images, CI regression testing, pre-auth smoke tests.

### Configuration Modernization

New features use nested config patterns from day one (`mqtt.*`, `graphApi.*`, `customNotification.*`, `screenSharing.*`, `auth.*`, `media.*`). Existing flat options migrate opportunistically when modules are refactored --- no dedicated migration effort planned. See the [configuration organization research](../research/configuration-organization-research.md) for the full analysis and proposed nested structures.

---

## Release History

### v2.7.10 (2026-03-06)

Stability release focused on reliability and testing infrastructure. Key changes: network error resilience (main-frame only reloads), app termination and MQTT error handling, tray window toggle, app menu when tray disabled, emoji colon input fix, authenticated Playwright tests, cross-distro test improvements, and bot migration cleanup.

### v2.7.9 (2026-02-27, pre-release)

Screen sharing fixes (Wayland regression, locale detection), Quick Chat shortcut improvements, Intune auth improvements, MQTT diagnostic logging, cross-distro testing environment, parallel test execution, SonarQube fixes, and bot automation Batch 1.

---

## Related Documentation

- [Research Index](../research/README.md) - Detailed research documents
- [ADR Index](../adr/README.md) - Architecture decision records
- [Contributing Guide](../contributing.md) - Development guidelines
- [Module Index](../module-index.md) - Codebase structure
