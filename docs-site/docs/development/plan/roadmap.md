# Development Roadmap

**Last Updated:** 2026-04-17
**Current Version:** v2.7.13 → v2.8.0 in progress (Electron 41.0.2, Chromium 146, Node.js 24)
**Status:** Living Document --- Electron 41 upgrade in PR [#2347](https://github.com/IsmaelMartinez/teams-for-linux/pull/2347); cross-distro tests passing 9/9; next focus is bug fixes and dev experience

This document outlines the development direction for Teams for Linux. It focuses on themes and priorities rather than individual PRs. For live tracking see [GitHub Issues](https://github.com/IsmaelMartinez/teams-for-linux/issues), [Pull Requests](https://github.com/IsmaelMartinez/teams-for-linux/pulls), and [Releases](https://github.com/IsmaelMartinez/teams-for-linux/releases).

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

Login persistence after session expiry ([#2364](https://github.com/IsmaelMartinez/teams-for-linux/issues/2364)) and third-party SSO failures ([#2326](https://github.com/IsmaelMartinez/teams-for-linux/issues/2326)) are addressed. Remaining auth work: validate that the less-aggressive resume recovery path handles all org-policy session lengths correctly, and investigate the `[TOKEN_CACHE] Secure storage not available` issue on KDE/KWallet where `safeStorage` should be called via IPC from the main process.

A [system performance audit](../research/system-performance-research.md) identified 10 performance-sensitive patterns across renderer-side browser tools, main-process I/O, and network handling. Item 5 (unbounded polling in shortcuts.js) has been fixed. The remaining high-priority items --- consolidating MutationObservers (items 2/3), caching tray icon resources (item 4), replacing timestamp polling (item 1), and parallelising offline detection (item 8) --- are low-to-medium effort and can be addressed opportunistically during the v2.7.x line.

### Media and Calls

Camera and microphone issues remain the most common user-reported bugs. Recent work adds explicit permission check handling so the browser correctly reports "granted" for media queries. A speaking indicator ([#2290](https://github.com/IsmaelMartinez/teams-for-linux/issues/2290)) is available using WebRTC `getStats()` to give users three-state feedback (speaking, silent, muted) during calls.

Call drops on multi-interface systems ([#2349](https://github.com/IsmaelMartinez/teams-for-linux/issues/2349)) are addressed via a `webRTCIPHandlingPolicy` config option. Users with VPN + physical NIC setups should test with `"default_public_interface_only"` and report back.

MQTT in-call detection from the small popup window ([#2358](https://github.com/IsmaelMartinez/teams-for-linux/issues/2358)) is now fixed. The solution uses WebRTC-based call state detection in `speakingIndicator.js` to emit `call-connected`/`call-disconnected` events through `activityHub` when RTCPeerConnection state changes. This works regardless of which hang-up button the user clicks. The RTCPeerConnection patching activates when either `media.microphone.speakingIndicator` or `mqtt.enabled` is true.

Meeting join replacing the whole window ([#2322](https://github.com/IsmaelMartinez/teams-for-linux/issues/2322)) has been investigated --- all three code paths that handle meeting URLs call `window.loadURL()`, destroying the Teams SPA. Fix approach TBD (auto-navigate back vs separate BrowserWindow).

Longer-standing camera issues ([#2169](https://github.com/IsmaelMartinez/teams-for-linux/issues/2169)) and call failures ([#2231](https://github.com/IsmaelMartinez/teams-for-linux/issues/2231)) are upstream-blocked and depend on Chromium/Electron improvements.

### Wayland Compatibility

Wayland support is improving incrementally. Screen source selection has been simplified for better Wayland compatibility, and short Teams deep links now work across all link types. Idle status on Wayland ([#1827](https://github.com/IsmaelMartinez/teams-for-linux/issues/1827)) remains blocked on Electron's `powerMonitor` API not supporting Wayland idle detection natively. A forced idle override option is now available as a workaround.

**Revisit forced X11 default (Electron 41).** Since v2.7.4, `--ozone-platform=x11` has been baked into `executableArgs` for all Linux package formats to override Electron 38's auto-detection, which routed Wayland users into a broken native Wayland backend. With Electron 41 (Chromium 146) now in v2.8.0, upstream Ozone/Wayland fixes may have resolved the underlying rendering bugs, making it safe to restore auto-detection via `--ozone-platform=auto`. See [research](../research/wayland-ozone-platform-revisit-research.md) and [validation plan](wayland-electron41-validation.md). Next step: run the three-phase validation (automated smoke tests on `ubuntu/fedora/debian-wayland` containers, manual interactive testing against the open Wayland issues, XWayland regression check) and decide between switching to `auto`, shipping dual `.desktop` launchers as a fallback, or keeping forced X11. This is a **v2.9.0 change** — switching to `auto` changes default behavior for every Wayland user (window decorations, scaling, screen-sharing pipeline) and warrants a new minor version.

### MQTT Integration

The MQTT integration is mature for presence status, media state, inbound commands, and screen sharing status ([#2107](https://github.com/IsmaelMartinez/teams-for-linux/issues/2107)). Phase 2 extended status (granular WebRTC camera/mic monitoring for reliable mute state) is parked until users confirm they need it. A feature request for incoming call MQTT topics ([#2370](https://github.com/IsmaelMartinez/teams-for-linux/issues/2370)) has been filed.

### Notifications

The notification lifecycle is now stable ([#2248](https://github.com/IsmaelMartinez/teams-for-linux/issues/2248)). Remaining: the first notification after launch can show a `(N)` title prefix ([#2367](https://github.com/IsmaelMartinez/teams-for-linux/issues/2367)) --- fix in PR [#2377](https://github.com/IsmaelMartinez/teams-for-linux/pull/2377), awaiting user validation.

### Testing Infrastructure

Cross-distro testing shipped in v2.7.9 with Docker-based environments supporting 9 configurations (3 distros x 3 display servers). Authenticated Playwright tests landed in v2.7.10. The infrastructure works well for Ubuntu (7/7 tests pass on X11 and XWayland, 6/6 on Wayland) but Fedora and Debian remain unvalidated. The current focus is closing these gaps and connecting cross-distro testing to the CI pipeline so it gates builds rather than running as a separate manual workflow.

---

## Next Up: Testing Infrastructure and Dev Experience

These are the next priorities --- work the maintainer can drive without waiting on external feedback.

### Phase 1 --- Cross-Distro Testing Hardening

~~**Fix Fedora session incompatibility.**~~ Done (PR [#2386](https://github.com/IsmaelMartinez/teams-for-linux/pull/2386)). All Dockerfiles now install Node.js from the official binary tarball with SHA256 verification, ensuring identical Electron binaries across all containers. A separate `cp` fix in `run-tests.sh` resolved cross-distro UID permission errors. All 9 configurations pass.

~~**Validate Debian.**~~ Done. Debian passes all tests after the Node.js pinning fix.

**Expand the authenticated test suite.** The current 6-7 tests cover app launch, screen sharing basics, and window management, but the features that actually break during Electron upgrades (notifications, media permissions, SSO recovery) are untested. Add tests for the notification stub interface, permission check handler responses, and auth recovery after token expiry.

**Clean up the PLAN document.** The `PLAN-docker-playwright-tests.md` has been partially updated (Fedora session issue and per-distro question marked resolved) but the architecture diagram and some status text are stale. Either fold the remaining decisions into this roadmap and delete the file, or finish updating it.

### Phase 2 --- CI Integration

**Gate builds on E2E tests.** Currently `linux_x64` packaging depends only on `lint_and_audit`. The `e2e_tests` job runs but failures don't block packaging or merges. Add `e2e_tests` to the `needs` list for packaging jobs.

**Cross-distro CI smoke test (implemented).** A GitHub Actions workflow (`cross-distro-smoke.yml`) runs 9 configurations in parallel on push to main, building Docker images and verifying the app starts and reaches the login page. See the [design spec](../research/cross-distro-ci-smoke-test-design.md) and [implementation plan](cross-distro-ci-smoke-test-plan.md). The test directory was also restructured: `testing/cross-distro/` moved to `tests/cross-distro/` with npm scripts (`npm run cross-distro`, `npm run cross-distro:list`) for project-root access.

**~~Add `.nvmrc`.~~** Done. `.nvmrc` added in PR [#2386](https://github.com/IsmaelMartinez/teams-for-linux/pull/2386). Bumped to Node 24 (matching Electron 41's embedded runtime) along with CI workflows and cross-distro Dockerfiles in PR [#2347](https://github.com/IsmaelMartinez/teams-for-linux/pull/2347), pending merge.

### Phase 3 --- Dev Experience Quick Wins

**PR template.** The codebase review flagged this as missing. A simple template ensuring PRs reference issues, describe testing done, and note any doc updates.

**Evaluate release-please.** The [project management tools research](../research/project-management-tools-research.md) identified release-please as the single highest-leverage improvement for automating version bumps, changelog generation, and tag creation from conventional commits. The current manual release process (`npm run release:prepare`) works but doesn't scale. Worth a spike to see how it fits with the existing changelog generator workflow.

**Stale bot tuning.** A stale bot workflow exists (`.github/workflows/stale.yml`) but the "awaiting user feedback" issues suggest it may need tuning --- issues where the reporter goes silent should get auto-closed after a reasonable period rather than sitting open indefinitely.

### Phase 4 --- Claude Code Automations

Quick wins to improve the development workflow using Claude Code's extensibility.

**Auto-lint hook.** Add a PostToolUse hook to `.claude/settings.json` that runs `npm run lint` on every Edit/Write. Catches lint issues immediately instead of at commit time. Using the shared settings file ensures all contributors benefit. Ready to implement now.

**Sensitive file guard hook.** Add a PreToolUse hook to `.claude/settings.json` that blocks edits to `.env`, credentials, and other sensitive files. The CLAUDE.md already documents PII protection rules --- a hook enforces them automatically. Ready to implement now.

**context7 MCP server.** Adds live documentation lookup for Electron, Playwright, and MQTT APIs without leaving the session. Especially useful during Electron upgrades. Install: `claude mcp add context7 -- npx -y @upstash/context7-mcp@latest`. Ready to implement now.

**Project-specific code-reviewer subagent.** A custom subagent that checks for project-specific patterns (IPC allowlist in `ipcValidator.js`, PII logging rules, `trayIconRenderer`/`mqttStatusMonitor` preload requirement) that generic bots miss. Medium effort --- requires writing the agent spec.

**Release skill.** A `/release` skill wrapping the release workflow: check roadmap, generate notes, prepare changelog, update version. Replaces the manual multi-step process. Medium effort.

---

## Next Minor Release (v2.8.0) --- In Progress

Electron 41 is a major dependency upgrade (Chromium 142→146, Node.js 22→24). PR [#2347](https://github.com/IsmaelMartinez/teams-for-linux/pull/2347) bumps Electron from 39.8.2 to 41.0.2 and includes Node.js 24 across all CI workflows, Dockerfiles, and `.nvmrc`. CI passes all checks. The cross-distro test suite is now fully working across all 9 configurations, which was the prerequisite for this upgrade.

Electron 41 includes upstream fixes that may resolve several blocked issues: CSD window sizing on GNOME/Wayland ([#1943](https://github.com/IsmaelMartinez/teams-for-linux/issues/1943)), and broader Ozone/Wayland improvements that may help with the incoming call crash ([#2345](https://github.com/IsmaelMartinez/teams-for-linux/issues/2345)) and Fedora typing issues ([#2335](https://github.com/IsmaelMartinez/teams-for-linux/issues/2335)). Users have been asked to test with the build artifacts.

The notification sound overhaul Phase 2 (custom sound configuration, [research complete](../research/notification-sound-overhaul-research.md)) may bundle with this release if timing aligns.

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

Shipped in v2.7.9 ([ADR-016](../adr/016-cross-distro-testing-environment.md)). Docker-based environment supporting 9 configurations (3 distros x 3 display servers) with VNC for interactive testing. Authenticated Playwright tests landed in v2.7.10. Node.js is now pinned via official binary tarball with SHA256 verification across all Dockerfiles (PR [#2386](https://github.com/IsmaelMartinez/teams-for-linux/pull/2386)), resolving the Fedora session incompatibility and validating Debian. All 9 configurations pass. See "Phase 1 --- Cross-Distro Testing Hardening" above for remaining items (expand test suite, clean up PLAN doc).

### Configuration Modernization

New features use nested config patterns from day one (`mqtt.*`, `graphApi.*`, `customNotification.*`, `screenSharing.*`, `auth.*`, `media.*`). Existing flat options migrate opportunistically when modules are refactored --- no dedicated migration effort planned. See the [configuration organization research](../research/configuration-organization-research.md) for the full analysis and proposed nested structures.

---

## Related Documentation

- [Research Index](../research/README.md) - Detailed research documents
- [ADR Index](../adr/README.md) - Architecture decision records
- [Contributing Guide](../contributing.md) - Development guidelines
- [Module Index](../module-index.md) - Codebase structure
