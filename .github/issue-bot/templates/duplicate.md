# Duplicate Detection Template

This document describes the structure and behavior of the duplicate detection suggestions posted by the issue triage bot when a new bug report appears similar to existing open or recently closed issues.

## When Duplicate Suggestions Are Posted

The bot triggers on new issues labeled `bug`. After Phase 1 (missing info detection) and Phase 2 (solution suggestions), Phase 3 sends the issue title and body to the Gemini API along with a pre-processed index of open and recently closed issues. Gemini returns 0-3 matches ranked by similarity.

Duplicate suggestions are only included when Gemini finds a strong semantic connection between the new report and existing issues (same bug, overlapping symptoms, same component). If no matches are found, the Gemini API is unavailable, or the issue index is missing, the comment is posted with Phase 1 and Phase 2 content only.

## Data Source

| Source | File | Description |
|--------|------|-------------|
| Issue index | `.github/issue-bot/issue-index.json` | Compact summaries of open and recently closed issues |

The index is generated weekly by the `update-issue-index.yml` workflow, which runs `generate-issue-index.js` to fetch issues from the GitHub API. The index contains:

- All open issues (excluding pull requests and bot-created issues)
- Issues closed within the last 90 days
- Capped at 200 entries (open issues prioritized)

Each entry includes: issue number, title, state, labels, a 200-character body summary, creation/close dates, and milestone.

### Regenerating the Index

The index regenerates automatically every Monday at 4:00 UTC. To regenerate manually:

```bash
GITHUB_TOKEN=ghp_xxx node .github/issue-bot/scripts/generate-issue-index.js
```

Or trigger the workflow manually via the GitHub Actions UI (`update-issue-index.yml` > Run workflow).

## Comment Structure

Duplicate suggestions appear in the consolidated comment between the solution suggestions and the missing information checklist:

```text
[Greeting]              — Thanks the reporter
[PWA Notice]            — (conditional) Notes if bug reproduces on Teams web/PWA
[Solution Suggestions]  — (conditional, Phase 2) AI-matched documentation sections
[Duplicate Suggestions] — (conditional, Phase 3) Potentially related issues
[Missing Info List]     — (conditional, Phase 1) Checkbox list of missing fields
[Debug Instructions]    — (conditional) Collapsible section with debug logging steps
[Troubleshooting Tip]   — Link to the troubleshooting guide
[Bot Disclosure]        — Identifies as automated triage bot
```

## Language Guidelines

The bot follows the project's [bot tone guidelines](../../../docs-site/docs/development/research/github-issue-bot-investigation.md#6-bot-language--tone-guidelines):

| Instead of | Bot uses |
|------------|----------|
| "This is a duplicate of #123" | "This issue might be related to existing discussions" |
| "Close this as duplicate" | "If one of these matches your issue, consider adding your details there instead" |
| "This is the same bug as..." | "This might be related because..." |
| "Already fixed" | "Resolved in v2.x.x" |

## Gemini Integration

The bot uses the Gemini Flash API (same integration pattern as Phase 2) with temperature 0.2 (lower than Phase 2's 0.3 to reduce false positives — incorrectly labeling an issue as a duplicate is more disruptive than missing a genuine duplicate). Gemini returns structured JSON with issue number, similarity percentage, and reason.

The response is validated as JSON, and only specific fields are extracted (number, reason, similarity). Returned issue numbers are verified against the index to prevent hallucinated references. Raw Gemini output is never posted to the issue.

If the `GEMINI_API_KEY` secret is not configured (e.g., on forks), Phase 3 is skipped entirely and only Phase 1/Phase 2 content is posted.

## Rate Limiting

- At most one bot comment per issue (shared with Phase 1 and Phase 2)
- At most 3 duplicate suggestions per comment
- Minimum 60% similarity threshold for inclusion
- One Gemini API call per issue for Phase 3 (separate from Phase 2's call)
- Total: two Gemini API calls per issue (well within the free tier limit of 1,500 requests/day)

## Example Output

When a user reports a keyboard shortcut issue that matches an existing open issue and a recently resolved issue:

> 👋 Thanks for reporting this issue!
>
> **This issue might be related to existing discussions:**
>
> *Potentially related open issues:*
> - #2184 — "Can't register Quick Chat keyboard shortcut" (85% similar) — This appears to describe the same keyboard shortcut registration issue
>
> *Recently resolved issues that could be relevant:*
> - #1755 — "Window decorations stuck in dark mode" (Resolved in v2.2.1) — This appears similar because it involves a UI rendering issue after a version update
>
> > If one of these matches your issue, consider adding your details there instead.
>
> > **Tip:** You might also find helpful information in our [Troubleshooting Guide](https://ismaelmartinez.github.io/teams-for-linux/troubleshooting).
>
> ---
>
> *I'm a bot that helps with issue triage. Suggestions are based on documentation and may not be exact. A maintainer will review this issue.*

## Related Files

- **Workflow:** [`.github/workflows/issue-triage-bot.yml`](../../workflows/issue-triage-bot.yml)
- **Index generator:** [`.github/issue-bot/scripts/generate-issue-index.js`](../scripts/generate-issue-index.js)
- **Pre-processed index:** [`.github/issue-bot/issue-index.json`](../issue-index.json)
- **Update workflow:** [`.github/workflows/update-issue-index.yml`](../../workflows/update-issue-index.yml)
- **Phase 1 template:** [`.github/issue-bot/templates/missing-info.md`](missing-info.md)
- **Phase 2 template:** [`.github/issue-bot/templates/suggestion.md`](suggestion.md)
- **Research:** [`docs-site/docs/development/research/github-issue-bot-investigation.md`](../../../docs-site/docs/development/research/github-issue-bot-investigation.md)
