# GitHub Issue Bot Research & Implementation Plan

:::info Phase 3 Shipped + Batch 1 Complete
Phase 1 (Information Request Bot) shipped in v2.7.4 (PR [#2135](https://github.com/IsmaelMartinez/teams-for-linux/pull/2135)). Phase 2 (Solution Suggester) adds AI-powered matching against the troubleshooting guide and configuration docs using Gemini. Phase 3 (Duplicate Detector) compares new issues against a pre-processed index of open and recently closed issues via Gemini Flash. All three phases produce a single consolidated comment per issue. **Batch 1** improvements shipped: real-time issue index refresh (Phase 3.1), bot accuracy feedback loop, and changelog model consolidation. Phase 4 (enhancement context) is planned next.
:::

**Status:** Phase 1 ✅ Shipped (v2.7.4) | Phase 2 ✅ Shipped | Phase 3 ✅ Shipped | Batch 1 ✅ | Phase 4 planned
**Date:** February 2026
**Issue:** Investigation for intelligent GitHub issue automation
**Author:** Claude AI Assistant
**Dependencies:** None (builds on existing infrastructure)

---

## Executive Summary

This document investigates implementing an intelligent GitHub issue bot for Teams for Linux that could:

1. **Suggest solutions** for common issues using existing documentation
2. **Detect potential duplicate issues** from historical data
3. **Trigger research jobs** for enhancement requests
4. **Request clarification** and logs from reporters
5. **Reduce maintainer workload** by automating initial triage

### Key Principle

The bot should use **humble, suggestive language** ("might", "could", "this appears to be similar to") rather than definitive statements. It assists maintainers rather than replacing human judgment.

---

## 1. Problem Statement

### Current Pain Points

1. **Duplicate Issues**: Users report issues that have been solved before or are known limitations
2. **Missing Information**: Bug reports often lack logs, version info, or reproduction steps
3. **Enhancement Noise**: Feature requests without context or prior research
4. **Maintainer Time**: Manual triage consumes significant maintainer bandwidth
5. **Knowledge Gap**: Users don't know about existing solutions in documentation

### Opportunity

The repository has **rich structured data** that could inform an intelligent bot:

- **Troubleshooting guide** (`docs-site/docs/troubleshooting.md`) - Common issues and solutions
- **16 research documents** with detailed feature investigations
- **13 ADRs** documenting technical decisions and rejected approaches
- **Issue templates** with structured fields (version, package type, reproduction steps)
- **Historical closed issues** (patterns of what worked)
- **Roadmap** showing planned/blocked/rejected features

---

## 2. Proposed Bot Capabilities

### 2.1 Solution Suggester (Bug Reports)

**Trigger:** New issue with `bug` label or using bug report template

**Behavior:**
1. Analyze issue title and description
2. Search troubleshooting guide and closed issues for matches
3. If match found, comment with suggestive language:

```markdown
👋 Thanks for reporting this issue!

This might be related to a known issue. Here are some things that could help:

**Possible matches from our troubleshooting guide:**
- [Blank Page at Login](../../troubleshooting.md#issue-blank-page-at-login) - If you're seeing "Microsoft Teams - initializing"
- [Application Cache Issues](../../troubleshooting.md#issue-application-fails-to-launch-after-update) - If this started after an update

**Could you try these steps?**
1. Clear the application cache: `rm -rf ~/.config/teams-for-linux/Cache`
2. Restart the application

If this doesn't help, please share:
- Your Teams for Linux version (`teams-for-linux --version`)
- Your package type (AppImage, deb, rpm, snap, flatpak)
- Console output when running with debug logging:
  `teams-for-linux --logConfig='{"transports":{"console":{"level":"debug"}}}'`

*I'm a bot providing suggestions based on documentation. A maintainer will review this issue.*
```

**Language Guidelines:**
- "This **might** be related to..."
- "You **could** try..."
- "This **appears** similar to..."
- "If I'm understanding correctly..."
- Never: "This **is** a duplicate" or "You **should** do..."

### 2.2 Duplicate Detector

**Trigger:** New issue opened

**Behavior:**
1. Generate embeddings from issue title + body
2. Compare against embeddings of open issues and recent closed issues
3. If similarity score > threshold, suggest possible duplicates:

```markdown
🔍 This issue might be related to existing discussions:

**Potentially related open issues:**
- #1987 - "Tray icon doesn't show logout state" (75% similar)
- #2015 - "Camera stays on after screen lock" (68% similar)

**Recently resolved issues that could be relevant:**
- #1755 - "Window decorations stuck in dark mode" (Resolved in v2.2.1)

If one of these matches your issue, consider adding your details there instead.

*Similarity is based on content analysis and may not be exact.*
```

### 2.3 Enhancement Research Trigger

**Trigger:** New issue with `enhancement` label or feature request template

**Behavior:**
1. Check if feature exists in:
   - Roadmap (planned, blocked, rejected)
   - Research documents (investigated)
   - ADRs (decided against)
2. Provide context and potentially trigger research workflow:

```markdown
📋 Thanks for the feature suggestion!

**Current status of related features:**

This appears related to our research on [Graph API Integration](graph-api-integration-research.md):
- **Phase 1** (POC): ✅ Complete
- **Phases 2-3**: Awaiting user feedback

Your feedback helps prioritize development! A maintainer will review this request.

**If this is a new feature area**, we might create a research spike to investigate feasibility.

*Based on our [Development Roadmap](../plan/roadmap.md) and [Research Documents](README.md).*
```

For truly new features, the bot could:
- Add a `needs-research` label
- Optionally trigger a GitHub Action to create a research document skeleton

### 2.4 Information Request Bot

**Trigger:** Bug report missing required information

**Behavior:**
1. Parse issue against template requirements
2. Identify missing critical fields
3. Request specific information:

```markdown
ℹ️ To help investigate this issue, could you provide some additional details?

**Missing information:**
- [ ] Teams for Linux version (`teams-for-linux --version`)
- [ ] Package type (AppImage, deb, rpm, snap, flatpak)
- [ ] Desktop environment (GNOME, KDE, etc.)
- [ ] Debug console output

**How to get debug logs:**
1. Run: `teams-for-linux --logConfig='{"transports":{"console":{"level":"debug"}}}'`
2. Reproduce the issue
3. Copy the relevant console output (feel free to redact sensitive info)

*This information helps us reproduce and fix the issue faster.*
```

### 2.5 Stale Issue Nudge (Enhancement to Existing)

The repo already has `stale.yml`. The bot could enhance this with:
- Summarize any progress made on the issue
- Link to relevant documentation created since the issue was opened
- Suggest closing if the feature was implemented elsewhere

---

## 3. Technical Implementation Options

### 3.1 Option A: GitHub Actions + External AI API

**Architecture:**
```
Issue Event → GitHub Action → AI API (Gemini/Claude) → Comment on Issue
```

**Pros:**
- Builds on existing `changelog-generator.yml` pattern
- Uses proven Gemini integration (free tier: 1,500 req/day)
- No infrastructure to maintain

**Cons:**
- Limited context window for large documentation searches
- May require pre-processing documentation into embeddings

**Estimated Cost:** Free (within Gemini free tier)

### 3.2 Option B: GitHub Actions + RAG System

**Architecture:**
```
Issue Event → GitHub Action → RAG Query → Vector DB → AI API → Comment
```

**Components:**
1. **Embedding generation**: Pre-process docs into embeddings
2. **Vector storage**: Pinecone free tier, Supabase, or GitHub-hosted JSON
3. **RAG query**: Retrieve relevant chunks for AI context

**Pros:**
- Better accuracy for document matching
- Scales to large documentation bases
- More precise duplicate detection

**Cons:**
- More complex setup
- Requires embedding regeneration when docs change
- Additional service dependency

**Estimated Cost:** Free with Pinecone starter tier + Gemini

### 3.3 Option C: Dedicated GitHub App/Bot

**Architecture:**
```
GitHub Webhooks → Cloud Function/Worker → AI + DB → GitHub API
```

**Pros:**
- Real-time response (not limited by Action queue)
- More sophisticated state management
- Could handle comment replies, not just new issues

**Cons:**
- Infrastructure to maintain
- More complex deployment
- Requires hosting (Cloudflare Workers free tier possible)

**Estimated Cost:** Free tier possible, ~$5-10/month if scaled

### 3.4 Recommendation

**Start with Option A (GitHub Actions + Gemini)** as an MVP:
- Proven pattern from changelog generator
- Zero infrastructure cost
- Can evolve to Option B if accuracy needs improvement

---

## 4. Data Sources & Integration

### 4.1 Documentation Corpus

| Source | Content | Size | Update Frequency |
|--------|---------|------|------------------|
| `troubleshooting.md` | Common issues & solutions | ~300 lines | Monthly |
| `configuration.md` | All config options | ~500 lines | Per release |
| Research docs (16) | Feature investigations | ~200 lines each | As needed |
| ADRs (13) | Technical decisions | ~100 lines each | Per decision |
| Module READMEs | Implementation details | ~50 lines each | Per change |

### 4.2 Issue Patterns

For duplicate detection, analyze:
- Issue titles (high signal)
- Issue body first paragraph (problem statement)
- Labels applied
- Linked PRs and commits

### 4.3 Embedding Strategy

Pre-compute embeddings for:
1. Each troubleshooting section (by `####` headers)
2. Each research document executive summary
3. Each ADR decision summary
4. Each closed issue (title + first comment if resolution)

Store in `.github/issue-bot/embeddings.json` or external vector DB.

---

## 5. Implementation Phases

### Phase 1: Information Request Bot (MVP)

**Scope:** Detect missing information in bug reports, request details

**Files:**
```
.github/workflows/issue-triage-bot.yml
.github/issue-bot/templates/missing-info.md
```

**Effort:** 1-2 days

**Value:** Reduces back-and-forth, gets issues to actionable state faster

### Phase 2: Solution Suggester ✅ Shipped

**Scope:** Match issues against troubleshooting guide and configuration docs using Gemini AI

**Files:**
```
.github/issue-bot/troubleshooting-index.json  # Pre-processed index
.github/issue-bot/scripts/generate-index.js   # Index generator script
.github/issue-bot/templates/suggestion.md      # Documentation
```

**Implementation:** Extended `issue-triage-bot.yml` into a multi-step pipeline. Phase 1 analyses missing info, Phase 2 calls Gemini to match against a pre-processed index of troubleshooting and configuration sections, and a final step posts a single consolidated comment. All untrusted inputs passed via environment variables for security.

**Effort:** 3-5 days

**Value:** Resolves common issues without maintainer intervention

### Phase 3: Duplicate Detector ✅ Shipped

**Scope:** Compare new issues against open/recent closed issues using Gemini Flash

**Files:**
```
.github/issue-bot/issue-index.json              # Pre-processed issue index (generated weekly)
.github/issue-bot/scripts/generate-issue-index.js  # Index generator script
.github/workflows/update-issue-index.yml         # Weekly cron job (Monday 4:00 UTC)
.github/issue-bot/templates/duplicate.md         # Documentation
```

**Implementation:** Extended `issue-triage-bot.yml` with a Phase 3 step that reads a pre-processed index of open and recently closed issues (last 90 days), sends compact summaries to Gemini Flash (temperature 0.2), and returns 0-3 matches with similarity percentages. Uses the same hybrid approach as Phase 2: pre-processed JSON index + Gemini Flash matching at runtime. No embedding API needed. The index is regenerated weekly by a cron workflow.

**Effort:** 1 week

**Value:** Consolidates discussion, reduces duplicate investigation

### Phase 4: Enhancement Context

**Scope:** Link feature requests to roadmap/research/ADRs

**Additional Files:**
```
.github/issue-bot/feature-index.json  # Roadmap + research mapping
.github/issue-bot/templates/enhancement.md
```

**Effort:** 3-5 days

**Value:** Saves maintainer time explaining "already investigated" or "planned"

### Phase 5: Research Trigger (Optional)

**Scope:** Auto-create research document skeleton for new feature areas

**Effort:** 2-3 days

**Value:** Systematizes enhancement investigation

---

## 6. Bot Language & Tone Guidelines

### Core Principles

1. **Humility**: The bot suggests, never dictates
2. **Transparency**: Always disclose bot status
3. **Helpfulness**: Focus on solving user's problem
4. **Respect**: Thank users for contributing

### Required Phrases

| Instead of | Use |
|------------|-----|
| "This is a duplicate of #123" | "This might be related to #123" |
| "You need to provide logs" | "Could you share your logs? This would help us investigate" |
| "This feature was rejected" | "We investigated this previously - here's what we found" |
| "Fixed in v2.3.0" | "This appears to have been addressed in v2.3.0 - could you confirm?" |

### Template Structure

```markdown
[Greeting emoji] [Thank user]

[Main suggestion with humble language]

**[Section header]:**
- [Specific suggestions with links]

[Request for user action or feedback]

*[Bot disclosure and limitations notice]*
```

---

## 7. Security Considerations

### 7.1 Prompt Injection Protection

User-submitted issue content goes to AI. Mitigations:
- Sanitize input (remove markdown code blocks from prompt)
- Use system prompts that instruct AI to ignore embedded instructions
- Validate AI output before posting (check for unexpected content)

### 7.2 Rate Limiting

- Limit to one bot comment per issue
- Cooldown period before re-analyzing edited issues
- Don't respond to issues from known bot accounts

### 7.3 Sensitive Data

- Never include user emails or identifiers in prompts
- Don't expose internal file paths or server details
- Sanitize log snippets users might paste

### 7.4 Permissions

Use minimal GitHub token permissions:
- `issues: write` (to comment)
- `contents: read` (to read docs)

---

## 8. Success Metrics

### Quantitative

| Metric | Target | Measurement |
|--------|--------|-------------|
| Issues resolved by bot suggestions | 20% of bugs | Track issues closed within 48h after bot comment |
| Duplicate consolidation | 30% reduction | Compare open issue count month-over-month |
| Time to first response | < 5 minutes | Timestamp of bot comment vs issue creation |
| Missing info completion rate | 60% | Issues edited to add requested info |

### Qualitative

- User sentiment in issue comments (positive/negative reactions to bot)
- Maintainer feedback on triage time saved
- Accuracy of duplicate suggestions (false positive rate)

---

## 9. Comparison with Existing Solutions

### GitHub Actions + Probot Alternatives

| Solution | Pros | Cons |
|----------|------|------|
| **Probot** | Full-featured, mature | Requires hosting |
| **GitHub Actions** | No hosting, native | Limited webhook types |
| **GitHub Copilot for Issues** | Official, integrated | Not customizable |

### AI-Powered Issue Bots

| Solution | Model | Cost | Customization |
|----------|-------|------|---------------|
| **Sweep AI** | GPT-4 | $20+/mo | Low |
| **Sourcery** | Various | $12+/mo | Medium |
| **Custom (this proposal)** | Gemini Flash | Free | High |

**Recommendation:** Custom solution provides best value given:
- Existing Gemini integration and experience
- Specific documentation corpus
- Need for humble, project-specific language

---

## 10. Open Questions

### Technical

1. **Embedding model choice**: Gemini embeddings vs. open source (sentence-transformers)?
2. **Similarity threshold**: What score indicates "likely duplicate"?
3. **Update frequency**: How often to regenerate documentation index?

### Process

1. **Maintainer override**: How to handle bot mistakes? (thumbs down reaction? label?)
2. **Bot silence**: Should some issues skip bot entirely? (e.g., security reports)
3. **Multi-language**: Support non-English issues?

### Scope

1. **PR integration**: Should bot also analyze PRs? (changelog bot already does)
2. **Discussion support**: Extend to GitHub Discussions?
3. **External feedback**: Integration with Matrix chat mentioned in templates?

---

## 11. Alternative Approaches

### 11.1 Enhanced Issue Templates Only

Instead of a bot, improve templates to:
- Add dropdown for "I've checked troubleshooting guide"
- Link to search of existing issues
- Require version/package fields

**Pros:** No AI dependency, simple
**Cons:** Relies on user compliance, no active assistance

### 11.2 Documentation-First Approach

Focus investment on:
- Better SEO for troubleshooting docs
- More comprehensive FAQ
- Video tutorials for common issues

**Pros:** Prevents issues before they're filed
**Cons:** Users may not find docs before filing

### 11.3 Human Triage Team

Recruit community members for initial triage:
- Provide triage guidelines
- Use saved replies for common responses
- Reward active triagers

**Pros:** Human judgment, community building
**Cons:** Requires ongoing volunteer commitment

---

## 12. Smaller Quick Wins (Immediate Improvements)

While researching the full bot, these could be implemented immediately:

### 12.1 Enhanced Stale Bot Messages

Update `stale.yml` to include:
- Link to troubleshooting guide
- Mention of relevant version if issue predates a release
- Softer language

### 12.2 Issue Template Enhancements

Add to bug report template:
- Checkbox: "I have checked the troubleshooting guide"
- Dropdown: "Package type" (required)
- Link: "Search existing issues" URL

### 12.3 Saved Replies

Create GitHub Saved Replies for maintainer use:
- "Please provide logs"
- "This appears fixed in vX.X.X"
- "This is a known Teams web limitation"
- "Please try clearing cache"

### 12.4 Label Automation

Use `actions/labeler` to auto-apply labels based on:
- Keywords in title (audio, video, notification, etc.)
- Package type mentioned
- Error messages detected

---

## 13. Recommended Next Steps

### Immediate (This Week)

1. **Implement quick wins** (Section 12) - Low effort, immediate value
2. **Create saved replies** for maintainer consistency

### Short-term (2-4 Weeks)

1. **Build Phase 1 MVP** - Information request bot
2. **Test on 10-20 issues** before enabling broadly
3. **Gather maintainer feedback**

### Medium-term (1-2 Months)

1. **Implement Phase 2** - Solution suggester
2. **Build documentation index** for matching
3. **Measure success metrics**

### Long-term (If Validated)

1. **Phases 3-4** - Duplicate detection and enhancement context
2. **Consider RAG upgrade** if accuracy needs improvement
3. **Document as reusable pattern** for other projects

---

## 14. Conclusion

An intelligent GitHub issue bot could significantly reduce maintainer workload while improving user experience. The project's existing rich documentation, proven AI integration patterns (changelog generator), and structured issue templates provide a strong foundation.

**Key Recommendations:**

1. **Start with quick wins** - Enhanced templates, saved replies, label automation
2. **Build MVP bot** - Information request functionality using existing Gemini integration
3. **Use humble language** - Bot assists and suggests, never dictates
4. **Measure and iterate** - Define success metrics before expanding scope
5. **Leverage existing data** - Troubleshooting guide and research docs are valuable assets

**Risk Mitigation:**
- Start with low-stakes functionality (info requests)
- Always include human override mechanism
- Monitor for false positives and user complaints

---

## 15. Related Documentation

### Internal References

- **[ADR-005: AI-Powered Changelog Generation](../adr/005-ai-powered-changelog-generation.md)** - Existing AI integration pattern
- **[Troubleshooting Guide](../../troubleshooting.md)** - Primary data source for suggestions
- **[Development Roadmap](../plan/roadmap.md)** - Feature status tracking
- **[Research Document Index](README.md)** - Related investigations

### External References

- **[Gemini API Documentation](https://ai.google.dev/gemini-api/docs)** - AI provider
- **[GitHub Actions Events](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows)** - Webhook triggers
- **[Probot Framework](https://probot.github.io/)** - Alternative implementation option

### Issue Templates

- **[Bug Report Template](https://github.com/IsmaelMartinez/teams-for-linux/blob/main/.github/ISSUE_TEMPLATE/bug_report_form.yml)** - Current structure
- **[Feature Request Template](https://github.com/IsmaelMartinez/teams-for-linux/blob/main/.github/ISSUE_TEMPLATE/feature_request_form.yml)** - Current structure

---

**Document Status:** Batch 1 Complete
**Phase 1:** Information Request Bot — shipped in v2.7.4
**Phase 2:** Solution Suggester — AI-powered matching via Gemini, consolidated comment
**Phase 3:** Duplicate Detector — Issue index + Gemini Flash matching, real-time + weekly regeneration
**Batch 1:** Real-time index refresh (Phase 3.1), bot accuracy feedback loop, changelog model consolidation
**Next:** Batch 2 — Phase 4 enhancement triage (context, feasibility, misclassification)
