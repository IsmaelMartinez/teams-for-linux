# External Changelog Generation Research

**Issue**: External fork PRs cannot push changelog files
**Related**: [ADR-005 - AI-Powered Changelog Generation](../adr/005-ai-powered-changelog-generation.md)
**Status**: In Progress
**Date**: 2025-01-18

## Overview

The current AI-powered changelog generation workflow fails for PRs from external forks because the `GITHUB_TOKEN` cannot push to repositories it doesn't have write access to.

## Problem Statement

When a PR comes from an external fork:
1. The workflow checks out the fork's branch
2. Generates a changelog entry using Gemini AI
3. Attempts to commit and push the `.changelog/pr-XXX.txt` file
4. **Fails** because `GITHUB_TOKEN` only has write access to the main repository

This means external contributors don't get automatic changelog entries.

## Options Considered

### Option A: Generate Changelog at Merge Time

Move changelog generation from PR open to PR merge event (`pull_request: closed` with `merged: true`).

**Pros:**
- Works for all PRs (internal and external)
- No permission issues - always runs on main repo
- Simpler workflow (one trigger point)

**Cons:**
- Contributors can't preview/edit changelog before merge
- Triggers additional build after merge (creates noise)
- Adds commit to main after every merge

**Decision:** Rejected due to double-build issue.

### Option B: Generate at Release Preparation Time

Defer changelog generation entirely to release time via a "Prepare Release" workflow.

**Pros:**
- No workflow changes during PR lifecycle
- Works for all PRs
- Can batch-generate and review before release
- Enables additional automation (release notes generation with AI)

**Cons:**
- Loses per-PR visibility of changelog entry
- Requires implementation of release automation workflow

**Decision:** Planned for Phase 2 implementation.

### Option C: Fork Detection with Graceful Degradation (Selected)

Keep current workflow but handle forks gracefully:
1. Detect if PR is from external fork
2. For internal PRs: Push as usual
3. For external PRs: Skip push, post comment with instructions

**Pros:**
- Minimal change to existing flow
- Internal PRs work exactly as before
- External contributors get AI-generated suggestion with clear instructions
- Quick to implement

**Cons:**
- External contributors need manual step (or maintainers add at merge)
- Two slightly different experiences

**Decision:** Selected for Phase 1 implementation.

## Implementation Plan

### Phase 1: Quick Fix (This PR)

Modify `changelog-generator.yml` to:
1. Detect external forks by comparing `head.repo.full_name` with `base.repo.full_name`
2. For external forks: skip push step, post instructional comment
3. For internal PRs: continue with current behavior

The comment for external forks will include:
- The AI-generated changelog content
- Clear instructions to create the file manually
- A copy-paste command for convenience

### Phase 2: Release Automation (Future)

Create a "Prepare Release" workflow that:
1. Fetches all merged PRs since last release tag
2. Identifies PRs missing changelog entries
3. Generates entries for missing ones via Gemini
4. Runs release preparation (version bump, appdata.xml update)
5. Creates a release PR with all changes

This ensures no changelog entries are missed, even if external contributors don't add them manually.

### Phase 3: Enhanced Release Notes (Future)

Extend the release automation to:
1. Generate comprehensive release notes using Gemini
2. Create GitHub release with formatted notes
3. Update documentation automatically

## Technical Details

### Fork Detection Logic

```yaml
# Check if PR is from external fork
if: github.event.pull_request.head.repo.full_name != github.event.pull_request.base.repo.full_name
```

### Comment Template for External Forks

```markdown
Changelog entry generated:

\`\`\`
{generated content}
\`\`\`

**To add this to your PR**, create `.changelog/pr-${{ github.event.pull_request.number }}.txt`:

\`\`\`bash
cat <<'EOT' > .changelog/pr-${{ github.event.pull_request.number }}.txt
{generated content}
EOT
git add .changelog/ && git commit -m "chore: add changelog entry" && git push
\`\`\`

Or create the file manually with the content above.
```

## References

- [ADR-005: AI-Powered Changelog Generation](../adr/005-ai-powered-changelog-generation.md)
- [Changelog README](.changelog/README.md)
- [Manual Release Process](manual-release-process.md)
