# Development Roadmap

**Last Updated:** 2026-03-04
**Current Version:** v2.7.9 (pre-release, Electron 39.5.1)
**Status:** Living Document --- stabilising on Electron 39, planning v2.7.10 and v2.8.0

This document outlines the future development direction for Teams for Linux, organized by priority and readiness for implementation.

## Quick Reference

| Priority | Feature | Status | Effort | Target |
|----------|---------|--------|--------|--------|
| **Active** | Emoji colon input fix ([#2251](https://github.com/IsmaelMartinez/teams-for-linux/pull/2251)) | PR open | Small | v2.7.10 |
| **Active** | Network loss resilience ([#2249](https://github.com/IsmaelMartinez/teams-for-linux/pull/2249)) | PR open | Small | v2.7.10 |
| **Active** | App termination / MQTT error handling ([#2234](https://github.com/IsmaelMartinez/teams-for-linux/pull/2234)) | PR open, overlaps with #2249 | Small | v2.7.10 |
| **Active** | SonarCloud run.sh fixes ([#2262](https://github.com/IsmaelMartinez/teams-for-linux/pull/2262)) | PR open | Tiny | v2.7.10 |
| **Active** | Authenticated Playwright tests ([#2245](https://github.com/IsmaelMartinez/teams-for-linux/pull/2245)) | PR open | Medium | v2.7.10 |
| **Review** | Tray window toggle ([#2253](https://github.com/IsmaelMartinez/teams-for-linux/pull/2253)) | PR open, addresses [#2215](https://github.com/IsmaelMartinez/teams-for-linux/issues/2215) | Small | v2.7.10 |
| **Review** | Short Teams links support ([#2250](https://github.com/IsmaelMartinez/teams-for-linux/pull/2250)) | PR open, addresses [#2228](https://github.com/IsmaelMartinez/teams-for-linux/issues/2228) | Small | v2.7.10 |
| **Review** | Screen source selection simplification ([#2207](https://github.com/IsmaelMartinez/teams-for-linux/pull/2207)) | PR open, carry-over | Medium | v2.7.10 |
| **Open** | App menu without tray ([#2195](https://github.com/IsmaelMartinez/teams-for-linux/pull/2195)) | PR open, carry-over from v2.7.8 | Small | v2.7.10 |
| **Open** | MQTT null sourceId fix ([#2193](https://github.com/IsmaelMartinez/teams-for-linux/pull/2193)) | PR open, carry-over from v2.7.8 | Tiny | v2.7.10 |
| **Open** | MQTT screen sharing feature ([#2144](https://github.com/IsmaelMartinez/teams-for-linux/pull/2144)) | PR open | Small | v2.7.10+ |
| **Done** | Bot migration to GitHub App | Standalone service, old workflows removed, see [ADR-018](../adr/018-issue-triage-bot-github-app-migration.md) | Medium | v2.7.10 |
| **Deferred** | Electron 40 upgrade ([#2223](https://github.com/IsmaelMartinez/teams-for-linux/pull/2223)) | [Research complete](../research/electron-40-migration-research.md), staying on Electron 39 for stability | Medium | v2.8.0 |
| **Done** | Dependency cleanup (lodash, node-sound, electron-positioner) | [Implemented](../research/dependency-review-2026.md) | Low | v2.8.0 |
| **Ready** | Notification sound overhaul Phase 2 (custom sounds config) | [Research complete](../research/notification-sound-overhaul-research.md) | Medium | v2.8.0+ |
| **Low** | MQTT Extended Status Phase 2 | Awaiting user feedback | Small | --- |
| **Requires Validation** | Speaking Indicator ([#2290](https://github.com/IsmaelMartinez/teams-for-linux/issues/2290)) | [Research complete](../research/speaking-indicator-research.md), spikes created | Medium | v2.8.0+ |

---

## Current State (Post v2.7.9)

v2.7.9 was released as a pre-release on 2026-02-27 and included screen sharing fixes (Wayland regression, locale detection), Quick Chat shortcut improvements, Intune auth improvements, MQTT diagnostic logging, cross-distro testing environment, parallel test execution modes, SonarQube code smell fixes, and bot automation Batch 1 (real-time index refresh, accuracy feedback loop, changelog model consolidation). Several Dependabot PRs for GitHub Actions were also merged (upload-artifact, upload-pages-artifact, setup-node, setup-lxd, github-script).

A user has raised concerns about release frequency ([#2235](https://github.com/IsmaelMartinez/teams-for-linux/issues/2235)) requesting a slower cadence. The plan for v2.7.10 is to take a more measured approach: accumulate bug fixes and stability improvements, stay on Electron 39, and release when there's a meaningful batch of changes rather than rapid incremental releases.

There are currently 12 open issues and 12 open PRs. The open issues centre around calls/media (#2231 calls failing, #2169 camera broken), notifications (#2248 duplicate alerts), network resilience (#2246 network loss crash), and input (#2216 emoji colon). Many previously tracked issues have been closed: #2217 (screen sharing), #2222/#2221 (mic/camera), #2209/#2204 (thumbnails), #2203 (file upload), #2184 (Quick Chat shortcut), #2131 (MQTT status).

---

## Next Patch Release (v2.7.10)

The goal for v2.7.10 is stability. Stay on Electron 39, merge accumulated bug fixes, land the authenticated Playwright tests, and let the release bake before moving to Electron 40.

### Open PRs to Review/Merge

| PR | Description | Status |
|----|-------------|--------|
| [#2251](https://github.com/IsmaelMartinez/teams-for-linux/pull/2251) | Skip shortcut processing when no modifier keys held (emoji colon fix) | Open, addresses [#2216](https://github.com/IsmaelMartinez/teams-for-linux/issues/2216) |
| [#2249](https://github.com/IsmaelMartinez/teams-for-linux/pull/2249) | Improve window lifecycle handling and network error resilience | Open, addresses [#2246](https://github.com/IsmaelMartinez/teams-for-linux/issues/2246) |
| [#2234](https://github.com/IsmaelMartinez/teams-for-linux/pull/2234) | Simplify app termination and add MQTT error handling | Open, review together with #2249 for overlap |
| [#2262](https://github.com/IsmaelMartinez/teams-for-linux/pull/2262) | Resolve SonarCloud issues in run.sh | Open |
| [#2253](https://github.com/IsmaelMartinez/teams-for-linux/pull/2253) | Tray window toggle with minimize/restore support | Open, addresses [#2215](https://github.com/IsmaelMartinez/teams-for-linux/issues/2215) |
| [#2250](https://github.com/IsmaelMartinez/teams-for-linux/pull/2250) | Expand MS Teams protocol regex for all deep link types | Open, addresses [#2228](https://github.com/IsmaelMartinez/teams-for-linux/issues/2228) |
| [#2207](https://github.com/IsmaelMartinez/teams-for-linux/pull/2207) | Simplify screen source selection for Wayland compatibility | Carry-over from v2.7.9 cycle |
| [#2245](https://github.com/IsmaelMartinez/teams-for-linux/pull/2245) | Authenticated Playwright tests with Docker login workflow | Open, extends cross-distro testing |
| [#2195](https://github.com/IsmaelMartinez/teams-for-linux/pull/2195) | App menu when tray icon disabled | Carry-over from v2.7.8, addresses [#2186](https://github.com/IsmaelMartinez/teams-for-linux/issues/2186) |
| [#2193](https://github.com/IsmaelMartinez/teams-for-linux/pull/2193) | MQTT screen sharing null sourceId fix | Carry-over from v2.7.8, addresses [#2107](https://github.com/IsmaelMartinez/teams-for-linux/issues/2107) |
| [#2144](https://github.com/IsmaelMartinez/teams-for-linux/pull/2144) | Publish screen sharing status to MQTT (broader feature) | Open, addresses [#2107](https://github.com/IsmaelMartinez/teams-for-linux/issues/2107) |
| [#2223](https://github.com/IsmaelMartinez/teams-for-linux/pull/2223) | Electron 39.5.1 to 40.6.0 (Dependabot) | Deferred to v2.8.0 |

### Open Issues

| Issue | Description | Labels |
|-------|-------------|--------|
| [#2248](https://github.com/IsmaelMartinez/teams-for-linux/issues/2248) | Duplicate alerts for first message, missing content for subsequent | bug, awaiting feedback |
| [#2246](https://github.com/IsmaelMartinez/teams-for-linux/issues/2246) | Crashes on network loss | bug, awaiting feedback |
| [#2235](https://github.com/IsmaelMartinez/teams-for-linux/issues/2235) | Request for slower release cadence | enhancement |
| [#2231](https://github.com/IsmaelMartinez/teams-for-linux/issues/2231) | Something went wrong during calls | bug |
| [#2230](https://github.com/IsmaelMartinez/teams-for-linux/issues/2230) | index.js crash | bug, awaiting feedback |
| [#2228](https://github.com/IsmaelMartinez/teams-for-linux/issues/2228) | Short Teams links on command line | enhancement, awaiting feedback |
| [#2216](https://github.com/IsmaelMartinez/teams-for-linux/issues/2216) | Emoji input via colon not possible | bug, awaiting feedback |
| [#2215](https://github.com/IsmaelMartinez/teams-for-linux/issues/2215) | Click tray icon to switch to opened window | enhancement, awaiting feedback |
| [#2186](https://github.com/IsmaelMartinez/teams-for-linux/issues/2186) | App menu when tray icon disabled | enhancement, awaiting feedback |
| [#2169](https://github.com/IsmaelMartinez/teams-for-linux/issues/2169) | Camera broken during meetings | bug |
| [#2107](https://github.com/IsmaelMartinez/teams-for-linux/issues/2107) | Publish screen sharing status to MQTT | enhancement, awaiting feedback |
| [#1943](https://github.com/IsmaelMartinez/teams-for-linux/issues/1943) | Window size broke when changing app | bug, blocked |

### v2.7.10 Release Plan

1. **Merge bug fixes** --- #2251 (emoji colon), #2249 (network loss), #2234 (app termination), #2262 (SonarCloud run.sh). Review #2234 and #2249 together for overlap. (#2220 custom CSS crash already merged.)
2. **Merge feature PRs** --- #2253 (tray toggle), #2250 (short Teams links), #2207 (screen source selection), #2195 (app menu without tray), #2193/#2144 (MQTT screen sharing).
3. **Land authenticated Playwright tests** --- merge #2245 to extend cross-distro testing with login-gated test scenarios.
4. **Release v2.7.10** --- measured pace, accumulate changes before releasing.

---

## Bot Automation

The issue triage bot has been migrated to a standalone Go service at [github-issue-triage-bot](https://github.com/IsmaelMartinez/github-issue-triage-bot), deployed as a registered GitHub App on Google Cloud Run with Neon PostgreSQL (pgvector) and Gemini 2.5 Flash. See [ADR-018](../adr/018-issue-triage-bot-github-app-migration.md) for the migration decision.

All four phases are running in the standalone service: missing info detection, solution suggestions, duplicate detection, enhancement context surfacing, and misclassification detection. The old GitHub Actions workflows and `.github/issue-bot/` directory have been removed from this repository.

### Remaining work in the triage bot repo

Data seeding (all 1,356 issues, feature index), a public dashboard for bot activity transparency, and Batch 3 (pre-research prompt generator for issues labelled `needs-research`). See the triage bot repo's `docs/plans/` for the detailed implementation plan.

---

## Cross-Distro Testing Environment

**ADR:** [ADR-016](../adr/016-cross-distro-testing-environment.md)
**Status:** Shipped in v2.7.9 ([#2226](https://github.com/IsmaelMartinez/teams-for-linux/pull/2226)), with parallel execution modes ([#2261](https://github.com/IsmaelMartinez/teams-for-linux/pull/2261))

The Docker-based testing environment supports 12 configurations (4 distros x 3 display servers) with VNC for interactive testing. Containers are pinned to `linux/amd64` and work on macOS (including Apple Silicon via Rosetta 2) and Linux. PR #2245 extends this with authenticated Playwright tests that run inside the Docker containers.

Future improvements: pre-built images in a container registry, CI job for Dockerfile regression testing, smoke tests that verify app launch (pre-auth only).

---

## Next Minor Release (v2.8.0) --- Deferred

Electron 40 is a major dependency upgrade (Chromium 144, Node.js 24, V8 14.4). The research is complete and there are no blocking breaking changes, but the priority is stabilising on Electron 39 first. The Dependabot PR [#2223](https://github.com/IsmaelMartinez/teams-for-linux/pull/2223) remains open and will be merged after v2.7.10 has been out and confirmed stable.

| Item | Description | Notes |
|------|-------------|-------|
| **Electron 40** | Electron 39.5.1 to 40.6.0 | [Research](../research/electron-40-migration-research.md); Dependabot PR [#2223](https://github.com/IsmaelMartinez/teams-for-linux/pull/2223) open |
| **Dependency cleanup** | Removed `lodash`, `node-sound`, `electron-positioner` | [Implemented](../research/dependency-review-2026.md); reduces to 6 production deps |
| **Notification sound overhaul Phase 2** | Custom sound configuration | [Research](../research/notification-sound-overhaul-research.md); Phase 1 (player replacement) done |

---

## Feature Details

### MQTT Screen Sharing Status

**Issue:** [#2107](https://github.com/IsmaelMartinez/teams-for-linux/issues/2107)
**Related:** [mqtt-extended-status-investigation.md](../research/mqtt-extended-status-investigation.md)
**Status:** PR [#2193](https://github.com/IsmaelMartinez/teams-for-linux/pull/2193) fixes null sourceId crash. PR [#2144](https://github.com/IsmaelMartinez/teams-for-linux/pull/2144) open for the broader feature.

---

## Requires Validation First

### Speaking Indicator

**Issue:** [#2290](https://github.com/IsmaelMartinez/teams-for-linux/issues/2290)
**Research:** [speaking-indicator-research.md](../research/speaking-indicator-research.md)
**Status:** Research complete, validation spikes created

Real-time visual indicator during calls confirming microphone input is working. Uses `getUserMedia()` interception (proven pattern from `disableAutogain.js`) + `AudioContext`/`AnalyserNode` for audio level detection. Renders a small in-page overlay with speaking/silent/muted states. Also activates the dormant `microphone-state-changed` IPC channel for MQTT home automation.

**Validation spikes** (in `spikes/speaking-indicator/`):
1. `spike-audio-analyser.js` --- AudioContext + AnalyserNode overhead and correctness
2. `spike-getUserMedia-chain.js` --- Four-layer getUserMedia patch composition
3. `spike-track-mute-detection.js` --- Track mute/unmute event reliability

**Next steps:** Run spikes in a live Teams call, confirm CPU/memory overhead is acceptable, then implement Phase 1 MVP.

---

## Awaiting User Feedback

These features have completed initial implementation. Further phases depend on user requests.

### Quick Chat Access

**Issue:** [#2109](https://github.com/IsmaelMartinez/teams-for-linux/issues/2109)
**Status:** Shipped in v2.7.4

Phase 2 (if requested): notification click-to-chat, recent contacts cache, favorites list.

### MQTT Extended Status Phase 2

**Research:** [mqtt-extended-status-investigation.md](../research/mqtt-extended-status-investigation.md)
**Status:** Phase 1 Complete

Phase 2 (if requested): WebRTC monitoring for camera/microphone state, granular media state topics. Trigger: user confirms they need granular camera/mic state for RGB LED automation.

### Graph API Enhanced Features

**Research:** [graph-api-integration-research.md](../research/graph-api-integration-research.md)
**Status:** Phase 1 POC Complete

Phase 2 (if requested): calendar sync with desktop notifications, mail preview notifications, retry logic. Note: Presence endpoint returns 403 --- Teams token lacks `Presence.Read` scope.

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

## Implementation Priorities

### v2.7.9 (Pre-release 2026-02-27)

Included screen sharing Wayland regression fix (#2219), locale detection fix (#2210), Quick Chat shortcut improvements (#2188), Intune auth improvements (#2242), MQTT diagnostic logging (#2197), cross-distro testing environment (#2226, #2261), SonarQube fixes (#2247), bot automation Batch 1 (#2259, #2260), and multiple dependency/CI updates.

### v2.7.10 Release Plan

1. **Bug fixes** --- emoji colon input (#2251), network loss resilience (#2249), app termination (#2234), SonarCloud run.sh (#2262)
2. **Feature PRs** --- tray toggle (#2253), short Teams links (#2250), screen source selection (#2207), app menu without tray (#2195), MQTT screen sharing (#2193, #2144)
3. **Authenticated Playwright tests** --- Docker login workflow and test scenarios (#2245)
4. **Measured release** --- accumulate changes, let them bake before releasing

### v2.8.0 Release Plan (Deferred)

1. **Electron 40 upgrade** --- merge when v2.7.10 is stable and confirmed
2. **Notification sound overhaul** --- bundle with the Electron upgrade if timing aligns
3. **Release v2.8.0**

### Future Priorities

- **Bot Batch 3** --- pre-research prompt generator (to be implemented in the [triage bot repo](https://github.com/IsmaelMartinez/github-issue-triage-bot))
- **Cross-distro testing CI** --- build Docker images in CI to catch Dockerfile regressions
- **Automated smoke tests** --- verify app launches in the cross-distro environment (pre-auth only)

### Principles

- **Validate first:** Run spikes before implementing complex features
- **Start simple:** Build MVP, add complexity only if needed
- **User-driven:** Implement Phase 2 features only when users request them
- **Linux-first:** Embrace Unix philosophy --- composable tools over monolithic features
- **Measured releases:** Accumulate meaningful changes rather than rapid incremental releases ([#2235](https://github.com/IsmaelMartinez/teams-for-linux/issues/2235))
- **Automate triage, not decisions:** Bots surface information; maintainers decide

---

## Related Documentation

- [Research Index](../research/README.md) - Detailed research documents
- [ADR Index](../adr/README.md) - Architecture decision records
- [Contributing Guide](../contributing.md) - Development guidelines
- [Module Index](../module-index.md) - Codebase structure

### Recent ADRs

- [ADR-016: Cross-Distro Testing Environment](../adr/016-cross-distro-testing-environment.md) - Docker + noVNC + Codespaces for testing
- [ADR-017: workflow_run for PR Artifact Comments](../adr/017-workflow-run-pr-comments.md) - Fork PR support for artifact comments
- [ADR-018: Issue Triage Bot GitHub App Migration](../adr/018-issue-triage-bot-github-app-migration.md) - Migration from in-repo workflows to standalone service
