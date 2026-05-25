# Research Documentation

This directory contains research, analysis, and strategic insights generated during the development and improvement of Teams for Linux.

:::info Research Context
These documents capture in-depth analysis and strategic insights that inform development decisions and provide context for major features.
:::

## Contents

### Ready for Implementation

- **[System Performance Research](system-performance-research.md)** - Renderer overhead, main process I/O, and metrics infrastructure
  - Identifies 10 performance-sensitive patterns (MutationObserver sprawl, polling, sequential I/O)
  - Proposes lightweight startup/memory instrumentation with zero dependencies
  - **Status:** Item 5 (`shortcuts.js` polling) shipped; items 1, 2, 3, 4, 8 remaining and being addressed opportunistically

- **[MQTT Microphone State via Speaking Indicator](mqtt-microphone-state-research.md)** - Publish speaking/silent/muted state to MQTT
  - Wires existing speaking indicator WebRTC detection into MQTT via `microphone-state-changed` IPC
  - Completes original request from #1938 (@vbartik's RGB LED home automation)
  - **Status:** Implemented in [PR #2497](https://github.com/IsmaelMartinez/teams-for-linux/pull/2497) (open, awaiting test confirmation); doc to be deleted on merge

### First Iteration Shipped — Awaiting Feedback

- **[Join Meeting Window Takeover Research](join-meeting-window-takeover-research.md)** — "Join Meeting" replacing the whole window ([#2322](https://github.com/IsmaelMartinez/teams-for-linux/issues/2322))
  - First iteration: same-origin deep-link navigation + `Return to Teams` menu item
  - Caveat: authenticated-org path not verifiable locally; some takeovers are Microsoft-enforced
  - Follow-ups: navigation-event auto-return, dedicated meeting window, keyboard accelerator

### Awaiting User Feedback

- **[MQTT Extended Status Investigation](mqtt-extended-status-investigation.md)** - Extended MQTT status publishing
  - **Phase 1 Shipped**: Infrastructure, LWT, call state, screen-sharing topics
  - **Phase 2 Microphone In Flight**: Driven by speaking-indicator audioLevel; implementation in [PR #2497](https://github.com/IsmaelMartinez/teams-for-linux/pull/2497)
  - **Phase 2 Camera Deferred**: `track.enabled` polling approach needs validation before wiring to MQTT

- **[Graph API Integration Research](graph-api-integration-research.md)** - Microsoft Graph API for enhanced features
  - **Phase 1 Shipped (v2.7.4)**: Token acquisition plus 7 IPC channels (user profile, calendar events/view, calendar create, mail messages, People search, send chat). People search and send chat power Quick Chat (ADR-014, ADR-015)
  - **Phases 2-3**: Calendar widget, mail preview, presence, settings UI — not started

### Reference

- **[Project Management Tools Research](project-management-tools-research.md)** - Evaluation of Beads, release-please, release-it, and other tooling for solo OSS maintainer workflows. Status: Research complete, no implementation decision.



### Historical (Migrated)

- **[Configuration Organization Research](configuration-organization-research.md)** - Configuration system improvements
  - **Phase 1 Complete**: Documentation reorganization
  - **Phases 2-3**: Nested structure migration happening incrementally

### Shipped (Retained for Reference)

- **[Custom Notification System Research](custom-notification-system-research.md)** - Alternative notification modal system
  - **MVP shipped** in v2.6.16: toast notifications with auto-dismiss and click-to-focus
  - **Phase 2 dropped**: notifications worked on maintainer's machine but not for the requesting user
  - Retained because future requests for custom notifications should reference the lessons learned here

### Implemented Features (Research Removed)

Research documents are deleted once a feature is fully shipped and the document provides no ongoing reference value. The ADRs and git history preserve the decisions and context.

| Feature | Version | Reference |
|---------|---------|-----------|
| Notification Sound Player (inline replacement for `node-sound`) | v2.7.10 | Phase 1 of the notification-sound research shipped — `paplay`/`pw-play`/`aplay`/`afplay` detection in `app/audio/player.js`. See [PR #2306](https://github.com/IsmaelMartinez/teams-for-linux/pull/2306) |
| Cross-Distro CI Smoke Test | v2.7.x | Workflow `.github/workflows/cross-distro-smoke.yml` ships the design proposed in the original research. Umbrella decision in [ADR-016](../adr/016-cross-distro-testing-environment.md) |
| Electron 41 Upgrade | v2.8.0 | Repo skipped Electron 40 entirely and jumped 39.8.2 → 41.x via dependabot [PR #2347](https://github.com/IsmaelMartinez/teams-for-linux/pull/2347), with follow-up bumps to 41.5.0; the Electron 40 migration research is therefore obsolete |
| Issue-PR Release Linking | v2.7.11 | GraphQL `closingIssuesReferences` query; `closes:` metadata in changelog files. See [PR #2317](https://github.com/IsmaelMartinez/teams-for-linux/pull/2317) |
| Codebase Review (March 2026) | v2.7.x | Code quality, maintainability, performance, and DX review; findings addressed incrementally |
| Issue Triage Bot | v2.7.x | All four phases implemented; migrated to standalone Go service. See [ADR-018](../adr/018-issue-triage-bot-github-app-migration.md) and [github-issue-triage-bot](https://github.com/IsmaelMartinez/github-issue-triage-bot) |
| Dependency Cleanup | v2.7.10 | Removed `node-sound`, `lodash`, `electron-positioner`; project now has 6 production deps |
| Speaking Indicator | v2.7.11 | WebRTC `getStats()` for three-state mute/speaking detection. See [PR #2299](https://github.com/IsmaelMartinez/teams-for-linux/pull/2299) |
| Electron-Updater Auto-Update | v2.7.6 | [ADR-011](../adr/011-appimage-update-info.md); research covered electron-updater integration |
| External Changelog Generation | v2.7.x | [ADR-005](../adr/005-ai-powered-changelog-generation.md); fork detection + release automation shipped |
| Screen Lock Media Privacy | --- | Closed ([#2106](https://github.com/IsmaelMartinez/teams-for-linux/issues/2106)); no user interest; work preserved in branch |
| Tray Icon Logout Indicator | --- | Archived ([#1987](https://github.com/IsmaelMartinez/teams-for-linux/issues/1987)); user not responding; work preserved in branch |
| External Browser Authentication | --- | Not feasible; Teams manages OAuth internally ([#2017](https://github.com/IsmaelMartinez/teams-for-linux/issues/2017)) |
| GNOME Search Provider | --- | Not recommended; latency too high for acceptable UX ([#2075](https://github.com/IsmaelMartinez/teams-for-linux/issues/2075)) |
| Code Quality Hardening (Phases 1-3) | v2.7.5 | Logging hygiene, resilience, input handling, IPC hardening, CI/CD gates |
| Wayland/X11 Ozone Platform | v2.7.4 | Force X11 by default due to Electron 38+ Wayland regressions |
| Quick Chat / Chat Modal | v2.7.4 | [ADR-014](../adr/014-quick-chat-deep-link-approach.md), [ADR-015](../adr/015-quick-chat-inline-messaging.md) |
| PII Log Sanitization | v2.7.2 | [ADR-013](../adr/013-pii-log-sanitization.md) |
| DOM Access Restoration | v2.5.2 | Hybrid API + DOM approach for React compatibility |
| Architecture Modernization | --- | Rejected (DDD too complex) --- incremental refactoring adopted instead |
| MQTT Commands | v2.6.x | Bidirectional MQTT support for toggle-mute, toggle-video, etc. |
| Calendar Data Export | v2.6.x | MQTT `get-calendar` command |
| useSystemPicker | --- | Rejected --- [ADR-008](../adr/008-usesystempicker-electron-38.md) |

## Purpose

These documents capture strategic insights, comprehensive analysis, research findings, and context that inform development decisions and provide rationale for major features.

## Document Lifecycle

Research documents follow this lifecycle:

1. **Active Research Phase**: Document findings, analysis, and recommendations
2. **Decision Phase**: Use research to inform final decisions (implemented or rejected)
3. **Archive Phase**: Move content to appropriate location after decision:
   - **Implemented features**: Create ADR if significant, update feature docs, delete research
   - **Rejected features**: Create/update ADR with concise decision record, delete research
   - **Superseded research**: Close with reference to superseding document
4. **History**: Git commit history preserves full investigation context

## Contributing Research

When adding new research documents:

1. **Follow naming convention**: Use descriptive, kebab-case filenames
2. **Include context**: Date, scope, and purpose of analysis
3. **Link related documents**: Cross-reference relevant files
4. **Update this index**: Add entries for new research documents
5. **Provide actionable outcomes**: Include clear recommendations or decisions

## Related Documentation

- [Configuration Options](../../configuration.md) - Application configuration reference
- [IPC API](../ipc-api.md) - Developer integration documentation
- [Architecture Decision Records](../adr/README.md) - Formal architectural decisions
- [Development Roadmap](../plan/roadmap.md) - Future development plans
