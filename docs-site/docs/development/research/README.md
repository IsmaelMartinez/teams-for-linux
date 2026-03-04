# Research Documentation

This directory contains research, analysis, and strategic insights generated during the development and improvement of Teams for Linux.

:::info Research Context
These documents capture in-depth analysis and strategic insights that inform development decisions and provide context for major features.
:::

## Contents

### Ready for Implementation

- **[Electron 40 Migration Research](electron-40-migration-research.md)** - Migration from Electron 39.5.1 to 40.6.0
  - Covers breaking changes, Node.js 22→24 impact, Chromium 142→144 changes
  - ESLint 10 section already shipped in v2.7.8
  - **Status:** Research complete, deferred to v2.8.0 (staying on Electron 39 for stability)

- **[Notification Sound Overhaul Research](notification-sound-overhaul-research.md)** - Replace `node-sound`, consolidate notification config
  - Evaluates Web Audio, data URI, and system command approaches
  - Proposes phased plan: replace native addon, add custom sounds, Web Audio fallback
  - **Status:** Research complete, targeted for v2.8.0

### Awaiting User Feedback

- **[MQTT Extended Status Investigation](mqtt-extended-status-investigation.md)** - Extended MQTT status publishing
  - **Phase 1 Shipped**: Infrastructure, LWT, and call state publishing
  - **Phase 2 Deferred**: WebRTC camera/mic monitoring awaiting user feedback
  - **Screen sharing:** PRs [#2193](https://github.com/IsmaelMartinez/teams-for-linux/pull/2193) and [#2144](https://github.com/IsmaelMartinez/teams-for-linux/pull/2144) open for MQTT screen sharing status

- **[Graph API Integration Research](graph-api-integration-research.md)** - Microsoft Graph API for enhanced features
  - **Phase 1 POC Complete**: Token acquisition, calendar/mail endpoints working
  - **Phases 2-3**: Enhanced features and user-facing UI not started

### Strategic Documentation

- **[GitHub Issue Bot Investigation](github-issue-bot-investigation.md)** - Intelligent GitHub issue automation
  - **Phases 1-3 Shipped**: Information request bot, AI-powered solution suggester, duplicate detection
  - **Batch 1 Shipped**: Real-time index refresh, accuracy feedback loop, changelog model consolidation
  - **Phase 4 planned**: Enhancement triage (context, feasibility, misclassification detection)

- **[AI Automation Review and Enhancements](ai-automation-review-and-enhancements.md)** - Review of all AI automation systems and enhancement proposals
  - Reviews changelog generator, issue triage bot (3 phases), issue index, Claude Code integration
  - **Batch 1 Implemented**: Real-time index refresh, bot accuracy feedback loop, changelog model consolidation
  - **Batch 2 Next**: Enhancement triage (Phase 4)
  - **Batch 3 Future**: Pre-research prompt generator (Phase 3.2)

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
