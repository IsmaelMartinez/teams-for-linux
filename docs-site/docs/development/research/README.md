# Research Documentation

This directory contains research, analysis, and strategic insights generated during the development and improvement of Teams for Linux.

:::info Research Context
These documents capture in-depth analysis and strategic insights that inform development decisions and provide context for major features.
:::

## Contents

### Ready for Implementation

- **[Electron 40 Migration Research](electron-40-migration-research.md)** - Migration from Electron 39.5.1 to 40.4.0
  - Covers breaking changes, Node.js 22→24 impact, Chromium 142→144 changes
  - Includes ESLint 10 migration analysis and codebase audit
  - **Status:** Research complete, targeted for v2.8.0

- **[Notification Sound Overhaul Research](notification-sound-overhaul-research.md)** - Replace `node-sound`, consolidate notification config
  - Evaluates Web Audio, data URI, and system command approaches
  - Proposes phased plan: replace native addon, add custom sounds, Web Audio fallback
  - **Status:** Research complete, targeted for v2.8.0

### Awaiting User Feedback

- **[Screen Lock Media Privacy Investigation](screen-lock-media-privacy-investigation.md)** - Auto-disable camera/mic on screen lock ([Issue #2106](https://github.com/IsmaelMartinez/teams-for-linux/issues/2106))
  - MQTT commands (`disable-media`, `enable-media`) for user scripts
  - **Status:** Implemented but no user traction; see closure PR [#2189](https://github.com/IsmaelMartinez/teams-for-linux/pull/2189)

- **[MQTT Extended Status Investigation](mqtt-extended-status-investigation.md)** - Extended MQTT status publishing
  - **Phase 1 Shipped**: Infrastructure, LWT, and call state publishing
  - **Phase 2 Deferred**: WebRTC camera/mic monitoring awaiting user feedback

- **[Graph API Integration Research](graph-api-integration-research.md)** - Microsoft Graph API for enhanced features
  - **Phase 1 POC Complete**: Token acquisition, calendar/mail endpoints working
  - **Phases 2-3**: Enhanced features and user-facing UI not started

### Strategic Documentation

- **[GitHub Issue Bot Investigation](github-issue-bot-investigation.md)** - Intelligent GitHub issue automation
  - **Phases 1-3 Shipped**: Information request bot, AI-powered solution suggester, duplicate detection
  - **Phase 4 planned**: Enhancement triage (context, feasibility, misclassification detection)

- **[AI Automation Review and Enhancements](ai-automation-review-and-enhancements.md)** - Review of all AI automation systems and enhancement proposals
  - Reviews changelog generator, issue triage bot (3 phases), issue index, Claude Code integration
  - Proposes: real-time index refresh, bot accuracy feedback loop, changelog model consolidation, enhancement triage (Phase 4), pre-research prompt generator
  - **Status:** Proposal — awaiting maintainer review

- **[Configuration Organization Research](configuration-organization-research.md)** - Configuration system improvements
  - **Phase 1 Complete**: Documentation reorganization
  - **Phases 2-3**: Nested structure migration happening incrementally

### Shipped (Historical Reference)

These documents are retained for historical context. The features they describe have been fully implemented and released.

- **[Electron-Updater Auto-Update Research](electron-updater-auto-update-research.md)** - Shipped in v2.7.6
- **[External Changelog Generation Research](external-changelog-generation-research.md)** - Shipped (Phases 1-2)
- **[Custom Notification System Research](custom-notification-system-research.md)** - MVP shipped in v2.6.16; Phase 2 dropped

### Archived / Not Feasible

- **[Logout Indicator Investigation](logout-indicator-investigation.md)** - **ARCHIVED** — user not responding
- **[External Browser Authentication Investigation](external-browser-authentication-investigation.md)** - **NOT FEASIBLE** — Teams manages auth internally
- **[GNOME Search Provider Investigation](gnome-search-provider-investigation.md)** - **NOT RECOMMENDED** — latency too high for acceptable UX

### Implemented Features (Research Removed)

Research documents are deleted once a feature is fully shipped and the document provides no ongoing reference value. The ADRs and git history preserve the decisions and context.

| Feature | Version | Reference |
|---------|---------|-----------|
| Code Quality Hardening (Phases 1-3) | v2.7.5 | Logging hygiene, resilience, input handling, IPC hardening, CI/CD gates, workflow permissions, CODEOWNERS |
| Wayland/X11 Ozone Platform | v2.7.4 | Force X11 by default due to Electron 38+ Wayland regressions |
| Quick Chat / Chat Modal | v2.7.4 | [ADR-014](../adr/014-quick-chat-deep-link-approach.md), [ADR-015](../adr/015-quick-chat-inline-messaging.md) |
| PII Log Sanitization | v2.7.2 | [ADR-013](../adr/013-pii-log-sanitization.md) |
| DOM Access Restoration | v2.5.2 | Hybrid API + DOM approach for React compatibility |
| Architecture Modernization | — | Rejected (DDD too complex) — incremental refactoring adopted instead |
| MQTT Commands | v2.6.x | Bidirectional MQTT support for toggle-mute, toggle-video, etc. |
| Calendar Data Export | v2.6.x | MQTT `get-calendar` command |
| useSystemPicker | — | Rejected — [ADR-008](../adr/008-usesystempicker-electron-38.md) |

## Purpose

These documents capture:

- **Strategic insights** that inform development decisions
- **Comprehensive analysis** that might not fit in traditional documentation
- **Research findings** that provide objective evaluation of project components
- **Context and rationale** for major feature decisions
- **Investigation results** for proposed features and technologies

## Target Audience

These research documents are intended for:

- **Project maintainers** making strategic decisions
- **Contributors** understanding the broader context of features
- **Future developers** needing historical context
- **Documentation** of the decision-making process for major features

## Document Lifecycle

Research documents follow this lifecycle:

1. **Active Research Phase**: Document findings, analysis, and recommendations
2. **Decision Phase**: Use research to inform final decisions (implemented or rejected)
3. **Archive Phase**: Move content to appropriate location after decision:
   - **Implemented features**: Create ADR if significant, update feature docs
   - **Rejected features**: Create/update ADR with concise decision record
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
