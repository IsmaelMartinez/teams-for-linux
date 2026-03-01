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

The project has the following automation systems in production:

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

**Changelog Model at Risk**
- The changelog generator still uses `gemini-2.0-flash-exp`, an experimental model that could be deprecated at any time. The triage bot already moved to `gemini-2.5-flash` (stable). The ADR originally referenced `gemini-2.0-flash-thinking-exp-1219`, which is yet another experimental variant. It is surprising this still works — aligning to the stable model should be treated as preventive maintenance, not a low-priority item.

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

### 2.4 Enhancement Triage — Context, Feasibility, and Misclassification (Phase 4)

**Already in roadmap as "Enhancement Context".** Expanded here significantly based on the observation that the bot currently only handles `bug`-labelled issues while enhancement requests need three things the current pipeline doesn't provide.

**What:** Extend the triage bot to fire on `enhancement`-labelled issues with three capabilities:

1. **Context surfacing** — Link the request to existing roadmap items, ADRs, and research docs so the reporter immediately sees where the project stands on their area.
2. **Feasibility signal** — Flag when an enhancement has already been investigated and found infeasible (ADR rejection, Electron limitation, upstream dependency) so the maintainer doesn't re-investigate.
3. **Misclassification detection** — Detect when something filed as an enhancement is actually a bug (e.g., "Feature request: make notifications work" is a bug), or when a bug report is actually a feature request (e.g., "Bug: there's no dark mode toggle"). Suggest a label correction rather than applying it automatically.

**Why:** The project receives a mix of bugs and enhancements. Currently:
- Bugs get full 3-phase triage; enhancements get nothing
- Maintainer time is spent explaining "we already looked into this" or "this isn't feasible because of Electron limitations"
- Misclassified issues waste triage effort — a bug treated as an enhancement doesn't get the missing-info check, and an enhancement treated as a bug gets irrelevant troubleshooting suggestions

**Research needed:**

*Context surfacing:*
- **Feature index generation:** Build a `feature-index.json` mapping keywords/topics to roadmap entries, ADRs, and research docs. The existing `generate-index.js` pattern can be extended. Each entry needs: topic, status (planned/investigating/rejected/shipped), document link, and a one-line summary.
- **Matching approach:** ADRs have clear titles and scopes — keyword matching may be sufficient. Roadmap items are more ambiguous; Gemini matching would be more reliable. Research whether a two-tier approach works (keyword first, Gemini as fallback for low-confidence matches).
- **Stale context risk:** What if a roadmap entry is outdated? The bot would surface stale information. The feature index should include a `last_updated` field so the bot can caveat old entries.

*Feasibility checking:*
- **What counts as "infeasible"?** ADRs that rejected an approach, research docs that concluded "not possible with current Electron APIs", roadmap items marked "Not Planned / Not Feasible". These need to be tagged in the feature index.
- **Language is critical.** Never say "rejected" or "impossible." Say "We explored this area previously and documented our findings" with a link. The reporter may have new information that changes the calculus.
- **Partial feasibility:** Some features are feasible in part but not fully. The bot should note "Phase 1 of this was shipped, later phases are awaiting feedback" rather than a binary feasible/infeasible.

*Misclassification detection:*
- **Heuristic approach:** Check if an enhancement issue body contains bug-report language (e.g., "stopped working", "used to work", "broke after update", "error", "crash") or if a bug issue body contains enhancement language (e.g., "would be nice", "feature request", "could you add", "it would be great if").
- **AI-assisted approach:** Add a Gemini step that classifies the issue as bug/enhancement/question based on content, then compare against the applied label. If they disagree, suggest the correct label.
- **Output format:** "This appears to describe a bug rather than a feature request. If so, re-labelling it as `bug` would help us apply the right triage process." Never auto-relabel.
- **False positive tolerance:** Misclassification detection should have high precision (few false positives) even if recall is lower. A wrong suggestion here is worse than missing a misclassified issue.

*Workflow integration:*
- **Trigger scope:** Add `enhancement` to the label condition: `contains(labels, 'bug') || contains(labels, 'enhancement')`. Bug issues continue through the existing 3 phases; enhancement issues go through new enhancement-specific phases.
- **Phase 1 variant for enhancements:** Check for missing motivation, missing use case, and missing description of alternatives considered (the feature request template fields).
- **Comment format:** Same consolidated comment pattern. Enhancement context, feasibility notes, duplicate matches, and any misclassification hint all go in one comment.

**Guardrails:**
- Same humble language as the existing bot ("We've previously investigated this area...")
- Never say "rejected" or "infeasible" — say "We explored this and documented our findings in [ADR link]"
- Never auto-relabel. Only suggest: "This might be a bug report — re-labelling as `bug` would enable additional triage checks"
- Include a note that the roadmap is a living document and may have changed
- Limit to 3 context items per issue to avoid overwhelming the reporter
- Only trigger on issues, not PRs
- Misclassification suggestions should require high confidence (Gemini temperature 0.1-0.2)

**Effort:** Medium-Large (4-6 days, broken into sub-steps)
**Dependency:** Ideally, measure bot accuracy (2.3) before expanding scope. The real-time index refresh (2.1) also helps since enhancement duplicates are common.

### 2.5 Changelog Model Consolidation

**Preventive maintenance — should not be deferred.**

**What:** Align the changelog generator to use the same Gemini model as the triage bot (`gemini-2.5-flash`).

**Why:** The changelog generator still uses `gemini-2.0-flash-exp`, an experimental model. The ADR originally referenced yet another variant (`gemini-2.0-flash-thinking-exp-1219`). Experimental models get deprecated without notice — it is surprising this one still works. The triage bot already moved to `gemini-2.5-flash` (stable) without issues. This is a when-not-if breakage waiting to happen.

**Research needed:**
- Test 5-10 changelog entries with `gemini-2.5-flash` and compare quality against the current `gemini-2.0-flash-exp` output
- Check if the `responseMimeType` feature (used in the triage bot) would benefit the changelog generator too (structured JSON output instead of raw text)
- Verify the free tier quota is still sufficient with both systems on the same model
- Update ADR-005 to reflect the model change

**Guardrails:**
- Don't change the model without testing quality first
- Keep the PR title fallback in case the API fails
- Update the ADR to document the migration rationale

**Effort:** Tiny (1 hour of testing + a one-line change in the workflow + ADR update)

---

## 3. Proposed Research Order

Based on impact, risk, and dependencies:

### Batch 1 — Small, clear next steps (can be done in any order)

| Priority | Proposal | Effort | Rationale |
|----------|----------|--------|-----------|
| 1 | **2.1 Real-Time Index Refresh** | Small | Highest impact on duplicate detection, smallest effort, already planned |
| 2 | **2.3 Bot Accuracy Feedback Loop** | Small | Establishes measurement before expanding scope |
| 3 | **2.5 Changelog Model Consolidation** | Tiny | Preventive maintenance — the experimental model could break at any time |

These three are independent and low-risk. They could be done in parallel or in sequence. Priority 3 is arguably the most time-sensitive since the model could be deprecated without warning.

### Batch 2 — Clear next step

| Priority | Proposal | Effort | Rationale |
|----------|----------|--------|-----------|
| 4 | **2.4 Enhancement Triage (Phase 4)** | Medium-Large | The bot currently ignores all enhancement issues. This closes the biggest functional gap: context, feasibility, and misclassification detection. Benefits from accuracy data (2.3) and real-time index (2.1). |

Phase 4 is the natural next major step. The project receives a mix of bugs and enhancements, and the enhancement side gets no automated help. The misclassification detection is particularly valuable — a bug filed as an enhancement misses the entire triage pipeline today.

### Batch 3 — When Phase 4 is stable

| Priority | Proposal | Effort | Rationale |
|----------|----------|--------|-----------|
| 5 | **2.2 Pre-Research Prompt Generator** | Medium | Valuable but depends on having the feature index (built in Phase 4) and confidence in the bot's accuracy |

This builds on top of the feature index created for Phase 4. It's less urgent because it's a maintainer-facing tool (triggered by label), not a user-facing improvement.

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
