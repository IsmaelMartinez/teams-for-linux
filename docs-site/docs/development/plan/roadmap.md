# Development Roadmap

**Last Updated:** 2026-02-25
**Current Version:** v2.7.8
**Status:** Living Document — planning v2.7.9, v2.8.0, and bot automation improvements

This document outlines the future development direction for Teams for Linux, organized by priority and readiness for implementation.

## Quick Reference

| Priority | Feature | Status | Effort | Target |
|----------|---------|--------|--------|--------|
| **Active** | Screen sharing fixes ([#2217](https://github.com/IsmaelMartinez/teams-for-linux/issues/2217), [#2219](https://github.com/IsmaelMartinez/teams-for-linux/pull/2219)) | Open PRs under review | Medium | v2.7.9 |
| **Active** | Custom CSS crash fix ([#2220](https://github.com/IsmaelMartinez/teams-for-linux/pull/2220)) | PR open | Small | v2.7.9 |
| **Active** | CPU idle optimization ([#2218](https://github.com/IsmaelMartinez/teams-for-linux/pull/2218)) | PR open | Small | v2.7.9 |
| **Review** | Cross-distro testing environment ([#2226](https://github.com/IsmaelMartinez/teams-for-linux/pull/2226)) | PR open, includes Codespaces devcontainer. See [ADR-016](../adr/016-cross-distro-testing-environment.md). | Medium | v2.7.9 |
| **Review** | Wayland audit and PipeWire ADR ([#2225](https://github.com/IsmaelMartinez/teams-for-linux/pull/2225)) | PR open | Medium | v2.7.9 |
| **Open** | MQTT Screen Sharing ([#2107](https://github.com/IsmaelMartinez/teams-for-linux/issues/2107)) | PR [#2193](https://github.com/IsmaelMartinez/teams-for-linux/pull/2193) and [#2144](https://github.com/IsmaelMartinez/teams-for-linux/pull/2144) still open | Tiny | v2.7.9 |
| **Open** | App menu tray fix ([#2186](https://github.com/IsmaelMartinez/teams-for-linux/issues/2186)) | PR [#2195](https://github.com/IsmaelMartinez/teams-for-linux/pull/2195) still open | Small | v2.7.9 |
| **Open** | Quick Chat shortcut fix ([#2184](https://github.com/IsmaelMartinez/teams-for-linux/issues/2184)) | PR [#2188](https://github.com/IsmaelMartinez/teams-for-linux/pull/2188) still open | Small | v2.7.9 |
| **Open** | Screen source selection simplification ([#2207](https://github.com/IsmaelMartinez/teams-for-linux/pull/2207)) | PR open | Medium | v2.7.9 |
| **Blocked** | MQTT status regression ([#2131](https://github.com/IsmaelMartinez/teams-for-linux/issues/2131)) | Diagnostic build in PR [#2197](https://github.com/IsmaelMartinez/teams-for-linux/pull/2197), needs user logs | Medium | v2.7.9+ |
| **Ready** | Bot automation improvements | Issue index refresh, pre-research prompt generator | Medium | v2.7.9 |
| **Deferred** | Electron 40 upgrade | Research complete, not urgent | Medium | v2.8.0+ |
| **Ready** | Notification sound overhaul | [Research complete](../research/notification-sound-overhaul-research.md) | Medium | v2.8.0+ |
| **Done** | Issue triage bot Phase 3 (duplicate detection) | Shipped | Small | Done |
| **Done** | ESLint 10 upgrade | Shipped in v2.7.8 | Small | Done |
| **Done** | Screen sharing locale fix | Shipped post-v2.7.8 ([#2210](https://github.com/IsmaelMartinez/teams-for-linux/pull/2210)) | Small | Done |
| **Done** | Code quality hardening | Complete (Phases 1-3) | Small | Done |
| **Low** | MQTT Extended Status Phase 2 | Awaiting user feedback | Small | --- |

---

## Current State (Post v2.7.8)

v2.7.8 was released on 2026-02-21. Since then, several PRs have been merged (screen sharing locale fix, dependency updates, bot upgrades) and a wave of new bug reports has come in around screen sharing, Wayland compatibility, and a few other areas. The focus for v2.7.9 is stabilising these areas, landing the cross-distro testing infrastructure, and improving bot automation.

There are currently 13 open issues and 12 open PRs. The open issues cluster around screen sharing ([#2217](https://github.com/IsmaelMartinez/teams-for-linux/issues/2217), [#2204](https://github.com/IsmaelMartinez/teams-for-linux/issues/2204), [#2209](https://github.com/IsmaelMartinez/teams-for-linux/issues/2209)), microphone/camera problems ([#2222](https://github.com/IsmaelMartinez/teams-for-linux/issues/2222), [#2221](https://github.com/IsmaelMartinez/teams-for-linux/issues/2221)), and a few UI-level concerns ([#2216](https://github.com/IsmaelMartinez/teams-for-linux/issues/2216), [#2215](https://github.com/IsmaelMartinez/teams-for-linux/issues/2215), [#2203](https://github.com/IsmaelMartinez/teams-for-linux/issues/2203)).

---

## Next Patch Release (v2.7.9)

### Open PRs to Review/Merge

| PR | Description | Status |
|----|-------------|--------|
| [#2225](https://github.com/IsmaelMartinez/teams-for-linux/pull/2225) | Disable WebRTCPipeWireCapturer on XWayland; add Wayland audit and ADR-016 | Under review |
| [#2226](https://github.com/IsmaelMartinez/teams-for-linux/pull/2226) | Cross-distro testing environment (Docker + VNC + Codespaces devcontainer) | Under review; SonarQube flagged 4 security hotspots |
| [#2223](https://github.com/IsmaelMartinez/teams-for-linux/pull/2223) | Electron 39.5.1 to 40.6.0 (Dependabot) | Deferred; not merging yet |
| [#2220](https://github.com/IsmaelMartinez/teams-for-linux/pull/2220) | Fix crash when using custom CSS | Under review |
| [#2219](https://github.com/IsmaelMartinez/teams-for-linux/pull/2219) | Screen sharing regression on Wayland/XWayland | Under review |
| [#2218](https://github.com/IsmaelMartinez/teams-for-linux/pull/2218) | Optimise idle CPU usage (title-flapping overhead) | Under review |
| [#2207](https://github.com/IsmaelMartinez/teams-for-linux/pull/2207) | Simplify screen source selection for Wayland compatibility | Under review |
| [#2197](https://github.com/IsmaelMartinez/teams-for-linux/pull/2197) | MQTT status diagnostic build | Blocked on user logs |
| [#2195](https://github.com/IsmaelMartinez/teams-for-linux/pull/2195) | App menu when tray icon disabled | Open from v2.7.8 cycle |
| [#2193](https://github.com/IsmaelMartinez/teams-for-linux/pull/2193) | MQTT screen sharing null sourceId fix | Open from v2.7.8 cycle |
| [#2188](https://github.com/IsmaelMartinez/teams-for-linux/pull/2188) | Quick Chat shortcut messaging | Open from v2.7.8 cycle |
| [#2144](https://github.com/IsmaelMartinez/teams-for-linux/pull/2144) | Screen sharing status to MQTT (broader feature) | Open |

### Open Issues

| Issue | Description | Labels |
|-------|-------------|--------|
| [#2222](https://github.com/IsmaelMartinez/teams-for-linux/issues/2222) | Microphone not working in v2.7.5 | bug |
| [#2221](https://github.com/IsmaelMartinez/teams-for-linux/issues/2221) | Crash when using camera or microphone | bug |
| [#2217](https://github.com/IsmaelMartinez/teams-for-linux/issues/2217) | Screen sharing broken | bug |
| [#2216](https://github.com/IsmaelMartinez/teams-for-linux/issues/2216) | Emoji input via colon not possible | bug |
| [#2215](https://github.com/IsmaelMartinez/teams-for-linux/issues/2215) | Click tray icon to switch to opened window | enhancement |
| [#2209](https://github.com/IsmaelMartinez/teams-for-linux/issues/2209) | Thumbnail windows never auto-close | bug |
| [#2204](https://github.com/IsmaelMartinez/teams-for-linux/issues/2204) | No thumbnail windows when sharing screen | bug |
| [#2203](https://github.com/IsmaelMartinez/teams-for-linux/issues/2203) | File upload with special characters freezes | bug, awaiting feedback |
| [#2186](https://github.com/IsmaelMartinez/teams-for-linux/issues/2186) | App menu when tray icon disabled | enhancement, awaiting feedback |
| [#2184](https://github.com/IsmaelMartinez/teams-for-linux/issues/2184) | Quick Chat keyboard shortcut | bug, awaiting feedback |
| [#2131](https://github.com/IsmaelMartinez/teams-for-linux/issues/2131) | MQTT status regression | bug, awaiting feedback |
| [#2107](https://github.com/IsmaelMartinez/teams-for-linux/issues/2107) | MQTT screen sharing status | enhancement |
| [#1943](https://github.com/IsmaelMartinez/teams-for-linux/issues/1943) | Window size broke when changing app | bug, blocked |

### Recently Shipped (Post v2.7.8)

| PR | Description | Merged |
|----|-------------|--------|
| [#2210](https://github.com/IsmaelMartinez/teams-for-linux/pull/2210) | Fix screen sharing detection for non-English locales | 2026-02-23 |
| [#2214](https://github.com/IsmaelMartinez/teams-for-linux/pull/2214) | Update dependencies; add autoplay fix and sound overhaul research | 2026-02-22 |
| [#2213](https://github.com/IsmaelMartinez/teams-for-linux/pull/2213) | Upgrade Issue Triage Bot to Gemini 2.5 Flash | 2026-02-22 |
| [#2212](https://github.com/IsmaelMartinez/teams-for-linux/pull/2212) | Improve CI workflow triggers and PR artifact detection | 2026-02-21 |
| [#2208](https://github.com/IsmaelMartinez/teams-for-linux/pull/2208) | Auto-remove 'awaiting user feedback' label on issue comment | 2026-02-20 |
| [#2206](https://github.com/IsmaelMartinez/teams-for-linux/pull/2206) | Improve network error handling and recovery | 2026-02-20 |
| [#2224](https://github.com/IsmaelMartinez/teams-for-linux/pull/2224) | Docusaurus search-local bump | 2026-02-23 |

---

## Bot Automation Improvements

The issue triage bot has been running since v2.7.4 with three phases shipped (missing info detection, solution suggestions, duplicate detection). The issue index workflow runs weekly on Mondays. There are three improvements planned.

### Phase 3.1: Real-Time Issue Index Refresh

**Status:** Ready to implement
**Effort:** Small
**Priority:** High

The current issue index is regenerated weekly via a scheduled workflow. This means if two users report the same bug within hours of each other, the duplicate detection has no knowledge of the first report when the second one arrives. The fix is to also trigger the `update-issue-index` workflow on the `issues: [opened, closed, reopened]` events so the index is refreshed every time an issue changes state. This way the triage bot always compares against the most current set of issues.

The implementation is a one-line change to the `update-issue-index.yml` workflow triggers, plus adding a short delay or `workflow_run` dependency so the new issue is included in the index before the triage bot reads it. Alternatively, the triage bot itself can append the new issue to the index inline during its run (avoiding a race condition entirely).

### Phase 3.2: Pre-Research Prompt Generator

**Status:** Ready to implement
**Effort:** Medium
**Priority:** Medium

A new GitHub Action (or a standalone script) that generates a structured pre-research prompt for new issues. The idea is that when an issue comes in and the maintainer wants to investigate, they can trigger a workflow (manually or via label) that produces a detailed prompt. This prompt can then be fed to an AI assistant (Claude Code, Gemini, etc.) to do the initial codebase exploration, identify relevant files, check related issues, and propose an investigation plan.

The generated prompt would include the issue title and body, relevant module paths from the module index, related issues from the issue index, applicable troubleshooting entries, and configuration options that might be involved. It would also include a clear disclaimer that the output is meant as a starting point and will be reviewed by the maintainer before any action is taken.

This fits the project's "validate first" principle: the prompt is generated automatically, but a human reviews both the prompt and the resulting analysis before anything is implemented.

### Phase 4: Enhancement Context from Roadmap/Research/ADRs

**Status:** Future
**Effort:** Medium
**Priority:** Low

Extend the triage bot to surface relevant roadmap items, ADRs, and research docs when an issue touches a known area. For example, if someone files a feature request about screen sharing, the bot could note that ADR-008 (useSystemPicker) and ADR-016 (Wayland audit) are relevant context.

---

## Cross-Distro Testing Environment

**PR:** [#2226](https://github.com/IsmaelMartinez/teams-for-linux/pull/2226)
**ADR:** [ADR-016](../adr/016-cross-distro-testing-environment.md)
**Status:** Under review
**Effort:** Medium

PR #2226 introduces a Docker-based testing environment with 12 configurations (4 distros x 3 display servers). Each container runs a VNC server so you can interactively test the app on Ubuntu 24.04, Fedora 41, Debian Bookworm, and Arch Linux under X11, Wayland, and XWayland.

The environment includes a GitHub Codespaces devcontainer for one-click setup on native x86_64 VMs, along with a `build-and-run.sh` script that builds an AppImage from source and launches the test container. ADR-016 documents the architecture decisions, the Apple Silicon limitation (V8 4GB pointer compression under Rosetta 2 causes OOM crashes post-login), and alternatives considered (Hetzner/DO VPS, GitHub Actions tunnel, cloud testing platforms).

SonarQube's 4 security hotspots have been addressed: all VNC/noVNC ports are bound to `127.0.0.1`, VNC servers listen on localhost only, noVNC download has SHA256 verification, and security trade-offs are documented. Containers are pinned to `linux/amd64` so the environment works on macOS (including Apple Silicon via Rosetta 2) as well as Linux hosts.

Once merged, the testing environment becomes part of the project's developer toolset. It can be run from any machine with Docker Desktop. Future improvements could include pre-built images published to a container registry, a CI job that builds the Docker images to catch Dockerfile regressions, and potentially some smoke tests that verify the app launches (without requiring Microsoft auth).

---

## Next Minor Release (v2.8.0) --- Deferred

Electron 40 is a major dependency upgrade (new Chromium, new Node.js, new V8). The research is complete and there are no blocking breaking changes, but it's not urgent. The Dependabot PR [#2223](https://github.com/IsmaelMartinez/teams-for-linux/pull/2223) (Electron 39.5.1 to 40.6.0) is open and can be merged when the timing is right.

The priority right now is stabilising the current release (screen sharing issues, Wayland compatibility, bot automation), and Electron 40 should come after that work settles. Rushing a major dependency upgrade while active bug reports are being triaged would add unnecessary risk.

### Ready to Implement (When Scheduled)

| Item | Description | Notes |
|------|-------------|-------|
| **Electron 40** | Electron 39.5.1 to 40.6.0 (Chromium 144, Node.js 24, V8 14.4) | [Research](../research/electron-40-migration-research.md); no blocking breaking changes. Dependabot PR [#2223](https://github.com/IsmaelMartinez/teams-for-linux/pull/2223) open. |
| **Notification sound overhaul** | Replace `node-sound` native addon, add custom sound config, consolidate notification options | [Research](../research/notification-sound-overhaul-research.md); phased approach |

**Routine dependency updates completed in v2.7.8:** `@homebridge/dbus-native` 0.7.3, `electron-updater` 6.8.3, `electron-builder` 26.8.1, `eslint`/`@eslint/js` 10.0.1 (ESLint 10).

**Still pending:** Docusaurus search-local updated to 0.55.0 (merged post-v2.7.8). React 19.2.4, TypeScript 5.9.3 (docs-site only).

---

## Feature Details

### MQTT Screen Sharing Status

**Issue:** [#2107](https://github.com/IsmaelMartinez/teams-for-linux/issues/2107)
**Original Request:** [#1938](https://github.com/IsmaelMartinez/teams-for-linux/issues/1938) by @vbartik
**Related:** [mqtt-extended-status-investigation.md](../research/mqtt-extended-status-investigation.md)
**Effort:** Tiny
**Status:** PR [#2193](https://github.com/IsmaelMartinez/teams-for-linux/pull/2193) fixes null sourceId crash. PR [#2144](https://github.com/IsmaelMartinez/teams-for-linux/pull/2144) open for the broader feature.

---

### Custom Notification System Phase 2

**Issue:** [#2108](https://github.com/IsmaelMartinez/teams-for-linux/issues/2108)
**Research:** [custom-notification-system-research.md](../research/custom-notification-system-research.md)
**Status:** Dropped --- implementation did not work for the user; PR [#2112](https://github.com/IsmaelMartinez/teams-for-linux/pull/2112) closed

MVP from v2.6.16 remains available (meeting notifications, toast notifications with auto-dismiss, click-to-focus, `notificationMethod: "custom"` config). Phase 2 may be revisited if a new user requests it with better diagnostic tooling.

---

## Strategic / Future

### Code Quality Hardening

**Status:** Complete
**Priority:** Done

All three phases completed: logging hygiene, resilience improvements, input handling, renderer cleanup, IPC validator, SECURITY.md, CI/CD lint gate, dependency audit, Dependabot, workflow permissions, CODEOWNERS, npm audit scope.

---

### AppImage Auto-Update

**Issue:** [#2157](https://github.com/IsmaelMartinez/teams-for-linux/issues/2157)
**Status:** Shipped in v2.7.6
**Priority:** Done

---

### GitHub Issue Bot

**Research:** [github-issue-bot-investigation.md](../research/github-issue-bot-investigation.md)
**Status:** Phase 1 ✅, Phase 2 ✅, Phase 3 ✅ (duplicate detection shipped)
**Priority:** Active (improving)

Phase 1 delivered missing info detection. Phase 2 delivered AI-powered solution suggestions via Gemini. Phase 3 delivered duplicate detection against an issue index using Gemini 2.5 Flash. The bot was upgraded to Gemini 2.5 Flash in PR [#2213](https://github.com/IsmaelMartinez/teams-for-linux/pull/2213). The auto-remove awaiting feedback label workflow was added in PR [#2208](https://github.com/IsmaelMartinez/teams-for-linux/pull/2208).

Next steps are the real-time index refresh (Phase 3.1), pre-research prompt generator (Phase 3.2), and enhancement context (Phase 4). See the "Bot Automation Improvements" section above for details.

---

### Configuration Organization

**Research:** [configuration-organization-research.md](../research/configuration-organization-research.md)
**Status:** Ongoing --- new features use nested patterns from day one

**Already Using Nested Patterns:** `mqtt.*`, `graphApi.*`, `customNotification.*`, `cacheManagement.*`, `screenSharingThumbnail.*`, `quickChat.*`

Existing flat options migrate opportunistically when modules are refactored.

---

## Awaiting User Feedback

These features have completed initial implementation. Further phases depend on user requests.

### Quick Chat Access

**Issue:** [#2109](https://github.com/IsmaelMartinez/teams-for-linux/issues/2109)
**Status:** Shipped in v2.7.4

**Delivered:** People API search, deep link chat navigation, inline messaging via Teams React internals, keyboard shortcut (Ctrl+Alt+Q), menu item integration.

**Phase 2 (If Requested):** Enhance notification clicks to open chat with sender, cache recent contacts, favorites list.

---

### MQTT Extended Status Phase 2

**Research:** [mqtt-extended-status-investigation.md](../research/mqtt-extended-status-investigation.md)
**Status:** Phase 1 Complete

**Phase 1 Delivered:** Generic `publish()` method, LWT for connection state, call state (`in-call`) publishing.

**Phase 2 (If Requested):** WebRTC monitoring for camera/microphone state, granular media state (`camera`, `microphone` topics).

**Trigger:** User confirms they need granular camera/mic state in addition to call state for RGB LED automation.

---

### Graph API Enhanced Features

**Research:** [graph-api-integration-research.md](../research/graph-api-integration-research.md)
**Status:** Phase 1 POC Complete

**Phase 1 Delivered:** Token acquisition, calendar endpoints, mail endpoints, IPC handlers.

**Phase 2 (If Requested):** Calendar sync with desktop notifications, mail preview notifications, retry logic with exponential backoff.

**Note:** Presence endpoint returns 403 Forbidden --- Teams token lacks `Presence.Read` scope.

---

## Not Planned / Not Feasible

| Feature | Issue | Reason | Notes |
|---------|-------|--------|-------|
| Screen Lock Media Privacy | [#2106](https://github.com/IsmaelMartinez/teams-for-linux/issues/2106) | Closed --- no user interest | Implementation complete in branch; reopen if requested |
| Meeting Join with ID | [#2152](https://github.com/IsmaelMartinez/teams-for-linux/issues/2152) | Microsoft limitation | Related to [#675](https://github.com/IsmaelMartinez/teams-for-linux/issues/675); workaround: use meeting link via clipboard |
| Custom Notifications Phase 2 | [#2108](https://github.com/IsmaelMartinez/teams-for-linux/issues/2108) | Dropped --- worked on maintainer's machine but not for user | MVP (v2.6.16) remains; revisit with diagnostic tooling if requested again |
| Tray Icon Logout Indicator | [#1987](https://github.com/IsmaelMartinez/teams-for-linux/issues/1987) | Archived --- user not responding | Work preserved in branch; reopen if requested |
| GNOME Search Provider | [#2075](https://github.com/IsmaelMartinez/teams-for-linux/issues/2075) | Latency too high (~300-1100ms) | Technically feasible via MQTT but poor UX |
| External Browser Auth | [#2017](https://github.com/IsmaelMartinez/teams-for-linux/issues/2017) | Not feasible | Teams manages OAuth internally; no exposed APIs |
| Multiple Windows | [#1984](https://github.com/IsmaelMartinez/teams-for-linux/issues/1984) | Rejected ([ADR-010](../adr/010-multiple-windows-support.md)) | Teams single React context; Quick Chat is the alternative |
| useSystemPicker | --- | Rejected ([ADR-008](../adr/008-usesystempicker-electron-38.md)) | Incomplete Linux Wayland/PipeWire support in Electron; reconsider when improved |

---

## Implementation Priorities

### v2.7.7 (Shipped 2026-02-19)

Included the XWayland camera fix ([#2169](https://github.com/IsmaelMartinez/teams-for-linux/issues/2169)), CI audit level fix, and cleanup.

### v2.7.8 (Shipped 2026-02-21)

Included the second ringer fix ([#2194](https://github.com/IsmaelMartinez/teams-for-linux/pull/2194)), dependency updates, ESLint 10 migration, and issue bot improvements (Phase 3 duplicate detection, Gemini 2.5 Flash upgrade).

### v2.7.9 Release Plan

1. **Stabilise screen sharing and Wayland** --- review and merge PRs [#2219](https://github.com/IsmaelMartinez/teams-for-linux/pull/2219), [#2225](https://github.com/IsmaelMartinez/teams-for-linux/pull/2225), [#2207](https://github.com/IsmaelMartinez/teams-for-linux/pull/2207)
2. **Merge bug fixes** --- [#2220](https://github.com/IsmaelMartinez/teams-for-linux/pull/2220) (custom CSS crash), [#2218](https://github.com/IsmaelMartinez/teams-for-linux/pull/2218) (CPU idle), remaining v2.7.8 carry-over PRs ([#2193](https://github.com/IsmaelMartinez/teams-for-linux/pull/2193), [#2195](https://github.com/IsmaelMartinez/teams-for-linux/pull/2195), [#2188](https://github.com/IsmaelMartinez/teams-for-linux/pull/2188))
3. **Land cross-distro testing** --- merge PR [#2226](https://github.com/IsmaelMartinez/teams-for-linux/pull/2226) after addressing SonarQube hotspots
4. **Bot automation** --- implement real-time issue index refresh (Phase 3.1) and pre-research prompt generator (Phase 3.2)
5. **Release v2.7.9**

### v2.8.0 Release Plan (Deferred)

1. **Electron 40 upgrade** --- major version bump; merge when v2.7.9 is stable
2. **Notification sound overhaul** --- if time permits, bundle with the Electron upgrade
3. **Release v2.8.0**

### Future Priorities

- **Bot Phase 4** --- enhancement context from roadmap/research/ADRs
- **Cross-distro testing CI** --- build Docker images in CI to catch Dockerfile regressions
- **Automated smoke tests** --- verify app launches in the cross-distro environment (pre-auth only)

### Principles

- **Validate first:** Run spikes before implementing complex features
- **Start simple:** Build MVP, add complexity only if needed
- **User-driven:** Implement Phase 2 features only when users request them
- **Linux-first:** Embrace Unix philosophy --- composable tools over monolithic features
- **Archive stale work:** Don't keep unvalidated features alive indefinitely
- **Automate triage, not decisions:** Bots surface information; maintainers decide

---

## Related Documentation

- [Research Index](../research/README.md) - Detailed research documents
- [ADR Index](../adr/README.md) - Architecture decision records
- [Contributing Guide](../contributing.md) - Development guidelines
- [Module Index](../module-index.md) - Codebase structure

### Recent ADRs

- [ADR-014: Quick Chat Deep Link Approach](../adr/014-quick-chat-deep-link-approach.md) - Deep links for chat navigation
- [ADR-015: Quick Chat Inline Messaging](../adr/015-quick-chat-inline-messaging.md) - Inline messaging via Teams React internals
- [ADR-016: Cross-Distro Testing Environment](../adr/016-cross-distro-testing-environment.md) - Docker + noVNC + Codespaces for testing across 9 distro/display server combinations
