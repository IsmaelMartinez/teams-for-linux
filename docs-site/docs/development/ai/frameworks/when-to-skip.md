---
id: ai-when-to-skip
title: When to Skip the Methodology
sidebar_label: When to Skip
---

# When to Skip the Methodology

The 6-phase workflow is for non-trivial work. Most tasks don't need all phases. Here's explicit guidance on when to skip.

---

## The Default

Most work is simple. The methodology exists for the complex stuff. When in doubt:

```
Bug fix?           → Skip to Implement
Well-understood?   → Skip Research, maybe spike
Time-boxed?        → Skip documentation (but note learnings)
Reversible?        → Fewer gates
```

---

## When to Skip Research

**Skip when:**
- Bug fix with clear reproduction steps
- Well-understood problem you've solved before
- Change takes less than 1 hour
- Adding to existing, well-documented pattern
- Trivial feature with no architectural impact

**Don't skip when:**
- Unfamiliar domain or technology
- Multiple valid approaches exist
- Change affects system architecture
- You're uncertain about the right approach
- Security or compliance implications

---

## When to Skip Spikes

**Skip when:**
- API is well-documented and you trust the docs
- Pattern is proven in your codebase
- Risk of being wrong is low (easy to fix)
- Time pressure genuinely outweighs validation value
- You've done this exact thing recently

**Don't skip when:**
- Untested third-party integration
- Assumption feels shaky but important
- Wrong answer would cost days to fix
- You're relying on behavior not explicitly documented
- Security or data integrity at stake

---

## When to Skip Gates

**Skip when:**
- Low-risk, internal-only changes
- Fully reversible (feature flag, easy rollback)
- Strong test coverage validates correctness
- You understand the code deeply
- Changes are isolated (no ripple effects)

**Don't skip when:**
- Security-sensitive code
- User-facing behavior changes
- More than 3 autonomous AI steps
- Unfamiliar codebase area
- Production deployment without rollback

---

## When to Skip Multi-Persona Review

**Skip when:**
- Internal tooling or scripts
- Test code (though still review for secrets)
- Documentation-only changes
- Trivial refactoring with full test coverage
- Time-critical fixes (but schedule follow-up review)

**Don't skip when:**
- Code touches authentication or authorization
- Handles user data or PII
- New feature with security surface
- Changes to core business logic
- Before any public release

---

## When to Skip Documentation

**Skip when:**
- Fix is obvious from the code
- Pattern already documented elsewhere
- Temporary or experimental code
- Under extreme time pressure (but create ticket for later)

**Don't skip when:**
- Architectural decision made
- Bug revealed important context
- Pattern is new to the codebase
- Future you (or others) will wonder "why?"

---

## Time-Pressure Reality

When deadlines are tight, the temptation is to skip everything. Here's the honest tradeoff:

| If you skip... | You risk... | Acceptable when... |
|---------------|-------------|---------------------|
| Research | Building the wrong thing | Problem is well-understood |
| Spike | Wasted work on bad assumption | Assumption is low-risk |
| Gates | Undetected drift | Changes are reversible |
| Multi-persona | Security/quality issues | Code is low-sensitivity |
| Documentation | Future confusion | You'll document post-ship |

**The rule:** Skip consciously, not by default. Know what you're trading away.

---

## Signals You Skipped Too Much

- Bug rate increasing
- "Who wrote this?" becoming common
- Rework after shipping
- Security issues in review
- Knowledge leaving with people

If these appear, add back the phases you skipped. The methodology exists because the problems are real.

---

## Signals You're Overdoing It

- Research documents nobody reads
- Spikes for obvious things
- Gates that always get "y" without review
- Multi-persona reviews finding nothing
- Documentation duplicating the code

If these appear, simplify. The methodology should help, not burden.

---

## The Meta-Rule

**Match scrutiny to stakes.**

Low stakes, high reversibility → Skip more.
High stakes, low reversibility → Skip less.

Your judgment is the final arbiter. The methodology supports judgment; it doesn't replace it.
