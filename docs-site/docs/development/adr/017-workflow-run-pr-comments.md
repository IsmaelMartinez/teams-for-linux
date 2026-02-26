---
id: 017-workflow-run-pr-comments
---

# ADR 017: Use workflow_run for PR Artifact Comments

## Status

Implemented

## Context

The `build.yml` and `snap.yml` GitHub Actions workflows each contained a `comment-artifacts` job that posted build artifact download links as a comment on the associated pull request. This worked for PRs from branches within the same repository, but failed with a 403 "Resource not accessible by integration" error for PRs from forks.

This is a well-documented GitHub Actions security restriction: when a workflow is triggered by a `pull_request` event from a fork, the `GITHUB_TOKEN` is scoped to **read-only** access on the base repository, regardless of what `permissions:` the workflow declares. This prevents fork PRs from modifying the upstream repository (a deliberate security boundary). The `pull-requests: write` permission declared in the workflow is silently downgraded for fork PRs.

The error manifested in PRs [#2218](https://github.com/IsmaelMartinez/teams-for-linux/pull/2218) and [#2220](https://github.com/IsmaelMartinez/teams-for-linux/pull/2220) with:

```text
RequestError [HttpError]: Resource not accessible by integration
  status: 403
  x-accepted-github-permissions: issues=write; pull_requests=write
```

Since this is an open-source project that regularly receives fork PRs, this needed a fix that works for all contributors.

## Decision

Move the PR artifact comment logic out of `build.yml` and `snap.yml` into a dedicated `comment-artifacts.yml` workflow that triggers on the `workflow_run` event.

The `workflow_run` event fires after a referenced workflow completes and **runs in the context of the base repository**, giving it the necessary write permissions to post PR comments regardless of whether the triggering PR came from a fork or a same-repo branch.

**Implementation:**

- `.github/workflows/comment-artifacts.yml` — new workflow with two jobs:
  - `comment-build-artifacts` — triggers when "Build & Release" completes successfully on a PR
  - `comment-snap-artifacts` — triggers when "Snap Build" completes successfully on a PR
- PR number resolution: tries `workflow_run.pull_requests[0].number` first (populated for same-repo PRs), falls back to searching open PRs by `head_sha` (needed for fork PRs where the array may be empty)
- Comment idempotency: searches for an existing bot comment with the matching header before creating a new one, updating in place on re-runs

**Configuration:**

```yaml
on:
  workflow_run:
    workflows: ["Build & Release", "Snap Build"]
    types:
      - completed
```

Each job filters on:

```yaml
if: >
  github.event.workflow_run.event == 'pull_request' &&
  github.event.workflow_run.conclusion == 'success' &&
  github.event.workflow_run.name == '<workflow name>'
```

## Consequences

### Positive

- Fork PRs now receive artifact download comments like same-repo PRs
- No 403 errors on the comment step for any PR source
- Build and snap workflows are simpler (removed ~120 lines each)
- Comment logic is centralized in one file, reducing duplication
- The build workflows themselves need fewer permissions (no `pull-requests: write`)

### Negative

- Comments are posted slightly later (after the `workflow_run` event fires, adding a few seconds of delay)
- The `workflow_run` event requires the workflow file to exist on the **default branch** (main) before it triggers — the new workflow only activates after this change is merged to main
- PR number resolution for fork PRs requires a search through open PRs by SHA, which could theoretically miss a PR if the list exceeds 100 results (unlikely in practice)
- Debugging is slightly harder since the comment workflow is decoupled from the build workflow

### Neutral

- The artifact URLs use the triggering workflow's run ID (`context.payload.workflow_run.id`) instead of `context.runId`, since the comment workflow has its own separate run
- The `workflow_run` event fires once per completed workflow, so build and snap comments are posted independently (same behavior as before)

## Alternatives Considered

### Option 1: Keep inline comment jobs with fork skip

Add `if: github.event.pull_request.head.repo.full_name == github.repository` to skip the comment job for fork PRs entirely.

- Pros: minimal change, no new workflow file
- Cons: fork PRs never get artifact comments, which defeats the purpose
- **Why rejected**: losing artifact comments for external contributors is unacceptable

### Option 2: Use `pull_request_target` trigger

Change the build workflows to trigger on `pull_request_target` instead of `pull_request`, which runs in the base repo context.

- Pros: single workflow, full permissions
- Cons: `pull_request_target` runs the workflow from the **base branch**, not the PR branch, which means it would build the wrong code unless combined with an explicit checkout of the PR head — a well-known security anti-pattern that can allow arbitrary code execution from fork PRs
- **Why rejected**: significant security risk; GitHub explicitly warns against checking out PR code in `pull_request_target` workflows

### Option 3: Use a GitHub App or PAT

Create a GitHub App or use a Personal Access Token with `pull_requests: write` scope, stored as a repository secret.

- Pros: works with inline jobs, no workflow restructuring needed
- Cons: requires managing additional credentials, PATs have broad scopes, GitHub Apps require installation and maintenance
- **Why rejected**: `workflow_run` achieves the same result with zero credential management using only the built-in `GITHUB_TOKEN`

## Related

- Issue: 403 errors on PRs [#2218](https://github.com/IsmaelMartinez/teams-for-linux/pull/2218), [#2220](https://github.com/IsmaelMartinez/teams-for-linux/pull/2220)
- **Implementation**: `.github/workflows/comment-artifacts.yml`
- [GitHub Docs: Triggering a workflow from a workflow](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#workflow_run)
- [GitHub Docs: fork PR permissions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication#permissions-for-the-github_token)
