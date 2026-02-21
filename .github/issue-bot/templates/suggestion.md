# Solution Suggestion Template

This document describes the structure and behaviour of the AI-powered solution suggestions posted by the issue triage bot when a bug report matches known issues from the troubleshooting guide or configuration documentation.

## When Suggestions Are Posted

The bot triggers on new issues labelled `bug`. After Phase 1 (missing info detection), Phase 2 sends the issue title and body to the Gemini API along with a pre-processed index of troubleshooting and configuration sections. Gemini returns 0-3 matches ranked by relevance.

Suggestions are only included when Gemini finds a meaningful connection between the bug report and documented issues. If no matches are found, or if the Gemini API is unavailable, the comment is posted with Phase 1 content only (or not posted at all if there is nothing to report).

## Data Sources

| Source | File | Sections |
|--------|------|----------|
| Troubleshooting guide | `docs-site/docs/troubleshooting.md` | Common issues and solutions |
| Configuration reference | `docs-site/docs/configuration.md` | Configuration guides and examples |

Both sources are pre-processed into `.github/issue-bot/troubleshooting-index.json` by the `generate-index.js` script. The index must be regenerated when either source document changes.

### Regenerating the Index

```bash
node .github/issue-bot/scripts/generate-index.js
```

## Comment Structure

Solution suggestions appear in the consolidated comment between the PWA notice and the missing information checklist:

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
| "This is the same issue as..." | "This might be related to a known issue" |
| "You should clear your cache" | "You could try clearing the application cache" |
| "The fix is..." | "This appears similar because..." |

## Gemini Integration

The bot uses the Gemini Flash API (same integration pattern as the changelog generator) with low temperature (0.3) for deterministic matching. The Gemini response is validated as JSON, and only specific fields are extracted (index, reason, actionable step). Raw Gemini output is never posted to the issue.

If the `GEMINI_API_KEY` secret is not configured (e.g., on forks), Phase 2 is skipped entirely and only Phase 1 content is posted.

## Rate Limiting

- At most one bot comment per issue (shared with Phase 1)
- At most 3 solution suggestions per comment
- One Gemini API call per issue (well within the free tier limit of 1,500 requests/day)

## Example Output

When a user reports a blank screen after login and is missing debug output:

> 👋 Thanks for reporting this issue!
>
> **This might be related to a known issue:**
>
> - [Unable to log in, stuck on a blank screen after entering credentials](https://ismaelmartinez.github.io/teams-for-linux/troubleshooting#issue-unable-to-log-in-stuck-on-a-blank-screen-after-entering-credentials) — This appears similar because you described a blank screen after entering credentials. You could try clearing the Cache, Code Cache, and Local Storage directories at `~/.config/teams-for-linux/`.
>
> - [Blank Page at Login](https://ismaelmartinez.github.io/teams-for-linux/troubleshooting#issue-blank-page-at-login) — This might be related since the issue mentions a blank page during login. You could try refreshing with Ctrl+R or clearing the Application Cache folder.
>
> > These suggestions are based on our documentation and may not be exact matches.
>
> To help us investigate, could you provide some additional details?
>
> **Missing information:**
> - [ ] **Debug console output** — Log output from running the application with debug logging enabled
>
> <details>
> <summary><b>How to get debug logs</b></summary>
>
> 1. Run the application from the terminal with logging enabled:
>    ```bash
>    ELECTRON_ENABLE_LOGGING=true teams-for-linux --logConfig='{"transports":{"console":{"level":"debug"}}}'
>    ```
> 2. Reproduce the issue
> 3. Copy the relevant console output
> 4. Feel free to redact any sensitive information (emails, URLs, etc.)
>
> </details>
>
> > **Tip:** You might also find helpful information in our [Troubleshooting Guide](https://ismaelmartinez.github.io/teams-for-linux/troubleshooting).
>
> ---
>
> *I'm a bot that helps with issue triage. Suggestions are based on documentation and may not be exact. A maintainer will review this issue.*

## Related Files

- **Workflow:** [`.github/workflows/issue-triage-bot.yml`](../../workflows/issue-triage-bot.yml)
- **Index generator:** [`.github/issue-bot/scripts/generate-index.js`](../scripts/generate-index.js)
- **Pre-processed index:** [`.github/issue-bot/troubleshooting-index.json`](../troubleshooting-index.json)
- **Phase 1 template:** [`.github/issue-bot/templates/missing-info.md`](missing-info.md)
- **Phase 3 template:** [`.github/issue-bot/templates/duplicate.md`](duplicate.md)
- **Research:** [`docs-site/docs/development/research/github-issue-bot-investigation.md`](../../../docs-site/docs/development/research/github-issue-bot-investigation.md)
