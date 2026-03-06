---
id: 018-issue-triage-bot-github-app-migration
---

# ADR 018: Issue Triage Bot Migration to Standalone GitHub App

## Status

Implemented

## Context

The issue triage bot was originally built as a set of GitHub Actions workflows running inline JavaScript within this repository. Over four phases (v2.7.4 through v2.7.9), it grew to include missing info detection, AI-powered solution suggestions, duplicate detection, enhancement context surfacing, and misclassification detection. Supporting infrastructure included three workflow files, four Node.js scripts, three JSON indexes, three template docs, and a monthly accuracy report workflow.

This approach had several limitations. The inline JavaScript in YAML was difficult to test and review. The JSON indexes (issue, feature, troubleshooting) required separate cron workflows to stay current and were committed to the repository, creating noise in the git history. The bot ran under `github-actions[bot]` using repository secrets, making it impossible to install on other repositories without duplicating all the workflow files. Rate limiting and state management were constrained by what GitHub Actions provides.

## Decision

Extract the triage bot into a standalone Go service deployed as a registered GitHub App at [github-issue-triage-bot](https://github.com/IsmaelMartinez/github-issue-triage-bot). The service runs on Google Cloud Run, backed by Neon PostgreSQL with pgvector for vector similarity search and Gemini 2.5 Flash for LLM generation. Infrastructure is managed with Terraform.

Remove all local bot infrastructure from this repository:

- `.github/workflows/issue-triage-bot.yml` (disabled, then deleted)
- `.github/workflows/update-issue-index.yml` (disabled, then deleted)
- `.github/workflows/update-feature-index.yml` (disabled, then deleted)
- `.github/workflows/bot-accuracy-report.yml` (deleted)
- `.github/issue-bot/` directory (scripts, JSON indexes, templates)

The `remove-awaiting-feedback.yml` workflow is independent of the triage bot and remains in this repository.

## Consequences

### Positive

- One-click installation via GitHub App with no secrets to configure in the consuming repository
- The bot authenticates as itself with granular permissions (Issues read/write only), not as a user or via repository-level PATs
- Indexes are managed in the database (Neon PostgreSQL with pgvector) rather than committed as JSON files, eliminating git history noise and staleness windows
- The Go service is independently testable, deployable, and versionable
- Architecture decisions for the bot are documented in the bot repo's own `docs/adr/` directory

### Negative

- Introduces external infrastructure (Cloud Run, Neon, Terraform) that must be maintained separately
- Bot behaviour is no longer visible by reading workflow files in this repository; contributors need to check the bot repo
- Adds a dependency on an external service for issue triage (GitHub Actions workflows were self-contained within GitHub)

### Neutral

- The research documents (`github-issue-bot-investigation.md`, `ai-automation-review-and-enhancements.md`) are retained for historical reference with migration admonitions added
- The bot's four phases remain functionally identical; this is an infrastructure change, not a behaviour change

## Alternatives Considered

### Option 1: Keep workflows but improve them

Continue with the GitHub Actions approach but refactor the inline JavaScript into proper Node.js modules with tests.

- Pros: No external infrastructure, everything stays in one repository
- Cons: Still limited by Actions execution model, indexes still committed to git, not installable on other repos
- **Why rejected**: The fundamental limitations (no real database, no webhook model, no independent deployment) would persist regardless of code quality improvements

### Option 2: Probot framework

Use the Probot framework to build a GitHub App with Node.js.

- Pros: Mature ecosystem, good GitHub integration, JavaScript (matching existing codebase)
- Cons: Requires hosting, Probot abstractions add complexity for simple webhook handling
- **Why rejected**: Go was chosen for the standalone service for its simpler deployment model on Cloud Run and strong standard library for HTTP/webhook handling. See the bot repo's ADRs for the full language decision.

## Related

- Research: `docs-site/docs/development/research/github-issue-bot-investigation.md` (historical)
- Research: `docs-site/docs/development/research/ai-automation-review-and-enhancements.md` (historical)
- External: [github-issue-triage-bot](https://github.com/IsmaelMartinez/github-issue-triage-bot) repository
- PR: #2302 (disabled old triage bot workflows)
