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
- **[useSystemPicker Investigation](usesystempicker-investigation.md)** - Electron 38's native screen picker (not viable on Linux)

### Architecture
- **[Architecture Modernization Research](architecture-modernization-research.md)** - 🗄️ **ARCHIVED** - DDD+Plugin approach deemed too complex
  - Superseded by incremental refactoring (55% reduction in index.js)
  - See [Contributing Guide](../contributing.md) for current architecture

### Changelog & Release
- For AI-powered changelog generation, see [ADR-005](../adr/005-ai-powered-changelog-generation.md)
- For release process, see [Manual Release Process](../manual-release-process.md)

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
