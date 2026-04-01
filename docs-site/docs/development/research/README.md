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
  - **Status:** Research complete, prioritized implementation plan included

- **[Electron 40 Migration Research](electron-40-migration-research.md)** - Migration from Electron 39.5.1 to 40.6.0
  - Covers breaking changes, Node.js 22→24 impact, Chromium 142→144 changes
  - ESLint 10 section already shipped in v2.7.8
  - **Status:** Research complete, deferred to v2.8.0 (staying on Electron 39 for stability)

- **[Notification Sound Overhaul Research](notification-sound-overhaul-research.md)** - Replace `node-sound`, consolidate notification config
  - Evaluates Web Audio, data URI, and system command approaches
  - Proposes phased plan: replace native addon, add custom sounds, Web Audio fallback
  - **Status:** Research complete, targeted for v2.8.0

- **[MQTT Microphone State via Speaking Indicator](mqtt-microphone-state-research.md)** - Publish speaking/silent/muted state to MQTT
  - Wires existing speaking indicator WebRTC detection into MQTT via `microphone-state-changed` IPC
  - Completes original request from #1938 (@vbartik's RGB LED home automation)
  - **Status:** Research complete, ready for implementation (depends on PR #2299 merged)

### Awaiting User Feedback

- **[MQTT Extended Status Investigation](mqtt-extended-status-investigation.md)** - Extended MQTT status publishing
  - **Phase 1 Shipped**: Infrastructure, LWT, call state, camera, microphone, and screen sharing topics
  - **Screen sharing null sourceId fix**: PR [#2193](https://github.com/IsmaelMartinez/teams-for-linux/pull/2193) landing in v2.7.11
  - **Screen sharing broader feature**: PR [#2144](https://github.com/IsmaelMartinez/teams-for-linux/pull/2144) awaiting user confirmation ([#2107](https://github.com/IsmaelMartinez/teams-for-linux/issues/2107))
  - **Phase 2 Deferred**: Reliable mute/speaking state via WebRTC `getStats()` is now proven (see speaking indicator [PR #2299](https://github.com/IsmaelMartinez/teams-for-linux/pull/2299)); wiring to MQTT awaits user demand

- **[Graph API Integration Research](graph-api-integration-research.md)** - Microsoft Graph API for enhanced features
  - **Phase 1 POC Complete**: Token acquisition, calendar/mail endpoints working
  - **Phases 2-3**: Enhanced features and user-facing UI not started

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
