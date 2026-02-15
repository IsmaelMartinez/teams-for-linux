# Research Documentation

This directory contains research, analysis, and strategic insights generated during the development and improvement of Teams for Linux.

:::info Research Context
These documents capture in-depth analysis and strategic insights that inform development decisions and provide context for major features.
:::

## Contents

### Active Research - PRs in Review

- **[Electron 40 Migration Research](electron-40-migration-research.md)** - Migration from Electron 39.5.1 to 40.4.0
  - Covers breaking changes, Node.js 22→24 impact, Chromium 142→144 changes
  - Includes ESLint 10 migration analysis and codebase audit
  - **Status:** Research complete, ready for implementation

- **[Electron-Updater Auto-Update Research](electron-updater-auto-update-research.md)** - In-app auto-update via electron-updater for AppImage
  - Supersedes ADR-011 appimagetool approach (incompatible with electron-builder)
  - Phase 1: AppImage auto-update using `electron-updater` with GitHub Releases
  - **Status:** Research complete, ready for implementation

- **[Screen Lock Media Privacy Investigation](screen-lock-media-privacy-investigation.md)** - Auto-disable camera/mic on screen lock ([Issue #2106](https://github.com/IsmaelMartinez/teams-for-linux/issues/2106))
  - Linux-first philosophy: Expose commands for user scripts (D-Bus listeners, systemd hooks)
  - Feasible via MQTT commands (`disable-media`, `enable-media`) that users invoke from their own lock scripts
  - **Status:** PR in review

- **[Custom Notification System Research](custom-notification-system-research.md)** - Alternative notification modal system
  - **MVP Complete** (v2.6.16): Toast notifications with auto-dismiss and click-to-focus
  - **Phase 2 in review**: Chat, calendar, activity notification routing ([#2108](https://github.com/IsmaelMartinez/teams-for-linux/issues/2108))

### Ongoing Development - Awaiting User Feedback

- **[MQTT Extended Status Investigation](mqtt-extended-status-investigation.md)** - Extended MQTT status publishing
  - **Phase 1 Complete**: Infrastructure, documentation, and Last Will Testament
  - **Phase 2 DEFERRED**: WebRTC camera/mic monitoring awaiting user feedback

- **[Graph API Integration Research](graph-api-integration-research.md)** - Microsoft Graph API for enhanced features
  - **Phase 1 POC Complete**: Token acquisition, calendar/mail endpoints working
  - **Phases 2-3**: Enhanced features and user-facing UI not started

### Strategic Documentation

- **[Code Quality and Hardening Research](code-quality-hardening-research.md)** - Incremental codebase improvements
  - Input handling, logging hygiene, resilience gaps, CI additions
  - Validated by 4-persona review (security, product, maintainer, DevOps)
  - **Status:** Research complete, ready for incremental implementation

- **[GitHub Issue Bot Investigation](github-issue-bot-investigation.md)** - Intelligent GitHub issue automation
  - **Phase 1 Complete** (v2.7.4): Information request bot — detects missing info in bug reports
  - **Future phases**: Solution suggestions (Gemini AI), duplicate detection (embeddings), enhancement context

- **[Configuration Organization Research](configuration-organization-research.md)** - Configuration system improvements
  - **Phase 1 Complete**: Documentation reorganization
  - **Phases 2-3 DEFERRED**: Nested structure migration happening incrementally

### Archived / Not Feasible

- **[Logout Indicator Investigation](logout-indicator-investigation.md)** - **ARCHIVED**
  - Tray icon logout indicator ([#1987](https://github.com/IsmaelMartinez/teams-for-linux/issues/1987))
  - Validation spikes implemented but user never responded to test
  - Work preserved in branch `claude/analyze-research-spikes-XbYVZ` for potential reuse

- **[External Browser Authentication Investigation](external-browser-authentication-investigation.md)** - **NOT FEASIBLE**
  - Investigation into enabling Teams auth in system browser
  - **Conclusion:** Not currently feasible - Teams manages auth internally without exposed APIs
  - Note: `ssoBasicAuthPasswordCommand` is only for proxy/network auth, not Teams login

- **[GNOME Search Provider Investigation](gnome-search-provider-investigation.md)** - **NOT RECOMMENDED**
  - GNOME Shell search integration ([#2075](https://github.com/IsmaelMartinez/teams-for-linux/issues/2075))
  - Feasible via MQTT if Teams is running, but latency (~300-1100ms) makes UX poor

### Implemented Features (Research Removed)

Research documents are deleted once a feature is fully shipped. The ADRs and git history preserve the decisions and context.

| Feature | Version | Reference |
|---------|---------|-----------|
| Wayland/X11 Ozone Platform | v2.7.4 | Force X11 by default due to Electron 38+ Wayland regressions |
| Quick Chat / Chat Modal | v2.7.4 | [ADR-014](../adr/014-quick-chat-deep-link-approach.md), [ADR-015](../adr/015-quick-chat-inline-messaging.md) |
| External Changelog Generation | v2.7.3 | [Research](external-changelog-generation-research.md), [ADR-005](../adr/005-ai-powered-changelog-generation.md) |
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
