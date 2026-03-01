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
- `.changelog/README.md` - Quick setup guide
- `docs-site/docs/development/manual-release-process.md` - Release guide

**npm Scripts:**
```json
{
  "release:prepare": "node scripts/release-prepare.js"
}
```

**Manual changelog entries:** Users can simply create `.changelog/*.txt` files directly.

**GitHub Action Trigger:**
```yaml
on:
  pull_request_target:
    types: [opened, synchronize]
permissions:
  contents: write
  pull-requests: write
```

> **Note:** The workflow uses `pull_request_target` instead of `pull_request` to enable posting comments on external fork PRs. See [External Changelog Generation Research](../research/external-changelog-generation-research.md) for security considerations.

**Gemini API Configuration:**
- Model: `gemini-2.5-flash` (stable; migrated from experimental models — see amendment below)
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

## Amendments

### 2026-02-05: Enhanced Release Notes Generation

**Context:** The original implementation provided good changelog entries but the release notes were a flat list without categorization or documentation links.

**Enhancement:** Added `generateReleaseNotes.mjs` script that:
- **Categorizes changes** automatically based on conventional commit prefixes (feat, fix, docs, etc.)
- **Detects Electron updates** and links to Electron release notes
- **Detects configuration changes** by parsing `docs/configuration.md` and matching option names in changelog entries
- **Includes documentation links** to relevant sections automatically

**New Features:**
- `npm run generate-release-notes` - Generate categorized release notes
- `npm run release:prepare -- --dry-run` - Preview release without making changes
- PR bodies now include full categorized release notes with documentation links

**Benefits:**
- No hardcoded keyword mappings to maintain
- Config options extracted dynamically from documentation
- Electron version detection is automatic
- Dry-run mode enables safe preview before committing

### 2026-02-14: Snap Release Automation

**Context:** The snap release process had a version ambiguity problem. Every push to main published snaps to the edge channel with the same version number (e.g., `2.7.5`). Post-release merges produced edge snaps with the same version as the release, making it impossible to tell which edge revision matched the actual release when promoting to stable.

**Changes:**
- **Edge builds now include commit SHA suffix** — Snaps published to edge are versioned as `2.7.5-edge.g1a2b3c4`, making each build uniquely identifiable
- **New `snap-release.yml` workflow** — Triggered when a GitHub Release is published, builds snaps from the release tag and uploads them to the **candidate** channel using `snapcraft upload --release=candidate`
- **Three-channel strategy** — edge (dev builds) → candidate (release builds) → stable (manual promotion)

**Benefits:**
- Clear distinction between development and release snap builds
- No more version ambiguity when promoting to stable
- Release builds are automatically published to candidate on GitHub Release
- Only the manual candidate → stable promotion step remains

### 2026-03-01: Changelog Model Consolidation

**Context:** The changelog generator was still using `gemini-2.0-flash-exp`, an experimental model that could be deprecated without notice. The ADR originally referenced `gemini-2.0-flash-thinking-exp-1219`, yet another experimental variant. Meanwhile, the issue triage bot had already migrated to `gemini-2.5-flash` (stable) without quality issues. This was a when-not-if breakage risk.

**Change:** Migrated the changelog generator from `gemini-2.0-flash-exp` to `gemini-2.5-flash`, aligning all AI automation systems in the project on the same stable model.

**Rationale:**
- Experimental models (`-exp` suffix) can be deprecated at any time by Google
- The triage bot has been running on `gemini-2.5-flash` since v2.7.8 with no quality regressions
- Having all systems on the same model simplifies quota monitoring and reduces the blast radius of API changes
- No quality difference observed — changelog entries remain concise (60-80 chars) and consistent

**Impact:** One-line model URL change in `changelog-generator.yml`. No changes to prompt, temperature, or output format. The PR title fallback (when Gemini fails) continues to work as before.

## References

- **Implementation PR:** #1951
- **Gemini API Docs:** https://ai.google.dev/gemini-api/docs
- **Manual Release Process:** `docs-site/docs/development/manual-release-process.md`
- **GitHub Actions Security:** https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions

## Decision Date

2025-11-17

## Decision Makers

- @IsmaelMartinez (Project Maintainer)
- Claude Code (Implementation Assistant)
