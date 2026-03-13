# Project Management Tools Research

**Date:** 2026-03-13
**Status:** Research complete. No implementation decision made.
**Scope:** Evaluate project management and release automation tooling appropriate for a solo-maintainer OSS project with an established conventional-commit workflow.

## Context

As the project's release process and development workflow mature, it is worth reviewing whether any external tooling would reduce friction, improve visibility, or automate repetitive steps. This document evaluates several categories: AI agent memory systems, automated release management, and issue/task tracking boards.

The evaluation criterion throughout is whether a tool reduces real, felt pain for a solo maintainer without adding more overhead than it removes.

## AI Agent Memory: Beads (`@beads/bd`)

Beads is Steve Yegge's git-backed AI agent memory system (approximately 18,700 GitHub stars at time of writing, current version 0.59.0). It uses a Dolt-powered SQL backend with dependency-aware task graphs, hash-based IDs, and JSON-optimised output designed for AI coding agent workflows. A `--stealth` mode exists for local-only operation without committing to the repository. Community extensions include `beads-kanban-ui`, `beads-visualizer`, and `Beadspace`. Installation is via `npm install -g @beads/bd`.

It is important to understand what Beads is not: it is not a human project management tool. It is structured, queryable memory for AI agents doing multi-session autonomous work. Its value proposition is specifically that an AI coding agent can persist task state, dependency relationships, and progress across context window resets, enabling long-running autonomous workflows without losing continuity.

For this project, the right adoption trigger is when multi-session autonomous Claude Code workflows become common enough that context loss between sessions is a felt pain point. That moment has not arrived yet. Bookmark, revisit later.

## Release Automation

### release-please (Google)

release-please is a GitHub Action that maintains an auto-updating Release PR derived from conventional commits. When commits following the Conventional Commits specification land on the main branch, release-please automatically opens or updates a PR that contains the bumped version and a generated `CHANGELOG.md`. Merging that PR triggers the actual release.

The project already enforces conventional-commit discipline, meaning contributors would need zero behaviour change for release-please to work. The Release PR model directly implements the "measured releases" principle — the maintainer retains full control over timing by choosing when to merge the release PR, while the mechanical work of version bumping and changelog aggregation is automated.

The one gap is `appdata.xml`, which Linux software centres consume and which the project currently updates during release preparation. release-please has no built-in awareness of this file. A small supplementary Action step that patches `appdata.xml` using the release version and the same changelog content would close this gap.

Overall, release-please is the single highest-leverage change available to the release workflow. It replaces six or seven manual steps (version bump, changelog draft, tag, release creation) with a single "merge the Release PR" action.

### release-it

release-it is a local-script alternative to release-please. It provides interactive prompts, custom lifecycle hooks, and a plugin ecosystem. The `@release-it/conventional-changelog` plugin would replace the bespoke `generateReleaseNotes.mjs` categorisation logic with a standard `CHANGELOG.md` generation approach.

release-it's strength is flexibility: every stage of the release process can be customised or overridden. Its weakness relative to release-please is that it is a local command — it must be run manually on a developer machine, providing less automation than a GitHub Action that fires automatically on every merge to main.

If the preference is to keep local-script control over the release process rather than delegating it to a GitHub Action, release-it is the better fit. If the goal is maximum automation, release-please wins.

### semantic-release

semantic-release is the most powerful and most opinionated option in this space. It is designed for fully automated, unattended releases — every merge to main that contains a feat or fix commit triggers a release automatically without any human step. There is no "Release PR" to review; the release simply happens.

This level of automation is appropriate for projects with multiple maintainers and a culture of continuous deployment. For a solo-maintainer project where timing control matters (e.g., batching several small fixes into one release, or delaying a release until a significant feature lands), semantic-release is overkill. The control it removes is control the maintainer actually wants to keep.

### changesets

changesets is designed for monorepos with multiple independently-versioned packages. This project is a single-package repository. changesets is not relevant here.

## Issue and Task Tracking

### GitHub Projects v2

GitHub Projects v2 is free, requires no installation, and can be configured as a passive automated view of GitHub Issues using built-in workflow automations (auto-add issues, auto-archive closed items). For a solo maintainer, it is acceptable as a visual board that mirrors the state of GitHub Issues without requiring active maintenance.

The existing `roadmap.md` already serves the strategic planning function, so GitHub Projects v2 would be purely supplementary — useful if a visual Kanban view is wanted, unnecessary if the markdown roadmap is sufficient.

### ZenHub, Linear, Plane

All three tools are designed for multi-person sprint coordination: sprint planning, velocity tracking, cross-team visibility, and similar concerns. None of these problems exist at solo-maintainer scale. The overhead cost of adopting any of them exceeds the benefit immediately and permanently for a project of this size and team composition. None are recommended.

## Recommendations

release-please is the single highest-leverage change available. It automates the most repetitive parts of the release process while preserving the maintainer's control over timing. The only additional work is a small Action step to handle `appdata.xml`. This is worth implementing.

Beads is worth bookmarking. The adoption trigger is the moment multi-session autonomous Claude Code workflows become a regular pattern. That moment has not arrived, but the tool is mature enough to evaluate seriously when it does.

GitHub Projects v2 is optional and passive. Set it up if a visual board is useful; skip it if the markdown roadmap is sufficient.

release-it is a reasonable alternative to release-please if local-script control is preferred over GitHub Actions automation. The two are mutually exclusive — pick one.

semantic-release, changesets, ZenHub, Linear, and Plane are all not recommended for this project.

## Related

- `docs-site/docs/development/plan/roadmap.md` — current development roadmap
- `docs-site/docs/development/manual-release-process.md` — current release workflow
- ADR-005 — AI-powered changelog generation
