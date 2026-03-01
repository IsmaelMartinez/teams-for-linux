# AI Automation Review and Enhancement Proposals

:::note Proposal — Not Final
This document is a review of the current AI automation and a set of enhancement proposals for discussion. Nothing here is decided. All proposals require maintainer review and approval before implementation.
:::

**Status:** Proposal
**Date:** March 2026
**Author:** Claude AI Assistant
**Scope:** Review of all AI automation systems + enhancement research proposals

---

## 1. Current State Review

### 1.1 What's Running

The project has four distinct AI automation systems in production:

| System | Shipped | Model | Trigger | Status |
|--------|---------|-------|---------|--------|
| **Changelog Generator** | ~Nov 2025 | Gemini 2.0 Flash Exp | PR opened/synced | Stable |
| **Issue Triage Bot (Phase 1)** | v2.7.4 | Rule-based (no AI) | Issue opened (bug label) | Stable |
| **Issue Triage Bot (Phase 2)** | v2.7.5+ | Gemini 2.5 Flash | Issue opened (bug label) | Stable |
| **Issue Triage Bot (Phase 3)** | v2.7.8 | Gemini 2.5 Flash | Issue opened (bug label) | Stable |
| **Issue Index Refresh** | v2.7.8 | N/A (script) | Weekly cron (Mon 4:00 UTC) | Stable |
| **Awaiting Feedback Remover** | Post-v2.7.8 | N/A (event-driven) | Issue comment by non-bot | Stable |
| **Release Preparation** | ~Feb 2026 | N/A (script + changelog AI) | Manual dispatch | Stable |
| **Claude Code (dev assistant)** | Ongoing | Claude Opus | Manual sessions | Active |

### 1.2 What's Working Well

**Changelog Generator**
- 6 changelog entries currently staged in `.changelog/` for the next release
- Entries are concise and consistent (60-80 chars on average)
- External fork handling works correctly (posts comment with manual instructions)
- Skips release PRs appropriately
- Low false positive rate — PR title fallback when Gemini fails is sensible

**Issue Triage Bot**
- Three-phase pipeline produces a single consolidated comment (no spam)
- Phase 1 (missing info) correctly parses bug report templates for missing reproduction steps, debug output, and expected behavior
- Phase 2 (solution suggestions) uses a pre-processed troubleshooting index, avoiding large context windows
- Phase 3 (duplicate detection) uses a pre-processed issue index with weekly refresh
- Bot skips bot accounts and never double-comments (deduplication check)
- Security is solid: `pull_request_target` only for metadata, environment variables for untrusted input, minimal permissions
- Humble language throughout ("might be related", "appears similar")

**Supporting Automation**
- `remove-awaiting-feedback.yml` correctly auto-removes the label when users respond
- Issue index generation caps at 200 entries, includes rate limiting and retry logic
- CODEOWNERS protects workflow files and security-sensitive paths

**Claude Code Integration**
- `CLAUDE.md` provides comprehensive, structured instructions
- `.claude/settings.local.json` configures minimal permissions with MCP GitHub access
- Branch naming convention (`claude/`) makes AI-authored work clearly identifiable
- Multiple successful Claude-authored PRs merged (security hardening phases, feature analysis, code quality)

### 1.3 Known Gaps and Observations

**Issue Index Staleness**
- The weekly cron means two issues filed hours apart won't be cross-referenced for up to 7 days. The roadmap already identifies this as Phase 3.1 (real-time refresh). This is the highest-impact gap.

**Bug-Only Triage**
- The triage bot only fires on issues with the `bug` label. Enhancement requests, feature requests, and unlabelled issues get no automated assistance. Phase 4 (enhancement context from roadmap/research/ADRs) addresses this but hasn't been built yet.

**No Feedback Loop on Bot Accuracy**
- There's no mechanism to track whether the bot's suggestions were helpful. The research doc mentions success metrics (20% bug resolution, 30% duplicate reduction) but there's no instrumentation to measure them. This is worth investigating before expanding the bot's scope.

**Changelog Model Drift**
- The changelog generator uses `gemini-2.0-flash-exp` while the triage bot uses `gemini-2.5-flash`. This is fine functionally but worth noting for maintenance — if one model is deprecated, the other may follow.

**Issue Index Coverage**
- The index includes open issues and issues closed in the last 90 days. Issues older than 90 days that resurface (e.g., recurring regressions) won't be matched. This is an acceptable trade-off for index size, but worth noting.

---

## 2. Enhancement Proposals

The following are research-level proposals. Each one describes what the enhancement would do, why it might be valuable, what the guardrails are, and what investigation is needed before building. None of these are commitments.

### 2.1 Real-Time Issue Index Refresh (Phase 3.1)

**Already in roadmap.** Summarized here for completeness.

**What:** Trigger `update-issue-index.yml` on `issues: [opened, closed, reopened]` events in addition to the weekly cron.

**Why:** Eliminates the 7-day blind spot for duplicate detection.

**Research needed:**
- Determine whether to use `workflow_run` dependency or inline append in the triage bot
- The inline approach (appending the new issue to the index in-memory during the triage run) avoids a race condition entirely and requires no workflow change to `update-issue-index.yml`
- Measure the typical time between issue creation and triage bot execution to understand if the race condition is practical

**Guardrails:**
- Keep the weekly full rebuild as a safety net
- Rate-limit regeneration to avoid GitHub API exhaustion during issue-filing storms
- The index generator already has retry logic and a 200-entry cap

**Effort:** Small (1-2 hours if inline, half a day if workflow-based)

### 2.2 Pre-Research Prompt Generator (Phase 3.2)

**Already in roadmap.** Expanded here with more research detail.

**What:** A script or GitHub Action that generates a structured investigation prompt when a maintainer wants to research a new issue. The prompt aggregates context from the issue body, module index, issue index, troubleshooting entries, configuration docs, and related ADRs into a single, coherent starting point.

**Why:** When an issue comes in that requires codebase investigation, the maintainer currently has to manually gather context from multiple sources. This automates the context-gathering step, not the decision-making.

**Research needed:**
- **Trigger mechanism:** Manual workflow dispatch via label (e.g., `needs-research`) or a `/research` slash command in issue comments? Label-based is simpler and more visible.
- **Prompt structure:** What should the output look like? A Markdown comment on the issue with collapsible sections for each context source? A downloadable file?
- **Module matching:** How to map issue keywords to relevant modules from `module-index.md`? Simple keyword matching (grep for module names in issue body) vs. AI-assisted matching (Gemini Flash)?
- **Scope boundaries:** The prompt should never suggest implementations — only gather context and propose investigation steps. Include an explicit disclaimer.

**Guardrails:**
- **Human-in-the-loop:** The prompt is generated, but a human reviews both the prompt and any subsequent analysis before action
- **No auto-assignment:** Never automatically assign issues or create PRs
- **Read-only context:** The prompt only aggregates existing documentation — it doesn't generate new analysis
- **Rate limiting:** One prompt per issue, triggered only by maintainer action (label)
- **Disclaimer:** Every generated prompt includes "This is a starting point for investigation. Review before acting."

**Effort:** Medium (2-3 days)

### 2.3 Bot Accuracy Feedback Loop

**New proposal — not in roadmap yet.**

**What:** Add a lightweight mechanism to track whether the triage bot's suggestions were helpful. This could be as simple as the maintainer adding a reaction (thumbs up/down) to the bot comment, with a periodic script that tallies the reactions.

**Why:** Before expanding the bot's scope (Phase 4, enhancement context), it's worth understanding how accurate the current system is. The research doc defines success metrics but doesn't measure them. Without measurement, we risk adding complexity to a system that may need tuning, not expansion.

**Research needed:**
- **Reaction-based tracking:** GitHub reactions on bot comments are easy to check via the API. A monthly script could tally thumbs-up vs. thumbs-down on bot comments to derive an accuracy percentage.
- **Issue resolution tracking:** Track whether issues that received bot suggestions were closed within 48 hours (suggesting the suggestion helped) vs. issues that weren't.
- **Alternative: simple label.** A `bot-helped` or `bot-missed` label applied by the maintainer during triage. More explicit but requires manual effort.
- **Baseline:** Before measuring improvements, establish a baseline of current triage time and resolution rates.

**Guardrails:**
- Measurement should be passive (reactions or labels), not intrusive
- Don't expand bot scope until accuracy is measured and acceptable
- Keep the metric collection separate from the bot itself (a standalone script or workflow)
- Don't expose metrics publicly unless the maintainer chooses to

**Effort:** Small (1 day for the reaction-counting script, ongoing for data collection)

### 2.4 Enhancement Context from Roadmap/Research/ADRs (Phase 4)

**Already in roadmap.** Expanded here with research questions.

**What:** Extend the triage bot to surface relevant roadmap items, ADRs, and research docs when an issue touches a known area. For example, if someone files a feature request about screen sharing, the bot notes that ADR-008 (useSystemPicker) and ADR-016 (Wayland audit) are relevant context.

**Why:** Saves the maintainer time explaining "we already investigated this" or "this is planned." Gives the reporter immediate context about where the project stands on their request.

**Research needed:**
- **Index generation:** Similar to the troubleshooting index, build a `feature-index.json` that maps keywords/topics to roadmap entries, ADRs, and research docs. The existing `generate-index.js` pattern can be extended.
- **Trigger scope:** Should this run on all issues, or only those with the `enhancement` label? Running on all issues increases coverage but also increases false positive risk.
- **Matching accuracy:** Keyword matching may be sufficient for ADRs (they have clear titles and scopes). Gemini matching might be overkill here. Research whether a simpler approach works.
- **Comment format:** Should enhancement context be part of the existing consolidated comment, or a separate comment? If integrated, the bot comment could get long. If separate, it's two bot comments per issue.
- **Stale context risk:** What if a roadmap entry is outdated? The bot would surface stale information. Need to ensure the feature index references the latest state.

**Guardrails:**
- Same humble language as the existing bot ("We've previously investigated this area...")
- Never say "rejected" — say "We explored this and documented our findings in [ADR link]"
- Include a note that the roadmap is a living document and may have changed
- Limit to 3 context items per issue to avoid overwhelming the reporter
- Only trigger on issues, not PRs

**Effort:** Medium (3-5 days)
**Dependency:** Ideally, measure bot accuracy (2.3) before expanding scope

### 2.5 Changelog Model Consolidation

**New proposal — minor maintenance item.**

**What:** Align the changelog generator to use the same Gemini model as the triage bot (2.5 Flash), or at least document the rationale for using different models.

**Why:** The changelog generator uses `gemini-2.0-flash-exp` (an experimental model) while the triage bot uses `gemini-2.5-flash` (a stable release). Experimental models may be deprecated without notice. Aligning on a stable model reduces maintenance risk.

**Research needed:**
- Test 5-10 changelog entries with `gemini-2.5-flash` and compare quality against the current `gemini-2.0-flash-exp` output
- Check if the `responseMimeType` feature (used in the triage bot) would benefit the changelog generator too
- Verify the free tier quota is still sufficient with both systems on the same model

**Guardrails:**
- Don't change the model without testing quality first
- Keep the PR title fallback in case the API fails
- This is a low-priority maintenance item, not urgent

**Effort:** Tiny (1 hour of testing + a one-line change)

---

## 3. Proposed Research Order

Based on impact, risk, and dependencies:

| Priority | Proposal | Rationale |
|----------|----------|-----------|
| 1 | **2.1 Real-Time Index Refresh** | Highest impact, smallest effort, already planned |
| 2 | **2.3 Bot Accuracy Feedback Loop** | Establishes measurement before expansion |
| 3 | **2.5 Changelog Model Consolidation** | Quick maintenance win |
| 4 | **2.2 Pre-Research Prompt Generator** | Valuable but medium effort; benefits from accuracy data |
| 5 | **2.4 Enhancement Context (Phase 4)** | Largest scope; should wait for accuracy feedback |

This order follows the project's own principles: validate first, start simple, measure before expanding.

---

## 4. What This Proposal Is Not

To be explicit about boundaries:

- **Not a commitment.** These are research proposals for the maintainer to evaluate. Any or all can be rejected, deferred, or modified.
- **Not a design document.** Each proposal that gets approved would need its own implementation plan with specific technical details.
- **Not expanding AI decision-making.** All proposals keep humans in the loop. The bot surfaces information; maintainers decide. The pre-research prompt generator produces context; humans review it.
- **Not adding new AI models or services.** All proposals use the existing Gemini integration. No new API keys, services, or costs.
- **Not changing existing behaviour.** The current bot, changelog generator, and workflows continue unchanged. Enhancements are additive.

---

## 5. Related Documentation

- [GitHub Issue Bot Research](github-issue-bot-investigation.md) — Original research and implementation plan
- [ADR-005: AI-Powered Changelog Generation](../adr/005-ai-powered-changelog-generation.md) — Changelog system decisions
- [Development Roadmap](../plan/roadmap.md) — Current priorities and feature status
- [External Changelog Generation Research](external-changelog-generation-research.md) — Fork PR handling
