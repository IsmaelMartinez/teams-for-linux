---
id: ai-methodology
title: AI-Assisted Development Methodology
sidebar_label: Methodology
---

# AI-Assisted Development Methodology

**Read time: 7 minutes** | [Quick Reference](01-quick-reference.md) | [Examples](examples/research-doc-example.md)

A structured workflow for collaborating with AI coding assistants. Evolved through practice on the Teams for Linux project.

---

## Philosophy

1. **Research before code** — Understand the problem before committing to solutions
2. **Validate assumptions** — When uncertain, spike it first
3. **Persist knowledge** — AI research becomes permanent artifacts, not throwaway chat
4. **Gate autonomy** — Human checkpoints at decision points
5. **Keep it simple** — AI makes adding easy; discipline is removing
6. **Match scrutiny to risk** — Not all changes need the same verification

### Ultrasimplification

AI removed the cost of building. It didn't remove the cost of maintaining. So the discipline shifted from "can we?" to "should we?"

For the full philosophy, see [Article 0: The Ultrasimplification Paradox](00-philosophy.md).

---

## When to Use What

Most tasks don't need all 6 phases. Match the workflow to the risk:

| Task Type | Workflow |
|-----------|----------|
| Bug fix, small change | Skip to Implement, review if needed |
| Feature, refactoring | Research → Plan → Implement (gated) → Review |
| Architecture, new systems | Full workflow, ADR required, multi-persona review |

---

## The Full Workflow

Use this for non-trivial work. Skip phases when appropriate.

### Phase 1: Research

**When:** Starting non-trivial work, unfamiliar domain, multiple approaches exist.

**Prompt:**
```
Research [topic]. Check existing ADRs, docs, codebase patterns.
Store findings in docs/research/[topic].md
```

**Output:** Research document with findings, recommendations, open questions.

### Phase 2: Spikes (conditional)

**When:** Untested assumptions, technical uncertainty, risk that needs cheap validation.

**Prompt:**
```
I'm assuming [X]. Generate a minimal spike to validate this.
Success: [what proves it works]
Failure: [what proves it doesn't]
```

**Output:** Proof-of-concept + findings. Not production code.

### Phase 3: Plan

**When:** After research confirms approach is viable.

**Options:**
- Lightweight: "Implementation Plan" section in research doc
- Structured: Full task list via `.github/instructions/generate-tasks.instructions.md`

### Phase 4: Implement

**Default:** Iterative with gates.
```
AI: [Completes sub-task]
AI: "Ready for next?"
Human: "y" or feedback
```

**Autonomous when:** Low-risk, reversible, well-established patterns, clear criteria.

**Insert gate when:** Security-sensitive, new patterns, >3 autonomous steps.

### Phase 5: Document

| Learning | Destination |
|----------|-------------|
| Architectural decision | `docs/development/adr/NNN-*.md` |
| Recurring bug/warning | `CLAUDE.md` critical warnings |
| Code pattern | `.github/copilot-instructions.md` |

### Phase 6: Multi-Persona Review

Run multiple passes with different focuses. One review misses things; multiple reviews catch more.

**Prompt:**
```
Review this code as:
- Security Engineer: vulnerabilities, input validation
- Performance Engineer: bottlenecks, unnecessary work
- Maintainability Reviewer: complexity, coupling
```

**When:** Before PRs on sensitive code, after major features, periodically for health.

**Key:** Multi-persona enhances but doesn't replace human review.

---

## Anti-Patterns

| Don't | Do Instead |
|-------|------------|
| Code first, understand later | Research first |
| Let research die in chat | Persist to docs/ |
| Assume AI is always right | Maintain gates |
| Skip spikes for speed | Cheap validation first |
| Document at the end | Document as you go |

---

## Measuring Success

**Use existing metrics.** Don't invent new ones for AI.

- Velocity — Shipping more with similar quality?
- Incidents — Breaking things less?
- Review turnaround — Reviews faster?

**The "feeling" metric:** For small teams, "is this working?" is valid.

**Adapt:** If metrics show problems, change the methodology.

---

## Security

Security is mandatory, not optional. More velocity = more risk if practices don't scale.

**The 5 essentials:**
1. Multi-check review (volume overwhelms single reviewers)
2. Input validation at every boundary
3. No hardcoded secrets (AI does this constantly)
4. Auth AND authz (AI conflates them)
5. Automated scanning (too much code to catch manually)

**Full security requirements:** [The MUSTs You Can't Skip](articles/03-security-tax.md)

---

## What's Next

Once fundamentals are solid, consider:
- Multi-model orchestration (local + cloud)
- The debate pattern (multiple perspectives before decisions)
- DevOps automation (changelogs, PR review, issue triage)

**Details:** [Evolution Research](frameworks/evolution.md)

---

## References

- [Quick Reference](01-quick-reference.md) — 2-minute version
- [Article Series](articles/README.md) — All 7 articles
- [Security Requirements](articles/03-security-tax.md) — The MUSTs
- [CLAUDE.md](https://github.com/IsmaelMartinez/teams-for-linux/blob/main/CLAUDE.md) — Project AI instructions
