# Research Documentation

This directory contains research, analysis, and strategic insights generated during the development and improvement of Teams for Linux.

:::info Research Context
These documents capture in-depth analysis and strategic insights that inform development decisions and provide context for major features.
:::

## Contents

### Active Research - Ready for Implementation

- **[Wayland/X11 Ozone Platform Investigation](wayland-x11-ozone-platform-investigation.md)** - Force X11 by default due to Electron 38+ Wayland regressions (multiple issues: [#2094](https://github.com/IsmaelMartinez/teams-for-linux/issues/2094), [#1604](https://github.com/IsmaelMartinez/teams-for-linux/issues/1604), [#1494](https://github.com/IsmaelMartinez/teams-for-linux/issues/1494))
  - Electron 38+ changed default to native Wayland causing blank windows, multi-monitor bugs, and crashes
  - Fix: `--ozone-platform=x11` as `executableArgs` for all Linux packaging formats
  - Users can override to `--ozone-platform=wayland` or `auto` via command line
  - **Status:** Research complete, fix implemented

- **[Screen Lock Media Privacy Investigation](screen-lock-media-privacy-investigation.md)** - Auto-disable camera/mic on screen lock ([Issue #2015](https://github.com/IsmaelMartinez/teams-for-linux/issues/2015))
  - Linux-first philosophy: Expose commands for user scripts (D-Bus listeners, systemd hooks)
  - Feasible via MQTT commands (`disable-media`, `enable-media`) that users invoke from their own lock scripts
  - **Status:** Research complete, ready to implement

### Active Research - Requires Validation Spikes

- **[Chat Modal Investigation](chat-modal-investigation.md)** - Quick chat modal feature
  - Lightweight alternative to multi-window support
  - Uses Microsoft Graph API for chat functionality
  - **Status:** Investigation complete, requires API permission validation
  - Related: [Chat Modal Spikes and Gaps](chat-modal-spikes-and-gaps.md)

### Ongoing Development - Awaiting User Feedback

- **[Custom Notification System Research](custom-notification-system-research.md)** - Alternative notification modal system
  - **MVP Complete** (v2.6.16): Toast notifications with auto-dismiss and click-to-focus
  - **Phase 2 DEFERRED**: Notification center awaiting user feedback

- **[MQTT Extended Status Investigation](mqtt-extended-status-investigation.md)** - Extended MQTT status publishing
  - **Phase 1 Complete**: Infrastructure, documentation, and Last Will Testament
  - **Phase 2 DEFERRED**: WebRTC camera/mic monitoring awaiting user feedback

- **[Graph API Integration Research](graph-api-integration-research.md)** - Microsoft Graph API for enhanced features
  - **Phase 1 POC Complete**: Token acquisition, calendar/mail endpoints working
  - **Phases 2-3**: Enhanced features and user-facing UI not started

### Strategic Documentation

- **[GitHub Issue Bot Investigation](github-issue-bot-investigation.md)** - Intelligent GitHub issue automation
  - Suggests solutions using troubleshooting docs, detects duplicates, requests missing info
  - Builds on existing Gemini integration pattern from changelog generator
  - **Status:** Active research, quick wins ready for implementation
  - Includes smaller immediate improvements (templates, saved replies, label automation)

- **[Configuration Organization Research](configuration-organization-research.md)** - Configuration system improvements
  - **Phase 1 Complete**: Documentation reorganization
  - **Phases 2-3 DEFERRED**: Nested structure migration happening incrementally

- **[External Changelog Generation Research](external-changelog-generation-research.md)** - Handling changelog for external fork PRs
  - **Phase 1-2 Complete**: Graceful degradation + release automation workflow
  - **Phase 3**: Enhanced release notes generation (future)
  - Related: [ADR-005: AI-Powered Changelog Generation](../adr/005-ai-powered-changelog-generation.md)

### Technical Context & Monitoring

- **[DOM Access Investigation](dom-access-investigation.md)** - DOM access requirements and React compatibility
  - Documents v2.5.2 DOM access restoration and future React compatibility risks
  - Hybrid API + DOM approach for future resilience

### Archived / Not Feasible

- **[Logout Indicator Investigation](logout-indicator-investigation.md)** - **ARCHIVED**
  - Tray icon logout indicator ([#1987](https://github.com/IsmaelMartinez/teams-for-linux/issues/1987))
  - Validation spikes implemented but user never responded to test
  - Work preserved in branch `claude/analyze-research-spikes-XbYVZ` for potential reuse

- **[Architecture Modernization Research](architecture-modernization-research.md)** - **ARCHIVED**
  - DDD+Plugin approach deemed too complex
  - Superseded by incremental refactoring (55% reduction in index.js)
  - See [Contributing Guide](../contributing.md) for current architecture

- **[External Browser Authentication Investigation](external-browser-authentication-investigation.md)** - **NOT FEASIBLE**
  - Investigation into enabling Teams auth in system browser
  - **Conclusion:** Not currently feasible - Teams manages auth internally without exposed APIs
  - Note: `ssoBasicAuthPasswordCommand` is only for proxy/network auth, not Teams login

- **[GNOME Search Provider Investigation](gnome-search-provider-investigation.md)** - **NOT RECOMMENDED**
  - GNOME Shell search integration ([#2075](https://github.com/IsmaelMartinez/teams-for-linux/issues/2075))
  - Feasible via MQTT if Teams is running, but latency (~300-1100ms) makes UX poor

### Implemented Features (Research Archived)

The following research documents have been archived as their features are fully implemented:

| Feature | Implementation Date | Notes |
|---------|---------------------|-------|
| PII Log Sanitization | 2026-02-01 | Auto-sanitizes all logs via electron-log hook - See [ADR 013](../adr/013-pii-log-sanitization.md) |
| MQTT Commands | 2025-11-25 | Bidirectional MQTT support for toggle-mute, toggle-video, etc. |
| Calendar Data Export | 2025-11-29 | MQTT `get-calendar` command |
| useSystemPicker | 2025-11-24 | Rejected - See [ADR 008](../adr/008-usesystempicker-electron-38.md) |

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
