---
id: ai-quick-reference
title: AI Collaboration Quick Reference
sidebar_label: Quick Reference
---

# AI Collaboration: Quick Reference

**Read time: 2 minutes** | [Full methodology](02-methodology.md) | [Philosophy](00-philosophy.md) | [Glossary](glossary.md)

---

## The Sticky Note Version

```
Before: "Should we build this?"
During: Gate every 3 steps
After: "What can we remove?"
Risk: Match scrutiny to stakes
```

---

## The Workflow

```
1. RESEARCH    → Understand before coding
2. SPIKE       → Validate assumptions (if uncertain)
3. PLAN        → Define approach
4. IMPLEMENT   → Iterate with gates
5. DOCUMENT    → Capture decisions
6. REVIEW      → Multi-perspective check
```

---

## Trigger Words

| Say | Meaning |
|-----|---------|
| `ultrathink` | Deep analysis needed |
| `research [topic]` | Explore before committing |
| `spike this` | Quick validation, not production |
| `multi-persona review` | Check from multiple angles |

---

## Risk-Proportional Gates

| Change | Verification |
|--------|--------------|
| Typo, comment | Quick review |
| Refactor | Standard review |
| New feature | Multi-reviewer + tests |
| Security-sensitive | Multi-persona + checklist |
| Core architecture | ADR + extensive review |

---

## Security Checklist (Every PR)

- [ ] No hardcoded secrets
- [ ] Input validated at boundaries
- [ ] Auth AND authz checked
- [ ] Errors don't leak internals
- [ ] Least privilege applied

---

## Copy-Paste Prompts

**Research:**
```
Research [topic]. Check existing ADRs, docs, codebase patterns.
Store findings in docs/research/[topic].md
```

**Spike:**
```
I'm assuming [X]. Generate a minimal spike to validate this.
Success criteria: [what proves it works]
```

**Multi-persona review:**
```
Review this code as: Security Engineer, Performance Engineer, 
Maintainability Reviewer. Prioritize findings.
```

---

## When to Use What

```
Bug fix?           → Skip to Implement
Feature?           → Research → Plan → Implement
Uncertain?         → Spike it first
Security-touching? → Full workflow + security checklist
```

---

**Go deeper:** [Full Methodology](02-methodology.md) | [Article Series](articles/README.md)


