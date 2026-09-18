# Release Process

## Release Cadence

Teams for Linux does not follow a fixed release schedule. Instead, releases are driven by what has changed and how urgent those changes are. The general approach is to batch changes into meaningful releases while keeping users safe from security issues and regressions.

### What triggers a release

Releases fall into a few broad categories, roughly ordered by urgency:

**Immediate releases** happen for runtime security vulnerabilities in dependencies and regressions that break core functionality (calls, login, screen sharing). These go out as soon as the fix is verified because the cost of waiting outweighs the noise of an extra update.

**Batched releases** are the normal pattern. Feature work, non-critical bug fixes, and build-time dependency updates accumulate until there is a meaningful set of changes worth shipping. This is typically weekly to bi-weekly, though the interval varies depending on what is in flight.

**Pre-releases** are occasionally published to test significant changes (Electron upgrades, Wayland fixes) before promoting to stable. These are tagged as pre-release on GitHub and only reach snap edge subscribers automatically.

### Periods of higher frequency

There are times when releases come faster than usual. This typically happens when hunting platform-specific bugs (such as chrome/wayland compatibility issues) where a fix for one configuration can break another, requiring rapid iteration. The npm ecosystem also generates security advisories frequently; runtime-affecting ones ship immediately while build-time-only ones get batched.

### Distribution channels and update frequency

Not all installation methods receive updates at the same pace. If frequent updates are a concern, choosing a slower channel can help:

| Channel | Update frequency | Notes |
|---------|-----------------|-------|
| Flatpak (Flathub) | Slowest | Only updated after the release has reached 100% across all other channels |
| Snap stable | Slow | Manual promotion after testing on candidate |
| Snap candidate | On GitHub Release publish | Automatic, good for early adopters |
| deb/rpm repositories | On GitHub Release publish | Gets every release promptly |
| AppImage | On GitHub Release publish | Supports in-app auto-update |
| Snap edge | Every push to main | Development channel, not for general use |

Users who find updates too frequent can switch to Flatpak or Snap stable for a more measured experience, or simply adjust their OS update-check interval (for example, from daily to weekly).

### The soft promise

The project aims to balance shipping fixes quickly with respecting users' time. Security and regressions will always be fast-tracked, but feature work and non-critical improvements will be batched together rather than shipped individually. The goal is meaningful releases, not frequent ones.

## Overview

This project uses [release-please](https://github.com/googleapis/release-please) for automated release management. Release-please monitors conventional commits on the `main` branch and automatically maintains a Release PR with version bumps and a generated `CHANGELOG.md`.

### How it works

1. Contributors merge PRs with [conventional commit](https://www.conventionalcommits.org/) messages
2. release-please automatically creates (or updates) a Release PR that includes:
   - Version bump in `package.json`
   - Updated `CHANGELOG.md` with categorised entries
   - Updated `appdata.xml` with a new release entry (via a custom workflow step)
   - Updated `package-lock.json`
3. When the maintainer is ready to release, they merge the Release PR
4. On merge, the build workflow creates a draft GitHub Release with artifacts
5. The maintainer promotes the draft to a full release

### Conventional commit format

Release-please determines the version bump type from commit prefixes:

| Prefix | Bump | Example |
|--------|------|---------|
| `feat:` | minor | `feat: add MQTT integration` |
| `fix:` | patch | `fix: resolve login redirect loop` |
| `feat!:` or `BREAKING CHANGE:` | major | `feat!: drop Node 18 support` |
| `chore:`, `docs:`, `ci:`, etc. | patch (if included) | `chore: update dependencies` |

### Versioning convention

Going forward the project follows standard [semantic versioning](https://semver.org/) as enforced by release-please. A `feat:` commit bumps the minor digit, a `fix:` bumps the patch digit, and a breaking change bumps the major digit. The earlier informal convention, where the leading digit was treated as frozen and the middle digit was reserved for Electron major upgrades or broad behavioural shifts (see [the v2.9.0 Wayland rationale](./plan/roadmap.md)), is retired. Pick conventional commit prefixes intentionally, since they now directly determine the version bump.

## Quick Start

### Releasing (merge the Release PR)

1. Go to the [Pull Requests](https://github.com/IsmaelMartinez/teams-for-linux/pulls) page
2. Find the auto-generated Release PR (titled like "chore(main): release X.Y.Z")
3. Review the changelog and version bump
4. Merge the PR
5. The build workflow triggers automatically and creates a draft GitHub Release
6. Promote the draft to a full release when ready

That's it. No scripts to run, no manual version bumping.

### Customising before release

If you need to adjust the release before merging:

- **Edit the changelog**: Modify `CHANGELOG.md` directly in the Release PR
- **Override the version**: Edit `package.json` in the Release PR (release-please will respect manual overrides)
- **Add entries**: Additional conventional commits to `main` will automatically update the Release PR

## After PR Merge

When the Release PR merges to main:
- Build workflow detects version change
- Creates GitHub draft release with artifacts
- Snap edge channel publishes with a version suffix (e.g., `2.7.5-edge.g1a2b3c4`) to distinguish it from the release build

Then:
1. Publish the GitHub draft as a pre-release: `gh release edit vX.Y.Z --draft=false --prerelease`
   - This triggers the **Snap Release** workflow, which builds and publishes the release version to the **candidate** channel
   - This triggers the **Flatpak Smoke Build**, which builds the Flathub manifest against the released deb
   - This triggers the **Flathub Beta Bump**, which opens a version-bump PR against the packaging repo's `beta` branch. It only does so for a pre-release, so keep the flag on until step 5
2. Merge the [Flathub beta bump PR](#flathub-beta-branch) once flathubbot's test build passes, so Flatpak users can test the pre-release from `flathub-beta`
3. Test the Snap candidate version
4. Manually promote Snap candidate → stable: `snapcraft release teams-for-linux <revision> stable`
5. Clear the pre-release flag once the release has soaked: `gh release edit vX.Y.Z --prerelease=false`

:::warning Flathub stable does not move until the pre-release flag is cleared
The Flathub `master` manifest tracks `releases/latest`, and that endpoint skips pre-releases. So a release left flagged as a pre-release only ever reaches `flathub-beta` (step 2), never Flatpak stable users, no matter how long it sits. Step 5 is what moves both the `latest` pointer and Flathub stable, and it is easy to forget because nothing fails or warns when it is skipped.
:::

:::info Snap Channels
- **edge** — Every push to main. Versioned with commit SHA suffix (e.g., `2.7.5-edge.g1a2b3c4`)
- **candidate** — Automatically published when a GitHub Release is published. Uses the clean release version (e.g., `2.7.5`)
- **stable** — Manual promotion from candidate after testing
:::

### Flathub beta branch

The Flathub packaging repo has a `beta` branch that Flathub builds into the `flathub-beta` remote, which is how Flatpak users test a pre-release before it reaches stable. Flathub's hosted update checker only runs against a repo's default branch (`master`), so it never opens an update PR for `beta`; the `x-checker-data` queries on that branch describe what it should track, but nothing executes them.

The bump itself is automated. The **Flathub Beta Bump** workflow (`.github/workflows/flathub-beta-bump.yml`) runs when a release is published, exits early unless it is a pre-release, takes the two deb checksums from the release asset digests and computes the metainfo checksum from the file at the tag, rewrites the three sources in the `beta` manifest, pushes a `bump-beta-<version>` branch to `flathub/com.github.IsmaelMartinez.teams_for_linux` and opens a `chore: bump beta to <version>` PR against `beta`. The push needs the `FLATHUB_TOKEN` repository secret; without it the workflow still computes the bump and writes the diff to the job summary so it can be applied by hand.

Merging that PR is left to the maintainer on purpose: Flathub's own `builds/x86_64` runs on PRs into `beta` and is the first real build of the manifest, so wait for flathubbot's "Test build succeeded" comment before merging. The merge is what publishes to `flathub-beta`.

If the run was missed or needs repeating, dispatch it by hand with the tag: `gh workflow run flathub-beta-bump.yml -f tag=vX.Y.Z`. Re-running against a version the manifest already points at is a no-op.

Keep `beta` otherwise in sync with `master`, since the only intended difference is the version it points at plus any packaging change deliberately under test.

## Changelog Categories

Changes in `CHANGELOG.md` are automatically categorised based on conventional commit prefixes:

- **Features** — `feat:` prefix
- **Bug Fixes** — `fix:` prefix
- **Performance** — `perf:` prefix
- **Security** — `security:` prefix
- **Dependencies** — `deps:` prefix
- **Code Improvements** — `refactor:` prefix
- **Documentation** — `docs:` prefix
- **CI/CD** — `ci:` prefix
- **Testing** — `test:` prefix
- **Maintenance** — `chore:` prefix

## Configuration

Release-please is configured via two files in the repository root:

- **`release-please-config.json`** — Release type, changelog sections, and behaviour
- **`.release-please-manifest.json`** — Tracks the current version

The GitHub Actions workflow is at `.github/workflows/release-please.yml`.

### appdata.xml updates

Release-please does not natively support `appdata.xml`. A custom script (`scripts/update-appdata-xml.js`) runs as part of the release-please workflow to:
1. Read the new version from `package.json`
2. Extract changelog entries from `CHANGELOG.md`
3. Insert a new `<release>` entry into `appdata.xml`

This ensures `appdata.xml` stays in sync with each release, which is required for Flatpak/AppStream compatibility and the electron-builder release info generation.

## Workflow Diagram

```text
Conventional commits land on main
     ↓
release-please creates/updates Release PR
     ↓                (includes version bump, CHANGELOG.md, appdata.xml)
Maintainer merges Release PR
     ↓
Build triggers automatically
     ↓
Publish → Draft release, Snap edge (with commit SHA suffix)
     ↓
Publish draft as pre-release → Snap candidate, Flatpak smoke build, Flathub beta bump PR
     ↓
Merge beta bump PR once flathubbot builds → flathub-beta
     ↓
Test candidate → Promote Snap candidate → stable
```

## Migration from Previous Process

The project previously used a custom changelog staging approach with `.changelog/pr-XXX.txt` files and AI-generated summaries. This has been replaced by release-please, which derives changelog entries directly from conventional commit messages.

### What was removed

- `.github/workflows/prepare-release.yml` — Manual release preparation workflow
- `.github/workflows/changelog-generator.yml` — AI-powered per-PR changelog generation
- `scripts/release-prepare.mjs` — Local release preparation script
- `scripts/generateReleaseNotes.mjs` — Custom release notes categorisation
- `npm run release:prepare` — Replaced by merging the Release PR
- `npm run generate-release-notes` — Replaced by `CHANGELOG.md`
- `.changelog/*.txt` staging files — No longer needed

### What was kept

- `scripts/generateReleaseInfo.js` — Still used by electron-builder at build time
- `scripts/generateDebianChangelog.js` — Still used for Debian package metadata
- `scripts/afterpack.js` — Still used as electron-builder post-build hook
- `appdata.xml` — Still maintained (now via automated script)

## Tips

**Check pending changes for the next release:**
Look at the open Release PR to see what will be included.

**Force a specific version:**
Edit `package.json` in the Release PR branch to set a specific version.

**Skip a commit from the changelog:**
Use a commit message without a conventional commit prefix, or use the `chore:` prefix (included in Maintenance category).

## Benefits

- **Zero manual steps** — No scripts to run, no version bumping, no changelog staging
- **Conventional commits** — Contributors already follow this convention, so no behaviour change
- **Auto-categorised changelog** — Changes grouped by type in `CHANGELOG.md`
- **Always up to date** — Release PR updates automatically with each new commit
- **Full control** — Maintainer decides when to merge and release
- **Standard tooling** — release-please is widely adopted and well-maintained

## Related Documentation

- [release-please documentation](https://github.com/googleapis/release-please)
- [Conventional Commits specification](https://www.conventionalcommits.org/)
- [Release Info Generation](release-info.md) — Technical details of release info script
