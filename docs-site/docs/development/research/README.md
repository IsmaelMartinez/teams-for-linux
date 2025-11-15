# Research Documentation

This directory contains research, analysis, and strategic insights generated during the development and improvement of Teams for Linux.

:::info Research Context
These documents capture in-depth analysis and strategic insights that inform development decisions and provide context for major features.
:::

## Contents

### Authentication & Security Research
- **[Token Cache Authentication Research](token-cache-authentication-research.md)** - Comprehensive research from problem analysis through implementation and validation of token cache authentication solution (#1357)
- **[Secure Storage Research](secure-storage-research.md)** - Research on secure storage options, platform capabilities, and implementation considerations
- **[DOM Access Investigation](dom-access-investigation.md)** - Research and findings on DOM access requirements, React breaking changes, and API feasibility

### Testing & Development Research
- **[Automated Testing Strategy](automated-testing-strategy.md)** - Comprehensive analysis of testing frameworks for Electron apps with MS authentication constraints
  - Playwright for E2E, Vitest for unit/integration tests
  - Storage state reuse for authentication handling
  - 8-week migration path to >70% coverage

### Electron & Framework Research
- **[Electron 38 Migration Analysis](electron-38-migration-analysis.md)** - Comprehensive analysis of Electron 37 → 38 upgrade
  - Breaking changes, API updates, platform-specific considerations
  - Migration strategy and testing requirements
- **[useSystemPicker Investigation](usesystempicker-investigation.md)** - Analysis of Electron 38's native screen picker feature
  - Decision: Not viable due to Linux Wayland/PipeWire blocker
  - Platform compatibility matrix and reasoning

### Strategic Analysis
- **[Documentation Health Analysis](documentation-health-analysis.md)** - Comprehensive assessment of documentation structure, quality, and maintainability
- **[UI System Strategic Analysis](ui-system-strategic-analysis.md)** - Strategic evaluation of the in-app UI system proposal and its alignment with project goals

### Architecture & Refactoring
- **[Incremental Refactoring Plan](incremental-refactoring-plan.md)** ⭐ **ACTIVE PLAN** - Practical 4-8 week plan to modernize architecture through incremental extraction
  - Reduces index.js by 49% (755 → 381 lines)
  - Low risk, continuous value delivery
  - Adds 20+ automated tests
  - Supersedes closed #1799 (DDD+Plugin approach)
- **[Architecture Modernization Research (DDD+Plugin)](architecture-modernization-research.md)** - 🗄️ **ARCHIVED** - Comprehensive DDD+Plugin research deemed too complex
  - Preserved as reference and historical context
  - 10-week big-bang migration plan
  - Excellent research but over-engineered for actual needs
  - See Critical Analysis for why this was not adopted

### Notification System Research
- **[Custom Notification System Research](custom-notification-system-research.md)** - Comprehensive investigation into alternative notification modal system
  - Investigation of existing libraries and solutions
  - Architectural constraints analysis (Electron wrapper vs React app)
  - Custom BrowserWindow-based implementation plan
  - Decision: Build custom system following IncomingCallToast pattern
  - Timeline: ~1 week for ultra-minimal MVP (toast notifications only)

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

Research documents should be:

- **Updated** when significant changes affect the analysis
- **Referenced** in PRDs and major feature discussions
- **Used to inform** future project direction decisions
- **Preserved** as historical context even when superseded

:::note Documentation Lifecycle
While technical documentation should be kept current, research documents serve as historical records and may represent analysis from specific points in time.
:::

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
