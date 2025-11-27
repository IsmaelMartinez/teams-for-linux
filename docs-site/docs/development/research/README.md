# Research Documentation

This directory contains research, analysis, and strategic insights generated during the development and improvement of Teams for Linux.

:::info Research Context
These documents capture in-depth analysis and strategic insights that inform development decisions and provide context for major features.
:::

## Contents

### Authentication & Security
- **[DOM Access Investigation](dom-access-investigation.md)** - Research on DOM access requirements and React breaking changes
- For implemented solutions, see [ADR-002: Token Cache](../adr/002-token-cache-secure-storage.md) and [ADR-003: Token Refresh](../adr/003-token-refresh-implementation.md)

### Testing & Development
- **[Automated Testing Strategy](automated-testing-strategy.md)** - Testing frameworks for Electron apps with MS authentication constraints
  - Playwright for E2E, Vitest for unit/integration
  - Key learning: MS authentication makes automated testing complex

### Electron & Framework
- **[Electron 38 Migration Analysis](electron-38-migration-analysis.md)** - Analysis of Electron 37 → 38 upgrade
- **useSystemPicker Investigation** - ✅ Moved to [ADR 008](../adr/008-usesystempicker-electron-38.md) - Electron 38's native screen picker rejected due to incomplete Linux Wayland support

### Architecture
- **[Architecture Modernization Research](architecture-modernization-research.md)** - 🗄️ **ARCHIVED** - DDD+Plugin approach deemed too complex
  - Superseded by incremental refactoring (55% reduction in index.js)
  - See [Contributing Guide](../contributing.md) for current architecture

### Notification System Research
- **[Custom Notification System Research](custom-notification-system-research.md)** - Comprehensive investigation into alternative notification modal system
  - Investigation of existing libraries and solutions
  - Architectural constraints analysis (Electron wrapper vs React app)
  - Custom BrowserWindow-based implementation plan
  - Decision: Build custom system following IncomingCallToast pattern
  - Timeline: ~1 week for ultra-minimal MVP (toast notifications only)

### MQTT & Integration
- **[MQTT Commands Implementation](mqtt-commands-implementation.md)** - Adding bidirectional MQTT support for action commands
  - Implementation plan: 4-6 hours, ~60 lines of code, low risk
  - Enables keyboard shortcuts and home automation integration
  - Related ADRs: [ADR-006](../adr/006-cli-argument-parsing-library.md), [ADR-007](../adr/007-embedded-mqtt-broker.md)
- **[Graph API Integration Research](graph-api-integration-research.md)** - Investigation of Microsoft Graph API for enhanced Teams features
- **[Calendar Data Export Research](calendar-data-export-research.md)** - Event-driven calendar export for org-mode and external tools
  - Related to [Issue #1995](https://github.com/IsmaelMartinez/teams-for-linux/issues/1995)
  - Event-driven architecture: React to user actions instead of internal scheduling
  - Leverages existing Graph API infrastructure

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

## Maintenance Guidelines

### Document Lifecycle

Research documents follow this lifecycle:

1. **Active Research Phase**: Document findings, analysis, and recommendations
2. **Decision Phase**: Use research to inform final decisions (implemented or rejected)
3. **Archive Phase**: Move content to appropriate location after decision:
   - **Implemented features**: Compress findings into feature documentation, update architecture docs
   - **Rejected features**: Create/update ADR with concise decision record (e.g., [ADR 008](../adr/008-usesystempicker-electron-38.md))
   - **Superseded research**: Close with reference to superseding document
4. **History**: Git commit history preserves full investigation context

### Maintenance Guidelines

Research documents that are **in active research phase** should be:

- **Updated** when significant changes affect the analysis
- **Referenced** in PRDs and major feature discussions
- **Used to inform** future project direction decisions

### Archiving Research

Once a decision is made (feature implemented or rejected):

- **DO**: Move content to appropriate permanent location (ADR, feature docs, architecture guide)
- **DO**: Compress findings into concise decision format
- **DO**: Remove from active research navigation if no longer relevant
- **DO NOT**: Keep full research documents as "historical context"—use git for history

**Examples:**
- useSystemPicker investigation → [ADR 008](../adr/008-usesystempicker-electron-38.md) (rejected decision)
- Automated testing strategy → Preserved as research (informs future implementation decisions)
- Architecture modernization → Marked as archived with cross-reference to current approach

## Contributing Research

When adding new research documents:

1. **Follow naming convention**: Use descriptive, kebab-case filenames
2. **Include context**: Date, scope, and purpose of analysis
3. **Link related documents**: Cross-reference relevant files
4. **Update this index**: Add entries for new research documents
5. **Provide actionable outcomes**: Include clear recommendations or decisions

## Document Template

Research documents should include:

- **Status** - Current state (Research Complete, Ongoing, Superseded)
- **Date** - When the research was conducted
- **Summary** - Executive summary of findings
- **Analysis** - Detailed investigation and findings
- **Decision/Recommendation** - Clear outcome or next steps
- **References** - External sources and related documentation

## Related Documentation

- [Configuration Options](../../configuration.md) - Application configuration reference
- [IPC API](../ipc-api.md) - Developer integration documentation
- [Architecture Decision Records](../README.md#adr-index) - Formal architectural decisions
