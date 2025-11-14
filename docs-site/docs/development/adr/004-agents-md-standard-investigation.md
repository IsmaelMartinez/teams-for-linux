---
id: 004-agents-md-standard-investigation
---

# ADR 004: Investigate agents.md Standard for AI Agent Instructions

## Status

Proposed - Under Investigation

## Context

The project currently uses multiple instruction files for AI coding assistants:

1. **CLAUDE.md** (root) - Official Claude Code instructions (verified standard)
2. **.github/copilot-instructions.md** - GitHub Copilot instructions (verified standard)
3. **.github/instructions/*.instructions.md** - Custom workflow instructions (3 files)

During an instruction files consolidation review, we identified significant duplication (28% of content duplicated across files) and discovered the **agents.md** standard (https://agents.md/).

### What is agents.md?

The agents.md initiative proposes a standardized format for AI agent instructions that could potentially:
- Provide a unified instruction format across different AI tools
- Reduce duplication by having a single source of truth
- Enable cross-tool compatibility

### Current Uncertainty

**We do not have confirmed information about:**
1. Whether Claude Code currently supports the agents.md standard
2. Whether GitHub Copilot supports or plans to support agents.md
3. The maturity and adoption level of the agents.md standard
4. Whether agents.md would replace or complement existing standards (CLAUDE.md, copilot-instructions.md)

### Current Duplication Problem

**Markdown Standards** - Currently duplicated identically in 4 files:
- `.github/copilot-instructions.md`
- `.github/instructions/process-tasks-list.instructions.md`
- `.github/instructions/create-prd.instructions.md`
- `.github/instructions/generate-tasks.instructions.md`

**Architecture & Patterns** - 90% duplicated in:
- `CLAUDE.md`
- `.github/copilot-instructions.md`

## Decision

**Deferred** - We will investigate the agents.md standard but NOT adopt it immediately.

### Investigation Tasks

Before adopting agents.md, we need to research:

1. **Claude Code Support:**
   - Check Claude Code official documentation for agents.md support
   - Test if Claude Code reads and uses agents.md files
   - Determine if agents.md would replace or supplement CLAUDE.md

2. **GitHub Copilot Support:**
   - Check GitHub Copilot documentation for agents.md support
   - Determine if agents.md would replace or supplement copilot-instructions.md

3. **Standard Maturity:**
   - Review agents.md specification and versioning
   - Check adoption by major projects and tools
   - Assess long-term viability and governance

4. **Migration Impact:**
   - Determine if adoption would require breaking changes
   - Assess effort to migrate existing instructions
   - Evaluate benefits vs. migration costs

### Interim Solution

While investigating agents.md, we will reduce duplication through:

1. **Extract shared content to documentation:**
   - Move Markdown Standards to `docs-site/docs/development/contributing.md`
   - Reference documentation site instead of duplicating architecture/patterns

2. **Streamline existing files:**
   - Keep CLAUDE.md and copilot-instructions.md (verified standards)
   - Make copilot-instructions.md lean with references to CLAUDE.md and docs
   - Keep workflow instruction files as-is (may be using Copilot's custom instructions feature)

3. **Document single source of truth:**
   - Clearly mark authoritative sources for shared content
   - Add references from instruction files to documentation

## Consequences

### Positive

- ✅ Defers commitment until we have more information
- ✅ Interim solution addresses immediate duplication problem
- ✅ Keeps using verified standards (CLAUDE.md, copilot-instructions.md)
- ✅ Allows time to assess agents.md maturity and adoption
- ✅ Can migrate to agents.md later if it proves beneficial

### Negative

- ⚠️ Requires future work if we decide to adopt agents.md
- ⚠️ May miss early adoption benefits if agents.md becomes standard
- ⚠️ Interim solution still maintains multiple instruction files

### Risk Mitigation

- Track agents.md standard updates and adoption
- Revisit this decision in 6 months or when Claude Code/Copilot documentation clarifies support
- Keep instruction files modular to ease potential future migration

## Alternatives Considered

**Alternative 1: Adopt agents.md immediately**
- ❌ Unknown if Claude Code supports it
- ❌ Risk of breaking existing workflows
- ❌ May not be widely adopted yet
- ❌ Could require reverting if tools don't support it

**Alternative 2: Create custom agents.md without standard**
- ❌ Confusing to use non-standard file name
- ❌ Tools won't automatically recognize it
- ❌ Doesn't solve the real problem (tool support)

**Alternative 3: Keep current structure with duplication**
- ❌ Maintenance burden (update in 4 places)
- ❌ Risk of inconsistency
- ❌ Already identified as problematic

**Alternative 4: Interim solution (Selected)**
- ✅ Reduces duplication immediately
- ✅ Uses verified standards
- ✅ Allows time to research agents.md
- ✅ Low risk approach

## Investigation Timeline

- **Short-term (Now):** Implement interim duplication reduction
- **Mid-term (Q1 2025):** Research agents.md support and adoption
- **Long-term (Q2 2025):** Revisit decision with findings

## Notes

- This ADR created during instruction files consolidation analysis (Nov 2024)
- agents.md standard discovered at: https://agents.md/
- Current duplication analysis documented in `instruction-files-analysis.md`
- Re-evaluate when Claude Code or GitHub Copilot documentation explicitly mentions agents.md

## References

- [agents.md Standard](https://agents.md/)
- [Claude Code Documentation](https://docs.claude.com/en/docs/claude-code)
- [GitHub Copilot Custom Instructions](https://docs.github.com/en/copilot)
- [Instruction Files Consolidation Analysis](../../instruction-files-analysis.md) (if merged)

## Future Actions

1. Monitor Claude Code release notes for agents.md support
2. Monitor GitHub Copilot documentation updates
3. Test agents.md compatibility when tool support is confirmed
4. Update this ADR when new information becomes available
5. Create implementation plan if agents.md adoption is deemed beneficial
