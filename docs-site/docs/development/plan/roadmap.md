# Development Roadmap

**Last Updated:** 2026-03-22
**Current Version:** v2.7.12 (Electron 39.8.2)
**Status:** Living Document --- stabilising on Electron 39; next focus is testing infrastructure and dev experience

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

A [system performance audit](../research/system-performance-research.md) identified 10 performance-sensitive patterns across renderer-side browser tools, main-process I/O, and network handling. Item 5 (unbounded polling in shortcuts.js) has been fixed. The remaining high-priority items --- consolidating MutationObservers (items 2/3), caching tray icon resources (item 4), replacing timestamp polling (item 1), and parallelising offline detection (item 8) --- are low-to-medium effort and can be addressed opportunistically during the v2.7.x line.

### Media and Calls

Camera and microphone issues remain the most common user-reported bugs. Recent work adds explicit permission check handling so the browser correctly reports "granted" for media queries. A speaking indicator ([#2290](https://github.com/IsmaelMartinez/teams-for-linux/issues/2290)) has been implemented using WebRTC `getStats()` to give users three-state feedback (speaking, silent, muted) during calls — landing in v2.7.11 for user testing.

Longer-standing camera issues ([#2169](https://github.com/IsmaelMartinez/teams-for-linux/issues/2169)) and call failures ([#2231](https://github.com/IsmaelMartinez/teams-for-linux/issues/2231)) are upstream-blocked and depend on Chromium/Electron improvements. New reports of meeting join replacing the whole window ([#2322](https://github.com/IsmaelMartinez/teams-for-linux/issues/2322)) and xdg-open not working with newer meeting URLs ([#2323](https://github.com/IsmaelMartinez/teams-for-linux/issues/2323)) are under investigation.

### Wayland Compatibility

Wayland support is improving incrementally. Screen source selection has been simplified for better Wayland compatibility, and short Teams deep links now work across all link types. Idle status on Wayland ([#1827](https://github.com/IsmaelMartinez/teams-for-linux/issues/1827)) remains blocked on Electron's `powerMonitor` API not supporting Wayland idle detection natively.

### MQTT Integration

The MQTT integration is mature for presence status, media state, inbound commands, and now screen sharing status ([#2107](https://github.com/IsmaelMartinez/teams-for-linux/issues/2107), shipped). Phase 2 extended status (granular WebRTC camera/mic monitoring for reliable mute state) is parked until users confirm they need it.

### Testing Infrastructure

Cross-distro testing shipped in v2.7.9 with Docker-based environments supporting 9 configurations (3 distros x 3 display servers). Authenticated Playwright tests landed in v2.7.10. The infrastructure works well for Ubuntu (7/7 tests pass on X11 and XWayland, 6/6 on Wayland) but Fedora and Debian remain unvalidated. The current focus is closing these gaps and connecting cross-distro testing to the CI pipeline so it gates builds rather than running as a separate manual workflow.

---

## Open PRs --- Awaiting User Validation

Seven PRs are open, all awaiting community testing. Six are authored by the maintainer and have only automated bot reviews (gemini-code-assist). No human reviewers have tested the proposed fixes on their setups. These PRs address real user-reported bugs, but the reporters haven't returned to validate.

| PR | Fix | Linked Issue | Age |
|----|-----|-------------|-----|
| [#2331](https://github.com/IsmaelMartinez/teams-for-linux/pull/2331) | Media permissions for call crashes | Call crashes | 1 day |
| [#2330](https://github.com/IsmaelMartinez/teams-for-linux/pull/2330) | CSP relaxation for third-party SSO | [#2326](https://github.com/IsmaelMartinez/teams-for-linux/issues/2326) | 1 day |
| [#2329](https://github.com/IsmaelMartinez/teams-for-linux/pull/2329) | Notification lifecycle stubs | Notification errors | 2 days |
| [#2319](https://github.com/IsmaelMartinez/teams-for-linux/pull/2319) | SSO reload for blank calendar | [#2296](https://github.com/IsmaelMartinez/teams-for-linux/issues/2296) | 4 days |
| [#2207](https://github.com/IsmaelMartinez/teams-for-linux/pull/2207) | Wayland screen sharing simplification | Wayland compat | 3 weeks |
| [#2193](https://github.com/IsmaelMartinez/teams-for-linux/pull/2193) | Null sourceId for MQTT publish | MQTT screen share | 3 weeks |
| [#2223](https://github.com/IsmaelMartinez/teams-for-linux/pull/2223) | Electron 40 bump (Dependabot) | v2.8.0 | 3 weeks |

Decision needed: self-merge the fixes where confidence is high, or wait for user validation. The cross-distro testing improvements below would partly address this by letting the maintainer validate across environments without needing reporter feedback.

---

## Next Up: Testing Infrastructure and Dev Experience

These are the next priorities --- work the maintainer can drive without waiting on external feedback.

### Phase 1 --- Cross-Distro Testing Hardening

The `tests/cross-distro/` setup has strong foundations (Docker Compose, 9 configurations, authenticated Playwright, `run-all-tests.sh`) but several gaps need closing before it becomes a reliable validation tool for Electron upgrades and PR testing.

**Fix Fedora session incompatibility.** Fedora's npm installs a different Node.js/Electron version, so sessions created on Ubuntu are incompatible. The fix is to pin the Electron version across all Dockerfiles or run `--login` separately per distro. Pinning is simpler and should be tried first --- add an `ELECTRON_VERSION` build arg to the Dockerfiles so all three distros install the same binary.

**Validate Debian.** Debian was never tested (Codespace disk ran out). Run the full suite locally and fix any issues. Debian Bookworm is a conservative base and should be the easiest to get working.

**Expand the authenticated test suite.** The current 6-7 tests cover app launch, screen sharing basics, and window management, but the features that actually break during Electron upgrades (notifications, media permissions, SSO recovery) are untested. Add tests for the notification stub interface, permission check handler responses, and auth recovery after token expiry.

**Clean up the PLAN document.** The `PLAN-docker-playwright-tests.md` has stale open questions and status from February. Either fold the remaining decisions into this roadmap and delete the file, or update it to reflect current state.

### Phase 2 --- CI Integration

**Gate builds on E2E tests.** Currently `linux_x64` packaging depends only on `lint_and_audit`. The `e2e_tests` job runs but failures don't block packaging or merges. Add `e2e_tests` to the `needs` list for packaging jobs.

**Cross-distro CI smoke test (implemented).** A GitHub Actions workflow (`cross-distro-smoke.yml`) runs 9 configurations in parallel on push to main, building Docker images and verifying the app starts and reaches the login page. See the [design spec](../research/cross-distro-ci-smoke-test-design.md) and [implementation plan](cross-distro-ci-smoke-test-plan.md). The test directory was also restructured: `testing/cross-distro/` moved to `tests/cross-distro/` with npm scripts (`npm run cross-distro`, `npm run cross-distro:list`) for project-root access.

**Add `.nvmrc`.** Pin the Node version (currently 22) so contributors and CI use the same version. The Dockerfiles should reference this too.

### Phase 3 --- Dev Experience Quick Wins

**PR template.** The codebase review flagged this as missing. A simple template ensuring PRs reference issues, describe testing done, and note any doc updates.

**Evaluate release-please.** The [project management tools research](../research/project-management-tools-research.md) identified release-please as the single highest-leverage improvement for automating version bumps, changelog generation, and tag creation from conventional commits. The current manual release process (`npm run release:prepare`) works but doesn't scale. Worth a spike to see how it fits with the existing changelog generator workflow.

**Stale bot tuning.** A stale bot workflow exists (`.github/workflows/stale.yml`) but the "awaiting user feedback" issues suggest it may need tuning --- issues where the reporter goes silent should get auto-closed after a reasonable period rather than sitting open indefinitely.

**Beads --- bookmarked, not needed yet.** [Beads](https://github.com/steveyegge/beads) (`@beads/bd`, v0.60.0) is a git-backed task graph for AI agent memory across sessions. With Opus 4.6's 1M token context window and auto-compaction, multi-step features like cross-distro testing or FIDO2 can fit in a single extended session, reducing the need for cross-session handovers. The current workflow (CLAUDE.md + memory directory + roadmap) covers the remaining cases well. Revisit if workflows regularly exceed what 1M tokens can hold. See the [project management tools research](../research/project-management-tools-research.md) for the full evaluation.

---

## Next Minor Release (v2.8.0) --- Deferred

Electron 40 is a major dependency upgrade (Chromium 144, Node.js 24, V8 14.4). The [research is complete](../research/electron-40-migration-research.md) and there are no blocking breaking changes, but the priority is stabilising on Electron 39 and hardening the testing infrastructure first. The cross-distro test suite should be fully working across all 9 configurations before attempting this upgrade, as Electron upgrades are the primary use case for that infrastructure.

The Dependabot PR [#2223](https://github.com/IsmaelMartinez/teams-for-linux/pull/2223) remains open and will be merged after the v2.7.x line is confirmed stable and the testing infrastructure is ready.

The notification sound overhaul Phase 2 (custom sound configuration, [research complete](../research/notification-sound-overhaul-research.md)) may bundle with the Electron upgrade if timing aligns.

---

## Implemented

### Third-Party SSO CSP Fix

**Issue:** [#2326](https://github.com/IsmaelMartinez/teams-for-linux/issues/2326)
**Status:** [PR #2330](https://github.com/IsmaelMartinez/teams-for-linux/pull/2330) open, validated by user, targeting v2.7.13

Users with third-party SSO providers (e.g. Symantec VIP) were unable to log in because Electron's `contextIsolation: false` erroneously enforces report-only CSP headers as blocking policies. Report-only CSP headers are now automatically stripped for all non-Teams domains (safe, since they should never block). No user configuration is needed. Validated by the reporting user.

**Docs:** [Configuration](../../configuration.md#third-party-sso-and-csp), [Troubleshooting](../../troubleshooting.md#issue-third-party-sso-login-fails-eg-symantec-vip)

### Speaking Indicator

**Issue:** [#2290](https://github.com/IsmaelMartinez/teams-for-linux/issues/2290)
**Status:** Implemented in [PR #2299](https://github.com/IsmaelMartinez/teams-for-linux/pull/2299), landing in v2.7.11

Real-time visual indicator during calls showing microphone state via `RTCPeerConnection.getStats()` `media-source.audioLevel`. Three states: speaking (green), silent (grey), muted (red). Teams zeroes `audioLevel` to exactly 0.0 when muted, making detection reliable and unambiguous.

**Module:** `app/browser/tools/speakingIndicator.js`
**Config:** `media.microphone.speakingIndicator` (boolean, default `false`)
**If requested:** Configurable threshold, position, MQTT `microphone-state-changed` IPC publishing.

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
| Disable Chat Spellcheck | [#2304](https://github.com/IsmaelMartinez/teams-for-linux/issues/2304) | Not feasible | Spellcheck is controlled by Teams/Chromium, not the wrapper; existing `spellCheckerLanguages` config is the extent of our control |
| Formatting View on Compose | [#2318](https://github.com/IsmaelMartinez/teams-for-linux/issues/2318) | Not feasible | Teams UI internals; no API or injection point to control compose view state |

---

## Infrastructure

### Bot Automation

The issue triage bot has been migrated to a standalone Go service ([github-issue-triage-bot](https://github.com/IsmaelMartinez/github-issue-triage-bot)), deployed as a GitHub App on Google Cloud Run with Neon PostgreSQL and Gemini 2.5 Flash. See [ADR-018](../adr/018-issue-triage-bot-github-app-migration.md). Remaining work (data seeding, public dashboard, Batch 3 pre-research prompts) lives in that repo.

### Cross-Distro Testing

Shipped in v2.7.9 ([ADR-016](../adr/016-cross-distro-testing-environment.md)). Docker-based environment supporting 9 configurations (3 distros x 3 display servers) with VNC for interactive testing. Authenticated Playwright tests landed in v2.7.10. Current state: Ubuntu passes all tests, Fedora fails due to session incompatibility (different Electron version), Debian untested. See "Phase 1 --- Cross-Distro Testing Hardening" above for the plan to close these gaps.

### Configuration Modernization

New features use nested config patterns from day one (`mqtt.*`, `graphApi.*`, `customNotification.*`, `screenSharing.*`, `auth.*`, `media.*`). Existing flat options migrate opportunistically when modules are refactored --- no dedicated migration effort planned. See the [configuration organization research](../research/configuration-organization-research.md) for the full analysis and proposed nested structures.

---

## Release History

### v2.7.11 (2026-03-14)

Null sourceId fix for MQTT screen sharing publish, short Teams deep link support, explicit media permission check handling, speaking indicator as experimental feature, auth state recovery improvements, restructured roadmap and enhanced changelog pipeline.

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
