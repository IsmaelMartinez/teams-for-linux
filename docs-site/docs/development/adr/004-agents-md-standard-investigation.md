---
id: 004-agents-md-standard-investigation
---

# ADR 004: agents.md Standard Investigation and Rejection

## Status

Rejected

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

### Current Duplication Problem

**Markdown Standards** - Duplicated identically in 4 files:
- `.github/copilot-instructions.md`
- `.github/instructions/process-tasks-list.instructions.md`
- `.github/instructions/create-prd.instructions.md`
- `.github/instructions/generate-tasks.instructions.md`

**Architecture & Patterns** - 90% duplicated in:
- `CLAUDE.md`
- `.github/copilot-instructions.md`

## Decision

**Rejected** - We will NOT adopt or investigate the agents.md standard.

### Rationale

1. **Claude Code has its own official standard**: Claude Code uses `CLAUDE.md` as its official instruction file standard, as documented in the Claude Code documentation. This is a verified, supported standard.

2. **No evidence of agents.md support**: There is no indication in Claude Code or GitHub Copilot documentation that either tool supports or plans to support the agents.md standard.

3. **Existing standards work well**: Both CLAUDE.md and copilot-instructions.md are tool-specific, officially recognized standards that work reliably.

4. **Risk of breaking workflows**: Adopting an unsupported standard could break existing AI agent workflows without providing any actual benefit.

5. **Duplication already addressed**: The consolidation approach (extracting shared content to documentation and using references) effectively solves the duplication problem without requiring adoption of new standards.

### Solution Implemented

Instead of adopting agents.md, we implemented a consolidation strategy:

1. **Extract shared content to documentation:**
   - Added comprehensive Markdown Standards section to `docs-site/docs/development/contributing.md` as single source of truth
   - All instruction files now reference this authoritative section

2. **Streamline existing files:**
   - Kept CLAUDE.md and copilot-instructions.md (verified standards)
   - Made copilot-instructions.md lean with references to CLAUDE.md and documentation site
   - Updated all files to reference local markdown files in `docs-site/docs/` instead of web URLs
   - Kept workflow instruction files (`.github/instructions/*.instructions.md`) with updated references

3. **Establish clear documentation hierarchy:**
   - Local markdown files in `docs-site/docs/` are the source of truth
   - Web URLs (https://ismaelmartinez.github.io/teams-for-linux/) are for human reference only
   - AI agents should read local files, not fetch from web

## Consequences

### Positive

- ✅ Continues using officially supported standards (CLAUDE.md, copilot-instructions.md)
- ✅ No risk of breaking existing workflows
- ✅ Eliminates 28% content duplication through reference approach
- ✅ Single source of truth for shared content in contributing.md
- ✅ Clear documentation hierarchy established
- ✅ AI agents read from local files for better performance and reliability
- ✅ No dependency on external standard that may not be widely adopted

### Negative

- ⚠️ Maintains two tool-specific instruction files instead of one unified file
- ⚠️ If agents.md becomes widely adopted in the future, migration would require work

### Risk Mitigation

- Keep instruction files modular and well-referenced to ease any potential future migration
- Document the decision clearly in this ADR for future reference
- Consolidation strategy reduces duplication while maintaining flexibility

## Alternatives Considered

**Alternative 1: Adopt agents.md immediately**
- ❌ Not supported by Claude Code or GitHub Copilot
- ❌ Risk of breaking existing workflows
- ❌ No verified benefits
- ❌ Could require reverting if tools don't support it

**Alternative 2: Create custom agents.md without standard compliance**
- ❌ Confusing to use non-standard file name
- ❌ Tools won't automatically recognize it
- ❌ Doesn't solve the real problem (tool support)

**Alternative 3: Keep current structure with duplication**
- ❌ Maintenance burden (update in 4 places)
- ❌ Risk of inconsistency
- ❌ Already identified as problematic

**Alternative 4: Consolidate via references (Selected)**
- ✅ Reduces duplication immediately
- ✅ Uses verified standards
- ✅ Low risk approach
- ✅ Maintains tool compatibility
- ✅ Establishes clear documentation hierarchy

## Implementation Results

The consolidation was successfully implemented with the following changes:

1. **Added Markdown Standards to contributing.md** (`docs-site/docs/development/contributing.md:207-265`)
   - Comprehensive markdown standards section
   - Covers: content structure, callouts, code blocks, tables, links, diagrams
   - Clearly states it applies to ALL markdown files in the project

2. **Updated all instruction files** to reference contributing.md instead of duplicating standards

3. **Streamlined copilot-instructions.md** to quick reference with links to full documentation

4. **Updated CLAUDE.md** to reference local documentation files with web URLs for human reference

5. **Clarified documentation reading approach** - AI agents should read local markdown files in `docs-site/docs/`, not fetch from web

## Notes

- This ADR created during instruction files consolidation analysis (November 2024)
- agents.md standard discovered at: https://agents.md/
- Consolidation reduces duplication from 28% to near-zero through reference strategy
- Decision based on verified tool support and practical implementation needs

## References

- [agents.md Standard](https://agents.md/) - External standard (not adopted)
- [Claude Code Documentation](https://docs.claude.com/en/docs/claude-code) - Official CLAUDE.md standard
- [GitHub Copilot Custom Instructions](https://docs.github.com/en/copilot) - Official copilot-instructions.md standard
- [Contributing Guide - Markdown Standards](../contributing.md#markdown-standards) - Single source of truth

**Note:** The detailed instruction files consolidation analysis that led to this decision is available in the repository root as `instruction-files-analysis.md`.

## Future Consideration

If Claude Code or GitHub Copilot officially announce support for agents.md in the future:
1. Re-evaluate this decision based on confirmed tool support
2. Assess migration effort vs. benefits
3. Update this ADR with new findings
4. Create new ADR for adoption decision if warranted

For now, the current approach using official standards with reference-based consolidation is the correct solution.
