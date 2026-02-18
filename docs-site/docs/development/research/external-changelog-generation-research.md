# External Changelog Generation Research

:::tip Shipped
Both phases implemented. This document is retained for historical context.
:::

**Issue**: External fork PRs cannot push changelog files
**Related**: [ADR-005 - AI-Powered Changelog Generation](../adr/005-ai-powered-changelog-generation.md)
**Status**: Shipped (Phase 1 and Phase 2)
**Date**: 2025-01-18
**Updated**: 2026-01-26

## Overview

The AI-powered changelog generation workflow handles PRs from external forks gracefully by using the `pull_request_target` trigger, which runs in the base repository context with full permissions to post comments.

## Problem Statement

When using the `pull_request` trigger, PRs from external forks face permission restrictions:
1. The `GITHUB_TOKEN` has read-only access to the base repository
2. Write permissions declared in the workflow are ignored for fork PRs
3. The workflow cannot push to the fork's branch (no write access to external repos)
4. The workflow cannot even post comments on the PR (403 error)

**Solution**: Use `pull_request_target` trigger which runs in the base repository context with full permissions. This allows posting comments while maintaining security by never checking out fork code.

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

### Phase 1: Fork Detection with Graceful Degradation (✅ Implemented)

**Status**: Implemented with `pull_request_target` trigger

The workflow uses `pull_request_target` instead of `pull_request` to run in the base repository context, enabling:
- Full permissions to post comments on external fork PRs
- Access to repository secrets (GEMINI_API_KEY)
- Proper fork detection and handling

**Security Considerations:**
- `pull_request_target` runs with elevated permissions, so we must NEVER checkout and execute code from external forks
- The workflow only uses PR metadata (title, body) for Gemini API calls, which is safe
- Changelog existence is checked via GitHub API, not by checking out code
- Checkout is only performed for internal PRs where `head.repo == base.repo`

**Behavior:**
1. Detect external forks by comparing `head.repo.full_name` with `base.repo.full_name`
2. Check if changelog already exists via GitHub API (no checkout required)
3. For external forks: Generate changelog from PR metadata, post instructional comment
4. For internal PRs: Checkout, generate changelog, commit to PR branch, post confirmation comment

The comment for external forks includes:
- The AI-generated changelog content
- Clear instructions to create the file manually
- A copy-paste command for convenience

### Phase 2: Release Automation (✅ Implemented)

**Status**: Implemented in `.github/workflows/prepare-release.yml`

Automated GitHub Actions workflow that:
1. Validates changelog entries exist in `.changelog/` directory
2. Runs release preparation script with specified version bump
3. Creates release branch (`release/vX.Y.Z`)
4. Commits all changes (package.json, package-lock.json, appdata.xml)
5. Creates a pull request with detailed release notes

**Triggers**: Manual workflow dispatch from GitHub Actions UI

**Benefits**:
- No local setup required
- Consistent release process
- Automatic PR creation with standardized format
- Reduces human error in version bumping and file updates

**Usage**: See [Release Process Documentation](../manual-release-process.md#option-a-automated-github-workflow-recommended)

**Note**: Phase 2 initially planned to fetch PRs and generate missing changelogs with Gemini, but this proved unnecessary since Phase 1 handles changelog generation at PR time. The workflow now focuses on automating the release preparation and PR creation steps.

### Phase 3: Enhanced Release Notes (Future)

Extend the release automation to:
1. Generate comprehensive release notes using Gemini
2. Create GitHub release with formatted notes
3. Update documentation automatically

## Technical Details

### Trigger Selection: `pull_request_target` vs `pull_request`

| Aspect | `pull_request` | `pull_request_target` |
|--------|---------------|----------------------|
| Runs in context of | Fork repository | Base repository |
| GITHUB_TOKEN permissions | Read-only for forks | Full (as declared) |
| Access to secrets | No (for forks) | Yes |
| Can post PR comments | No (for forks) | Yes |
| Security risk | Low | Higher (must not run fork code) |

### Fork Detection Logic (via GitHub API)

```javascript
// Safe - uses API metadata, not code checkout
const headRepo = context.payload.pull_request.head.repo.full_name;
const baseRepo = context.payload.pull_request.base.repo.full_name;
const isExternalFork = headRepo !== baseRepo;

// Check changelog existence via API (no checkout needed)
await github.rest.repos.getContent({
  owner: context.payload.pull_request.head.repo.owner.login,
  repo: context.payload.pull_request.head.repo.name,
  path: `.changelog/pr-${prNumber}.txt`,
  ref: context.payload.pull_request.head.sha
});
```

### Comment Template for External Forks

```markdown
📝 **Changelog entry generated:**

\`\`\`
{generated content}
\`\`\`

---

**To add this to your PR**, create `.changelog/pr-{prNumber}.txt`:

\`\`\`bash
cat <<'EOF' > .changelog/pr-{prNumber}.txt
{generated content}
EOF
git add .changelog/ && git commit -m "chore: add changelog entry" && git push
\`\`\`

Or create the file manually with the content above.

> **Note:** This step is required for external contributions. If not added, a maintainer will add it during the release process.
```

## References

- [ADR-005: AI-Powered Changelog Generation](../adr/005-ai-powered-changelog-generation.md)
- [Changelog README](https://github.com/IsmaelMartinez/teams-for-linux/blob/main/.changelog/README.md)
- [Manual Release Process](../manual-release-process.md)
