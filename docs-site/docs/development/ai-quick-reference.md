---
id: ai-quick-reference
title: AI Collaboration Quick Reference
sidebar_label: AI Quick Reference
---

# AI Collaboration: Quick Reference

**Read time: 2 minutes** | [Full methodology](ai-collaboration-methodology.md)

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

## Key Principles

1. **Research before code** — Understand, then build
2. **Validate, don't assume** — Spikes are cheap, rework is expensive
3. **Gates, not speed** — AI-generated code needs the same scrutiny
4. **Less is more** — Fight the urge to add

---

**Deep dives:** [Methodology](ai-collaboration-methodology.md) | [Security](research/ai-security-article.md) | [For Juniors](research/ai-junior-developer-article.md) | [For Managers](research/ai-manager-article.md)


