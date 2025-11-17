---
id: 005-ai-powered-changelog-generation
---

# ADR 005: Use AI-Powered Changelog Generation with Gemini

## Status

Accepted

## Context

### The Problem

The current release process forces one release per merge to main, which doesn't work well with high-velocity AI-assisted development. The workflow was:

1. Merge PR to main → automatically triggers build and release
2. Each merge creates a GitHub release and publishes to Snap edge channel
3. Cannot bundle multiple PRs before releasing
4. No control over when changes ship to users

Additionally, writing changelog entries manually when preparing releases is:
- Time-consuming (5-10 minutes per release)
- Error-prone (remembering all changes after the fact)
- Inconsistent (varying levels of detail and formatting)
- Done when memory of the PR is fading

### Requirements

1. **Decouple merging from releasing** - Merge PRs freely, release when ready
2. **Bundle multiple PRs** - Accumulate changes before releasing
3. **Maintain quality changelogs** - Concise, consistent, user-focused summaries
4. **LLM-friendly workflow** - Easy for AI assistants to help with releases
5. **Full control** - Decide exactly when to ship to snap/flatpak/GitHub
6. **Low maintenance** - Minimal manual work and cost

### Research Conducted

**Spike 1: Quality Validation**
- Tested Gemini 2.0 Flash on 5 real PRs from the repository
- Average quality score: 9.0/10
- Generated summaries averaged 60 characters vs manual 165 characters
- Better consistency and conciseness than manual entries

**Spike 2: Implementation Validation**
- Tested GitHub Actions permissions for committing to PR branches
- Validated industry-standard workflow pattern
- Confirmed secure implementation without script injection vulnerabilities

**Security Analysis**
- Identified and fixed script injection vulnerabilities
- Implemented PATH isolation to prevent command injection
- Used `actions/github-script@v7` instead of bash interpolation

## Decision

**We will implement an AI-powered changelog system using Google's Gemini API to automatically generate one-line changelog entries for each PR.**

### Architecture

**Changelog Staging Area:**
- `.changelog/` directory stores pending changelog entries
- Each merged PR creates `.changelog/pr-XXX.txt` with AI-generated summary
- Files accumulate on PR branches until consumed during release

**Workflow:**
1. PR opened/updated → GitHub Action triggers
2. Gemini AI analyzes PR title and description
3. Generates concise one-line summary (max 80 chars)
4. Creates `.changelog/pr-XXX.txt` on PR branch
5. Comments on PR with generated entry
6. On merge to main, changelog file comes along
7. Repeat for multiple PRs (files accumulate)
8. When ready to release:
   - Review accumulated `.changelog/*.txt` files
   - Update version in package.json and appdata.xml (manually or via script)
   - Commit and push → triggers build only when version changes

**Security Measures:**
- Use `actions/github-script@v7` to avoid script injection
- All user input via `context.payload` (never bash interpolation)
- Isolated environment with hardcoded PATH for npm operations
- No spreading of `process.env` to prevent PATH injection

## Alternatives Considered

### 1. Manual Changelog Entries

**Approach:** Continue writing changelogs manually when preparing releases

**Pros:**
- No external dependencies
- Full human control over wording

**Cons:**
- Time-consuming (5-10 min per release)
- Inconsistent format
- Written when memory is fading
- Human entries averaged 165 chars (too verbose)

**Verdict:** Rejected - AI produces better quality with less effort

### 2. Claude AI (Anthropic)

**Approach:** Use Claude via official GitHub Action

**Pros:**
- Excellent quality summaries
- Official Anthropic support

**Cons:**
- Not free (~$0.001 per summary)
- Requires separate API key

**Verdict:** Rejected - Gemini free tier is sufficient and high quality

### 3. Release PR Automation

**Approach:** Fully automated Release PR workflow (like Changesets)

**Pros:**
- Fully automated version bumping
- Industry-standard pattern

**Cons:**
- Complex setup
- Less flexibility for manual control
- Overkill for current needs

**Verdict:** Deferred - Start simple with manual process, automate later if needed

### 4. Commit to Main After Merge

**Approach:** Generate changelog and commit to main after PR merge

**Pros:**
- Simpler workflow

**Cons:**
- Creates extra commits on main
- Triggers extra CI/CD runs (50% overhead)
- Messy git history

**Verdict:** Rejected - Commit to PR branch instead

## Consequences

### Positive

1. **Decoupled workflow** - Can merge multiple PRs before releasing
2. **Better changelog quality** - Concise (60 vs 165 chars), consistent format
3. **Time savings** - 5-10 minutes saved per release
4. **LLM-friendly** - Plain text `.changelog/*.txt` files easy for AI to read
5. **Full control** - Decide exactly when to publish to snap/flatpak/GitHub
6. **Zero cost** - Gemini free tier: 1,500 requests/day (we use ~10-20/month)
7. **Always editable** - Can edit `.changelog/*.txt` files before releasing

### Negative

1. **External dependency** - Relies on Google's Gemini API
2. **API key management** - Must configure `GEMINI_API_KEY` in GitHub Secrets
3. **Potential AI errors** - Generated summary might be incorrect (mitigated by human review)
4. **New workflow** - Contributors need to understand `.changelog/` directory

### Neutral

1. **Manual release process** - Still manual (by design for control)
2. **LLM assistance optional** - Can use script or do fully manually
3. **Gradual adoption** - Can edit AI-generated entries or write manually

## Implementation

**Files Created:**
- `.github/workflows/changelog-generator.yml` - Auto-generates entries
- `scripts/release-prepare.js` - Optional script to consume changelogs
- `scripts/add-changelog.sh` - Manual changelog helper
- `.changelog/README.md` - Quick setup guide
- `docs-site/docs/development/manual-release-process.md` - Release guide
- `docs-site/docs/development/research/changelog-generator-setup.md` - Full setup docs

**npm Scripts:**
```json
{
  "changelog:add": "bash scripts/add-changelog.sh",
  "release:prepare": "node scripts/release-prepare.js"
}
```

**GitHub Action Trigger:**
```yaml
on:
  pull_request:
    types: [opened, synchronize]
permissions:
  contents: write
  pull-requests: write
```

**Gemini API Configuration:**
- Model: `gemini-2.0-flash-thinking-exp-1219`
- Temperature: 0.3 (consistent, less creative)
- Max tokens: 100 (sufficient for one-liner)
- Free tier: 1,500 requests/day

**Security Implementation:**
- Module-level constant: `SAFE_PATH = '/usr/bin:/bin'`
- Isolated environment for npm operations
- No user input in shell commands
- All data via `context.payload` in github-script

## Validation

**Spike 1 Results (Quality):**
- Tested on 5 real PRs from repository
- Average quality: 9.0/10
- Average length: 60 chars (vs manual 165 chars)
- Better conciseness and consistency than manual

**Spike 2 Results (Implementation):**
- GitHub Actions permissions work correctly
- Commits to PR branch successfully
- Workflow triggers appropriately
- Security checks pass (SonarQube)

**Production Test:**
- Validated on PR #1951 (this implementation)
- Generated entry: "Add AI-powered changelog system to decouple merging from releasing"
- Workflow executed successfully
- File committed to PR branch

## Future Considerations

1. **Full automation** - Could implement Release PR workflow later
2. **Extract as bot** - Could package as reusable GitHub Action for other projects
3. **Build optimization** - Could detect version changes to skip unnecessary builds
4. **Multi-repo support** - Could share Gemini API key across multiple repositories

## References

- **Implementation PR:** #1951
- **Gemini API Docs:** https://ai.google.dev/gemini-api/docs
- **Setup Guide:** `docs-site/docs/development/research/changelog-generator-setup.md`
- **Manual Release Process:** `docs-site/docs/development/manual-release-process.md`
- **GitHub Actions Security:** https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions

## Decision Date

2025-11-17

## Decision Makers

- @IsmaelMartinez (Project Maintainer)
- Claude Code (Implementation Assistant)
