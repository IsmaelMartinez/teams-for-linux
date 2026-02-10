# Missing Information Request Template

This document describes the structure and behavior of the automated comment posted by the issue triage bot when a bug report is missing important information.

## When This Comment Is Posted

The bot triggers on new issues labeled `bug` (auto-applied by the bug report form template). It analyzes the issue body for missing optional-but-important fields:

| Field | Detection Logic |
|-------|----------------|
| **Reproduction steps** | Default numbered template (`1. / 2. / 3. / ...`) was not filled in |
| **Debug console output** | Default command template was not replaced with actual log output |
| **Expected behavior** | Default numbered template was not filled in |

Additionally, the bot notes when the reporter indicated the bug is reproducible on the Teams website/PWA, suggesting it may be a Microsoft Teams web app issue.

## Comment Structure

```text
[Greeting]            — Thanks the reporter
[PWA Notice]          — (conditional) Notes if bug reproduces on Teams web/PWA
[Missing Info List]   — (conditional) Checkbox list of missing fields
[Debug Instructions]  — (conditional) Collapsible section with debug logging steps
[Troubleshooting Tip] — Link to the troubleshooting guide
[Bot Disclosure]      — Identifies as automated triage bot
```

## Language Guidelines

The bot uses humble, suggestive language following the project's [bot tone guidelines](../../../docs-site/docs/development/research/github-issue-bot-investigation.md#6-bot-language--tone-guidelines):

| Instead of | Bot uses |
|------------|----------|
| "You need to provide logs" | "Could you provide some additional details?" |
| "This is a Teams web bug" | "This might indicate the issue is with the Teams web app" |
| "Check the docs" | "You might also find helpful information in our Troubleshooting Guide" |

## Rate Limiting

- The bot posts at most **one comment per issue**
- It checks for existing bot comments before posting to prevent duplicates
- Only triggers on `issues: opened` events (not edits or re-labels)
- Bot-created issues are skipped entirely

## Example Output

When reproduction steps and debug output are missing:

> 👋 Thanks for reporting this issue!
>
> To help us investigate, could you provide some additional details?
>
> **Missing information:**
> - [ ] **Reproduction steps** — Step-by-step instructions to trigger the bug
> - [ ] **Debug console output** — Log output from running with debug logging enabled
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
> ---
>
> *I'm a bot that helps with initial issue triage. A maintainer will review this issue.*

## Related Files

- **Workflow:** [`.github/workflows/issue-triage-bot.yml`](../../workflows/issue-triage-bot.yml)
- **Research:** [`docs-site/docs/development/research/github-issue-bot-investigation.md`](../../../docs-site/docs/development/research/github-issue-bot-investigation.md)
- **Bug Report Template:** [`.github/ISSUE_TEMPLATE/bug_report_form.yml`](../../ISSUE_TEMPLATE/bug_report_form.yml)
