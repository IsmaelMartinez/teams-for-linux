---
id: 023-release-automation-tooling
---

# ADR 023: Release Automation Tooling

## Status

✅ Implemented

## Context

Teams for Linux releases used to be a manual sequence: bump the version in `package.json`, draft a changelog from staged `.changelog/pr-XXX.txt` files, run `npm run release:prepare` locally, update `appdata.xml` by hand for the Linux software centres, tag, and create the GitHub Release. That is six or seven steps that a solo maintainer has to remember and perform in order, every time, with no safety net if a step is skipped or done out of sequence.

A survey of project management and release automation tooling (see § References) evaluated the options available to a solo-maintainer open source project that already enforces conventional-commit discipline. The evaluation criterion was whether a tool reduces real, felt pain without adding more overhead than it removes. The survey covered release automation (release-please, release-it, semantic-release, changesets), AI agent memory (Beads), and issue tracking boards (GitHub Projects v2, ZenHub, Linear, Plane). It concluded that release automation was the single highest-leverage area, and that the other categories either solved problems this project does not have or had not yet reached their adoption trigger.

The survey document still carries the line "Status: Research complete. No implementation decision made." That statement is now out of date. A decision was made and shipped, and this ADR records it.

## Decision

Adopt release-please as the project's release automation mechanism, driven by conventional commits and gated on the maintainer merging an auto-generated Release PR. The custom changelog staging approach it replaced (per-PR `.changelog/*.txt` files with AI-generated summaries, recorded in ADR 005) has been removed.

### Architecture

The mechanism lives in `.github/workflows/release-please.yml` and fires on every push to `main`. The workflow runs `googleapis/release-please-action` v5 (pinned by commit SHA) against `release-please-config.json` and `.release-please-manifest.json`, the latter of which tracks the current version as the single source of truth.

On each run, release-please reads the conventional commits that have landed since the last release and opens or updates a single Release PR titled `chore(main): release X.Y.Z`. That PR carries the semantic version bump in `package.json` and a `CHANGELOG.md` regenerated from the commit subjects, categorised into the ten sections declared in `release-please-config.json` (Features from `feat:`, Bug Fixes from `fix:`, then Performance, Security, Dependencies, Code Improvements, Documentation, CI/CD, Testing and Maintenance). The bump type follows the commit prefix: `feat:` bumps the minor digit, `fix:` bumps the patch digit, and `feat!:` or a `BREAKING CHANGE:` footer bumps the major digit.

Three supplementary steps in the same workflow run whenever a Release PR exists, checking out the PR head branch and pushing follow-up commits to it. `scripts/update-appdata-xml.js` inserts a new `<release>` entry into `com.github.IsmaelMartinez.teams_for_linux.appdata.xml` from the new version and the fresh changelog entries, which closes the one gap release-please does not cover natively and keeps Flatpak and AppStream metadata in sync. `npm install --package-lock-only --ignore-scripts` refreshes `package-lock.json` to match the bumped version. `scripts/append-contributors.mjs` appends contributor credits to both the changelog and the PR body.

Merging the Release PR is the release trigger and the only manual action required. On merge, release-please tags the commit and creates the GitHub Release, which `release-please-config.json` sets to `"draft": true`, and the build workflow produces the artefacts. Because a draft release 404s for anyone without write access and has no Git tag until it is published, a further workflow step edits release-please's own "Created releases" bot comment to annotate it with a draft-status warning. The maintainer then promotes the draft to a full release, which in turn triggers Flatpak and publishes the Snap candidate channel, leaving the candidate to stable promotion as a deliberate manual step.

### Rationale

The Release PR model is what made release-please the right fit rather than merely an adequate one. It splits the release into a mechanical half and a judgement half, automating the version arithmetic and changelog aggregation while leaving the maintainer in full control of when a release actually happens. That control is not incidental for this project. The release cadence documented in `manual-release-process.md` deliberately batches non-critical work into meaningful releases and fast-tracks only security fixes and regressions, so the ability to sit on an open Release PR until the right moment is a feature, not friction.

Contributors needed no behaviour change at all. The project already required conventional commits, so release-please had a well-formed commit history to work from on day one.

The one real gap, `appdata.xml`, was known in advance and was closed exactly as the research anticipated, with a small supplementary Action step rather than a fork or a plugin. Everything else in the pipeline (build, artefact publishing, Snap and Flatpak promotion) was left untouched, so adopting release-please did not require rearchitecting the release infrastructure around it.

## Alternatives Considered

### release-it

release-it is a local-script alternative offering interactive prompts, custom lifecycle hooks, and a plugin ecosystem, with `@release-it/conventional-changelog` able to replace the bespoke `generateReleaseNotes.mjs` categorisation logic. Its strength is flexibility, since every stage of the release can be customised or overridden. Its weakness relative to release-please is that it is a local command that must be run manually on a developer machine, which provides less automation than a GitHub Action that fires automatically on every merge to main. The two are mutually exclusive, and the project's goal here was maximum automation rather than local-script control.

Rejected: it is a local command that must be run manually on a developer machine, providing less automation than a GitHub Action that fires on every merge to main.

### Beads (`@beads/bd`)

Beads is a git-backed AI agent memory system using a Dolt-powered SQL backend with dependency-aware task graphs and JSON-optimised output. It is not a human project management tool and does not compete with release-please on function; it appeared in the same survey because both were candidates for reducing maintainer friction. Its value is letting an AI coding agent persist task state and dependency relationships across context window resets during multi-session autonomous work. The survey judged it mature enough to evaluate seriously and worth bookmarking, but placed its adoption trigger at the moment multi-session autonomous Claude Code workflows become a regular pattern.

Rejected: the adoption trigger (multi-session autonomous Claude Code workflows being common enough that context loss between sessions is a felt pain point) has not arrived yet. Bookmarked for revisiting.

### semantic-release

semantic-release releases fully unattended, so every merge to main containing a `feat:` or `fix:` commit ships immediately with no Release PR to review. That suits multi-maintainer projects with a continuous deployment culture.

Rejected: it removes timing control that the maintainer actually wants to keep, such as batching several small fixes into one release or delaying a release until a significant feature lands.

### changesets

changesets targets monorepos with multiple independently-versioned packages.

Rejected: this is a single-package repository, so changesets is not relevant here.

## Consequences

### Positive

The release is now a single action. The maintainer reviews an always-current Release PR and merges it, and the version bump, changelog, `appdata.xml` entry, lock file refresh, contributor credits, tag and GitHub Release all follow automatically. Six or seven manual steps collapsed into one, and the steps that remain (promoting the draft release, promoting Snap candidate to stable) are the ones that genuinely need human judgement.

The changelog is derived directly from commit messages, so it is always consistent with what actually shipped and always up to date, refreshing on every new commit to main rather than being assembled at release time. Contributors needed zero behaviour change because conventional commits were already required.

Removing the bespoke pipeline deleted a meaningful amount of maintained code: `prepare-release.yml`, `changelog-generator.yml`, `release-prepare.mjs`, `generateReleaseNotes.mjs`, and the `.changelog/*.txt` staging convention. Standard, widely adopted tooling now carries that weight instead.

### Negative

Commit message prefixes are now load-bearing in a way they were not before. A `feat:` prefix chosen carelessly bumps the minor digit, so prefix selection has become a release decision rather than a stylistic one. The earlier informal versioning convention, where the leading digit was frozen and the middle digit was reserved for Electron major upgrades or broad behavioural shifts, had to be retired in favour of standard semantic versioning as release-please enforces it.

The project has taken on custom glue in the release-please workflow: three supplementary steps plus a bot-comment annotation step, all of which are project-maintained code coupled to release-please's action outputs and comment format.

### Known limitations

- No native `appdata.xml` support. This was the gap the research flagged, and it is covered by `scripts/update-appdata-xml.js` running as a workflow step rather than by anything release-please provides. If release-please changes how it exposes the Release PR branch, that step needs revisiting.
- Releases are created as drafts (`"draft": true`), and release-please's "Created releases" comment then links to a release that 404s for anyone without write access, with no Git tag existing until it is published. release-please does not allow that comment to be changed, so the workflow patches it after the fact with a find-and-edit step.
- The changelog quality is bounded by commit message quality. Categorisation is mechanical, so a poorly worded commit subject becomes a poorly worded changelog line with no editorial pass in between, though the changelog can still be hand-edited in the Release PR before merging.
- The release-please action is pinned by commit SHA, which is correct for supply-chain safety but means version bumps are a deliberate maintenance task rather than something that happens automatically.

## References

- Release-please workflow: `.github/workflows/release-please.yml`
- Release-please configuration: `release-please-config.json` and `.release-please-manifest.json`
- Appdata patch script: `scripts/update-appdata-xml.js`
- Release process documentation: `docs-site/docs/development/manual-release-process.md`
- [release-please upstream](https://github.com/googleapis/release-please)
- [Conventional Commits specification](https://www.conventionalcommits.org/)
- Superseded ADR: [ADR 005: AI-Powered Changelog Generation](./005-ai-powered-changelog-generation.md), the per-PR changelog staging approach that release-please replaced
- Research history: see git history for `docs-site/docs/development/research/project-management-tools-research.md`
