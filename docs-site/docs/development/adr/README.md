---
title: "Architecture Decision Records"
sidebar_position: 1
type: reference
last_updated: 2025-12-13
tags: [adr, architecture, decisions]
---

# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records documenting significant technical decisions made in the Teams for Linux project.

## What are ADRs?

Architecture Decision Records capture important architectural decisions along with their context and consequences. They help:

- **Document the "why"** behind technical choices
- **Preserve context** for future maintainers
- **Enable better decisions** by learning from past choices
- **Onboard contributors** faster by explaining rationale

## Status Overview

| ADR | Title | Status | Date | Version |
|-----|-------|--------|------|---------|
| [001](001-desktopcapturer-source-id-format.md) | DesktopCapturer Source ID Format | ✅ Implemented | 2024-09-15 | v2.3.0+ |
| [002](002-token-cache-secure-storage.md) | Token Cache Secure Storage | ✅ Implemented | 2024-09-08 | v2.5.9 |
| [003](003-token-refresh-implementation.md) | Token Refresh Implementation | ✅ Implemented | 2024-09-22 | v2.6.0 |
| [004](004-agents-md-standard-investigation.md) | agents.md Standard Investigation | ❌ Rejected | 2025-11-16 | N/A |
| [005](005-ai-powered-changelog-generation.md) | AI-Powered Changelog Generation | ✅ Implemented | 2025-11-17 | v2.6.15 |
| [006](006-cli-argument-parsing-library.md) | CLI Argument Parsing Library | 🚧 Proposed | 2025-11-19 | N/A |
| [007](007-embedded-mqtt-broker.md) | Embedded MQTT Broker | ❌ Rejected | 2025-11-19 | N/A |
| [008](008-usesystempicker-electron-38.md) | useSystemPicker Feature for Electron 38 | ❌ Rejected | 2025-11-24 | N/A |
| [009](009-automated-testing-strategy.md) | Automated Testing Strategy | ✅ Accepted | 2025-12-13 | N/A |
| [010](010-multiple-windows-support.md) | Multiple Windows Support | ❌ Rejected | 2025-11-26 | N/A |
| [011](011-appimage-update-info.md) | AppImage Update Info for Third-Party Managers | ✅ Implemented | 2026-01-25 | v2.7.1 |
| [012](012-intune-sso-broker-compatibility.md) | Intune SSO Broker Compatibility | ✅ Accepted | 2026-01-25 | v2.7.1 |
| [013](013-pii-log-sanitization.md) | PII Log Sanitization | ✅ Implemented | 2026-01-31 | v2.7.3 |
| [014](014-quick-chat-deep-link-approach.md) | Quick Chat Deep Link Approach | ✅ Accepted | 2026-01-31 | v2.7.3 |
| [015](015-quick-chat-inline-messaging.md) | Quick Chat Inline Messaging | ✅ Implemented | 2026-02-04 | N/A |
| [016](016-cross-distro-testing-environment.md) | Cross-Distro Testing Environment | ✅ Accepted | 2026-02-25 | N/A |
| [017](017-workflow-run-pr-comments.md) | Use workflow_run for PR Artifact Comments | ✅ Implemented | 2026-02-26 | N/A |

**Legend:**
- ✅ **Implemented** - Decision accepted and code in production
- ❌ **Rejected** - Decision evaluated and declined with rationale
- 🚧 **Proposed** - Under review, not yet accepted
- 🔄 **Superseded** - Replaced by a newer decision

## By Topic

### Authentication & Security

| ADR | Title | Summary |
|-----|-------|---------|
| [002](002-token-cache-secure-storage.md) | Token Cache Secure Storage | Secure token storage using Electron safeStorage with OS-level encryption to prevent daily re-authentication |
| [003](003-token-refresh-implementation.md) | Token Refresh Implementation | Configurable token refresh mechanism to proactively renew authentication before expiry |
| [012](012-intune-sso-broker-compatibility.md) | Intune SSO Broker Compatibility | Direct D-Bus invocation for Microsoft Identity Broker version compatibility |
| [013](013-pii-log-sanitization.md) | PII Log Sanitization | Custom regex sanitizer to redact sensitive data from logs |

**Key Outcomes:**
- Eliminated daily re-authentication issues
- Platform-native secure storage (Keychain/DPAPI/kwallet)
- Graceful fallback for unsupported platforms
- Configurable refresh intervals
- Support for Microsoft Identity Broker versions ≤ 2.0.1 and > 2.0.1
- PII sanitization with zero dependencies, UUIDs correlatable for debugging

### Screen Sharing

| ADR | Title | Summary |
|-----|-------|---------|
| [001](001-desktopcapturer-source-id-format.md) | DesktopCapturer Source ID Format | Use `screen:x:y` format throughout screen sharing pipeline for Wayland compatibility |
| [008](008-usesystempicker-electron-38.md) | useSystemPicker Feature for Electron 38 | Rejected OS native picker due to incomplete Linux Wayland/PipeWire support |

**Key Outcomes:**
- Fixed Wayland screen sharing preview
- Standardized source identification
- Improved cross-platform compatibility
- Deferred native picker until Linux support available

### Testing & Quality

| ADR | Title | Summary |
|-----|-------|---------|
| [009](009-automated-testing-strategy.md) | Automated Testing Strategy | Smoke testing with Playwright; comprehensive testing impractical due to MS authentication constraints |
| [016](016-cross-distro-testing-environment.md) | Cross-Distro Testing Environment | Docker-based manual testing across 9 distro/display server combinations via noVNC, hosted on GitHub Codespaces |

**Key Outcomes:**
- Playwright E2E smoke tests validate app launch and login redirect
- Tests run in isolated temp directories for clean state
- Manual testing remains primary quality gate for feature changes
- Low maintenance approach suitable for volunteer-maintained project
- 9 cross-distro configurations testable from a browser via Codespaces
- Apple Silicon limitation documented (V8 4GB heap cap under Rosetta 2)

### Documentation & Standards

| ADR | Title | Summary |
|-----|-------|---------|
| [004](004-agents-md-standard-investigation.md) | agents.md Standard Investigation | Investigated and rejected agents.md standard in favor of tool-specific standards (CLAUDE.md, copilot-instructions.md) |

**Key Outcomes:**
- Consolidated instruction files (removed 28% duplication)
- Centralized markdown standards in contributing.md
- Maintained tool-specific official standards

### Release Process & Automation

| ADR | Title | Summary |
|-----|-------|---------|
| [005](005-ai-powered-changelog-generation.md) | AI-Powered Changelog Generation | Use Gemini 2.0 Flash for automated changelog generation with release-pr workflow |
| [017](017-workflow-run-pr-comments.md) | Use workflow_run for PR Artifact Comments | Move PR artifact commenting to a workflow_run-triggered workflow to support fork PRs |

**Key Outcomes:**
- Decoupled merging from releasing
- AI-generated concise changelog entries (60 chars avg vs 165 manual)
- Quality score: 9.0/10 on validation testing
- Zero cost (uses Gemini API free tier)
- Fork PRs receive artifact download comments without 403 permission errors

### MQTT & Integration

| ADR | Title | Summary |
|-----|-------|---------|
| [006](006-cli-argument-parsing-library.md) | CLI Argument Parsing Library | Keep yargs for config parsing, use MQTT for action commands instead of CLI subcommands |
| [007](007-embedded-mqtt-broker.md) | Embedded MQTT Broker | Rejected bundling Aedes broker - users still need client tools, better alternatives exist |

**Key Outcomes:**
- Avoid fragile CLI argument bypass layer
- MQTT commands provide clean architecture for external triggers
- Users provide own MQTT broker (localhost or Home Assistant)
- Consider HTTP server for zero-dependency alternative (future)

### UI Features

| ADR | Title | Summary |
|-----|-------|---------|
| [010](010-multiple-windows-support.md) | Multiple Windows Support | Rejected multi-window due to Teams architecture constraints |
| [014](014-quick-chat-deep-link-approach.md) | Quick Chat Deep Link Approach | Use People API + Deep Links for quick chat access after Chat API was blocked |
| [015](015-quick-chat-inline-messaging.md) | Quick Chat Inline Messaging | Hybrid Teams commanding + Graph API approach for inline message sending |

**Key Outcomes:**
- Quick chat access via People API (works) instead of Chat API (blocked 403)
- Inline message sending via Graph API ChatMessage.Send scope
- Chat resolution via Teams entityCommanding + DOM scanning + member verification
- Keyboard shortcut toggles quick chat modal

### Distribution & Packaging

| ADR | Title | Summary |
|-----|-------|---------|
| [011](011-appimage-update-info.md) | AppImage Update Info | Post-process AppImages with appimagetool to embed update info for third-party update managers |

**Key Outcomes:**
- Third-party tools (Gear Lever, AppImageUpdate) can detect and manage updates
- Delta updates via `.zsync` files reduce bandwidth
- Both electron-updater and AppImage update info coexist
- Adds ~2-3 minutes to CI build time

## Creating New ADRs

### When to Create an ADR

Create an ADR for decisions that:
- Have significant architectural impact
- Affect multiple modules or systems
- Involve trade-offs between alternatives
- Need to be explained to future contributors
- Change existing patterns or conventions

### ADR Template

Use this template for new ADRs (save as `docs-site/docs/development/adr/00X-your-title.md`):

```markdown
---
id: 00X-your-title
---

# ADR 00X: [Title - Short Noun Phrase]

## Status

[Proposed | Accepted | Implemented | Rejected | Superseded by ADR-XXX]

## Context

What is the issue we're trying to address? Include:
- Problem description
- Why this needs a decision now
- Technical background and constraints
- What we investigated or researched

## Decision

What did we decide to do? Be specific:
- Exact approach chosen
- Implementation strategy
- Key parameters or configurations

## Consequences

What are the impacts of this decision?

### Positive
- Benefits gained
- Problems solved
- Improvements delivered

### Negative
- Trade-offs accepted
- Limitations introduced
- Future constraints

### Neutral
- Implementation notes
- Maintenance considerations
- Migration requirements (if applicable)

## Alternatives Considered

What other options did we evaluate and why were they not chosen?

### Option 1: [Name]
- Description
- Pros
- Cons
- **Why rejected**: [Specific reason]

### Option 2: [Name]
- ...

## Related
- ADR-XXX: [Related decision]
- Issue #XXX
- PR #XXX
```

### ADR Naming Conventions

- **Number**: Sequential (001, 002, 003, ...)
- **Title**: Short, descriptive noun phrase
- **Filename**: `00X-lowercase-with-hyphens.md`

**Examples:**
- ✅ `001-desktopcapturer-source-id-format.md`
- ✅ `002-token-cache-secure-storage.md`
- ❌ `001-screen-sharing-bug-fix.md` (too vague)
- ❌ `001-ImplementDesktopCapturerFix.md` (wrong case)

### ADR Workflow

1. **Create draft ADR** with "Proposed" status
2. **Discuss with maintainers** (GitHub discussion or PR)
3. **Update status** to "Accepted" or "Rejected" based on outcome
4. **Implement** (if accepted)
5. **Update status** to "Implemented" when deployed
6. **Add to this index** in the appropriate topic category

## ADR Maintenance

### Updating Existing ADRs

- **Status changes**: Update when implementation completes or decision is superseded
- **Consequences**: Add learned lessons or unexpected outcomes after implementation
- **Version notes**: Add when decision affects specific releases

### Superseding ADRs

When replacing an old decision:
1. Create new ADR documenting the new approach
2. Update old ADR status to: `Superseded by ADR-XXX`
3. Link new ADR to old one in "Related" section
4. Explain in new ADR why the old approach was replaced

### Example Supersession

```markdown
## Status

~~Accepted~~ → Superseded by [ADR-008](008-new-approach.md)

**Note**: This approach was replaced in November 2025 due to [reason].
See ADR-008 for the current implementation.
```

## Best Practices

### Writing Good ADRs

✅ **Do:**
- Write for future readers who don't have your context
- Explain the "why" more than the "what"
- Document alternatives considered
- Include specific examples and code references
- Update ADR when you learn something new post-implementation

❌ **Don't:**
- Write implementation documentation (that belongs in module READMEs)
- Skip the consequences section
- Forget to add links to related issues/PRs
- Leave status outdated (update when implemented)

### ADR Size Guidelines

- **Minimum**: ~200 words (if shorter, might not need an ADR)
- **Typical**: 500-1000 words
- **Maximum**: No hard limit, but consider splitting if >2000 words

### Code References

When referencing code in ADRs:

```markdown
**Implementation**: `app/browser/tools/tokenCache.js`
**Configuration**: See `config.json` → `tokenRefreshInterval`
**IPC Channel**: `token-refresh:trigger`
```

## ADR Statistics

- **Total ADRs**: 17
- **Implemented**: 8
- **Accepted**: 4
- **Proposed**: 1
- **Rejected**: 4
- **Average length**: ~500 words
- **Topics covered**: 9 (Authentication, Screen Sharing, Documentation, Release Process, MQTT & Integration, Testing, UI Features, Distribution & Packaging, Security)

## Related Documentation

- **Contributing Guide**: [Development Guidelines](../contributing.md)
- **Module Documentation**: [Module Index](../module-index.md)
- **Research Documents**: [Research Index](../research/README.md)
- **Development Roadmap**: [Future Plans](../plan/roadmap.md)
- **Configuration Reference**: [Configuration Options](../../configuration.md)

## Questions?

- **"Should I create an ADR for this?"** → If you're asking, probably yes. When in doubt, create one.
- **"Where do implementation details go?"** → Module READMEs. ADRs explain "why", READMEs explain "how".
- **"Can I update an old ADR?"** → Yes! Add consequences learned or update status. Don't rewrite history, but do add learnings.
- **"What if my decision was wrong?"** → Document it! Create a new ADR explaining why you're changing course. This is valuable learning.

## External Resources

- [Architecture Decision Records (ADR) Overview](https://adr.github.io/)
- [When to Write an ADR](https://engineering.atspotify.com/2020/04/when-should-i-write-an-architecture-decision-record/)
- [ADR Template Collection](https://github.com/joelparkerhenderson/architecture-decision-record)
