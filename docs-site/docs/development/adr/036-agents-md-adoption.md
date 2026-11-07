---
id: 036-agents-md-adoption
---

# ADR 036: Adopt AGENTS.md as the Agent Instruction File

## Status

✅ Accepted (2026-11-07). Supersedes [ADR-004](004-agents-md-standard-investigation.md).

## Context

[ADR-004](004-agents-md-standard-investigation.md) rejected the [agents.md](https://agents.md/) standard in November 2025 because neither Claude Code nor GitHub Copilot read the file at the time, and it recorded that the decision should be revisited once a tool officially supported it. That condition is now met: Claude Code reads a repository's `AGENTS.md` natively since v2.1.277 (the default **Project instructions** setting, `claude-md-or-agents-md`, reads `CLAUDE.md` when present and `AGENTS.md` otherwise), and the maintainer's other agents read `AGENTS.md` as well. The same move was already made in repo-butler, whose onboarding PRs now target `AGENTS.md` and never create a `CLAUDE.md`.

## Decision

Rename `CLAUDE.md` to `AGENTS.md` and keep a single, vendor-neutral instruction file.

No `CLAUDE.md` stub, `@AGENTS.md` import or symlink is kept. Under Claude Code's default setting the presence of any `CLAUDE.md` or `CLAUDE.local.md` in the repository or a parent directory makes it ignore `AGENTS.md`, so a stub would silently hide the instructions it was meant to forward to. A symlink additionally breaks on Windows checkouts and is refused by Claude Code's edit tools.

`.github/copilot-instructions.md` stays as the Copilot-specific entry point and now points at `AGENTS.md`. References in code comments, tests, the pull request template and the Claude Code settings hook were retargeted in the same change.

## Consequences

### Positive

- One instruction file read by Claude Code and by any other agent that follows agents.md
- The reference-based consolidation from ADR-004 is unchanged: `docs-site/docs/` remains the source of truth and `AGENTS.md` stays a quick reference

### Negative

- ⚠️ Claude Code older than v2.1.277 (v2.1.281 for Bedrock, Vertex, Foundry or gateway sessions) does not read `AGENTS.md`; contributors on those versions must upgrade
- ⚠️ `AGENTS.local.md` is not read by Claude Code; personal overrides still go in `CLAUDE.local.md`, which then requires the `claude-md-and-agents-md` setting so both files load
- ⚠️ Whether the Claude Code GitHub Action and the Agent SDK read `AGENTS.md` is not documented; this repository uses neither
- ⚠️ Untracked local `AGENTS.md` copies made before this change block `git pull`; delete them first

## References

- [Claude Code memory documentation](https://code.claude.com/docs/en/memory) - `AGENTS.md` section and the Project instructions setting
- [agents.md](https://agents.md/) - the standard
- [ADR-004](004-agents-md-standard-investigation.md) - the superseded decision and its re-evaluation trigger
