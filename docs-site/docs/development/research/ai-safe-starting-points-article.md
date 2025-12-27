# Safe Starting Points: Where AI Can't Hurt You

**Read time: 6 minutes** | **Audience:** Teams beginning AI adoption

*Part 5 of 6 in the AI Collaboration series*

---

## Not All Code Is Equal

A bug in my test suite is annoying. A bug in authentication is catastrophic.

Yet I see teams letting AI touch everything equally. Same prompts, same review process, same trust level — whether it's generating a README or implementing payment logic.

I think this is backwards. **Risk should determine where AI helps first.**

---

## How I Think About Risk

I think of codebases in tiers:

| Tier | Risk Level | What Belongs Here | AI Involvement |
|------|-----------|-------------------|----------------|
| 0 | Zero | Docs, comments, commit messages | Full generation |
| 1 | Low | Tests, internal tools, scripts | Generation with light review |
| 2 | Moderate | Non-critical features, refactoring | Generation with careful review |
| 3 | High | Auth, payments, PII, security | Assistance only, heavy review |

Start at Tier 0. Build confidence. Move up when ready.

**Important nuance:** Tiers are guidelines, not rigid rules. Risk depends on:
- **Change size** — A 5-line auth fix might be safer than a 500-line UI refactor
- **Test coverage** — Well-tested code is safer to modify
- **Your familiarity** — Code you know deeply is safer to change
- **Existing quality** — Clean code is safer than legacy spaghetti

A small, well-tested change to Tier 3 code might be lower risk than a large refactor to "safe" Tier 1 code. Use judgment.

---

## Tier 0: Where AI Can't Hurt You

These are pure upside. AI mistakes here cost nothing.

### Documentation
- README files
- API documentation
- Code comments
- Architecture descriptions

**Why safe:** Bad docs get corrected. They don't ship to production. They don't handle user data.

**Try:** "Generate documentation for this module. Include purpose, usage examples, and common pitfalls."

### Commit Messages
- Conventional commit format
- PR descriptions
- Changelog entries

**Why safe:** A bad commit message doesn't break anything. It's immediately visible and fixable.

**Try:** "Write a commit message for this diff following conventional commits format."

### Developer Communication
- Technical explanations
- Code review comments
- Issue descriptions

**Why safe:** You read it before sending. Wrong information gets corrected in discussion.

**Try:** "Explain this code change for a reviewer who isn't familiar with this module."

---

## Tier 1: Low Risk, High Value

These have some risk, but failures are contained and visible.

:::warning Low Risk ≠ No Risk
Tier 1 has hidden dangers. Review for:
- **Secrets in test fixtures** — API keys, passwords, tokens in test data
- **Internal tools that escape** — Today's "internal only" becomes tomorrow's customer feature
- **Build scripts as attack vectors** — Supply chain attacks via compromised scripts
:::

### Test Generation
- Unit tests
- Integration tests
- Test data fixtures

**Why low risk:** Tests either pass or fail. A bad test is visible immediately. Tests don't touch production.

**What to watch:** AI-generated tests can be superficial — high coverage, low value. Review for meaningful assertions. **Check for hardcoded secrets in test data.**

**Try:** "Generate unit tests for this function. Include edge cases: empty input, maximum values, error conditions. Use placeholder values for any credentials."

### Internal Tooling
- Build scripts
- Development utilities
- Local automation

**Why low risk:** Only affects developers. Failures are visible. Easy to rollback.

**What to watch:** Scripts with side effects (file deletion, network calls) need careful review. **Assume any internal tool might eventually face external users.**

**Try:** "Write a script that [specific task]. It should be idempotent and log what it's doing."

### Analysis and Exploration
- Code analysis
- Dependency audits
- Performance profiling suggestions

**Why low risk:** Analysis doesn't change anything. You decide what to act on.

**Try:** "Analyze this module for potential performance issues. Explain the impact of each finding."

---

## Tier 2: Moderate Risk

Here, AI can generate, but review matters more.

### Non-Critical Features
- UI components (without sensitive data)
- Utility functions
- Data transformations

**Why moderate:** Bugs affect users but don't compromise security or data integrity.

**Required gates:**
- Code review by someone who understands the domain
- Test coverage for generated code
- Manual testing before merge

**Try:** "Implement this component following our existing patterns. I'll review for edge cases."

### Refactoring
- Code cleanup
- Pattern modernization
- Dependency updates

**Why moderate:** Refactoring can introduce subtle bugs. Behavior should stay identical.

**Required gates:**
- Existing tests must pass
- Review for behavioral changes
- Consider feature flags for large refactors

**Try:** "Refactor this function to use [pattern]. Behavior must remain identical. Show me what changes."

---

## Tier 3: High Risk — Assistance Only

AI should assist understanding, not generate code directly.

### Authentication & Authorization
- Login flows
- Permission checks
- Session management

**Why high risk:** Security vulnerabilities. Data breaches. Regulatory fines.

**AI's role:** Review existing code. Explain patterns. Suggest improvements. Never generate auth logic directly.

**Try:** "Review this authentication flow. What security concerns do you see? What am I missing?"

### Payment Processing
- Transaction handling
- Financial calculations
- PCI-scoped code

**Why high risk:** Financial loss. Compliance violations. Legal liability.

**AI's role:** Explain regulations. Review for compliance. Suggest test cases.

**Try:** "What PCI requirements apply to this code? What should I test for?"

### Personal Data Handling
- PII storage
- Data encryption
- Privacy controls

**Why high risk:** GDPR/CCPA fines. Reputation damage. Legal exposure.

**AI's role:** Review data flows. Identify PII exposure. Suggest privacy improvements.

**Try:** "Trace where user email addresses flow in this system. Where might they leak?"

---

## Moving Up (My Criteria)

I move up tiers when I've demonstrated competence:

```
Tier 0 → Tier 1
  Requirement: Team comfortable reviewing AI suggestions
  Evidence: AI suggestions discussed in PRs, some rejected, some improved

Tier 1 → Tier 2  
  Requirement: Quality metrics stable
  Evidence: Bug rates unchanged, test coverage maintained

Tier 2 → Tier 3
  Requirement: Security review process in place
  Evidence: Security-focused reviews happening, automated scanning active
```

Don't skip levels. Confidence is earned through practice at each tier.

---

## How I'd Answer Pushback

When someone asks "why can't we use AI for [Tier 3 task]?", I'd say:

> "We're building to that. Right now we're at Tier [X], learning what AI catches and misses. When we've demonstrated [specific criteria], we'll expand. What would help us get there faster?"

When someone wants to skip ahead:

> "What's the cost if AI gets this wrong? If it's recoverable, let's try it. If it's not, let's build more confidence first."

---

## Quick Reference: Where to Start

| If you want to... | Start with... |
|-------------------|---------------|
| Improve documentation | Tier 0: Generate README, API docs |
| Speed up code review | Tier 0: PR summaries, explanations |
| Increase test coverage | Tier 1: Test generation for utilities |
| Modernize codebase | Tier 2: Refactoring with review |
| Improve security | Tier 3: AI reviews existing code |

Pick one. Try it for a sprint. Evaluate. Expand.

---

## How Do You Know It's Working?

Here's the honest truth: I don't have perfect metrics. What I watch for:

**Signs it's working:**
- I'm catching things in review I would have missed
- AI suggestions get discussed, not auto-accepted
- Quality feels stable (bugs aren't increasing)
- I'm not drowning in review backlog

**Signs to pull back:**
- Rising defect rate in AI-touched code
- "AI wrote it" becoming an excuse
- Review becoming cursory
- Feeling overwhelmed rather than empowered

I don't track elaborate metrics. I pay attention to how the work *feels*. If I'm spending more time fixing AI mistakes than I save, something's wrong.

The key insight: **Constraining isn't failure. It's the system working.** Detecting a problem before it becomes a crisis is success.

---

## For Solo Developers

Working alone? You are your own review gate.

The tier system still applies, but adapt it:
- **Build the habit now** — Review your AI code before you're on a team
- **Use AI to review AI** — "What's wrong with this code? What am I missing?"
- **Document decisions** — Your future self is your team
- **Start at Tier 0** — Same ladder, same patience

Solo developers who build good habits become valuable team members.

---

## For Regulated Industries

Healthcare, finance, government, and other regulated industries may have additional constraints:
- **Compliance requirements** for AI-generated code
- **Audit trail obligations** for code changes
- **Approval processes** that affect what AI can touch

Check your regulatory requirements before adopting these patterns. The tiers still apply — your Tier 3 might just be larger.

---

## What I Don't Know Yet

I'll be honest about the open questions I'm still figuring out:

**How much autonomy is actually safe?** I experiment with giving AI more autonomy on low-risk work. Results are mixed. I'm still calibrating.

**Does skill atrophy?** If AI writes most of my code, am I getting worse as a developer? Probably some. I try to do intentional non-AI work to stay sharp. No proven solution.

**What's the long-term quality curve?** Short-term AI code quality I can measure. Long-term maintainability? We're all only a few years into this. Unknown.

**What happens to simplicity?** KISS and YAGNI matter more with AI, not less. AI generates complexity easily. Fighting that gravitational pull toward "more" is a discipline I'm still developing.

These aren't reasons to stop. They're reasons to stay curious, measure what I can, and adjust as I learn more.
