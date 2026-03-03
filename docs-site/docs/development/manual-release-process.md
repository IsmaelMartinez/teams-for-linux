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

PRs automatically get AI-generated changelog entries in `.changelog/pr-XXX.txt` files. When ready to release, bundle these changelogs into a version update.

## Quick Start

### Option A: Automated GitHub Workflow (Recommended)

The easiest and most reliable method is to use the automated GitHub Actions workflow:

1. Go to [Actions → Prepare Release](https://github.com/IsmaelMartinez/teams-for-linux/actions/workflows/prepare-release.yml)
2. Click "Run workflow"
3. Select the version bump type:
   - `patch` - Bug fixes (2.6.19 → 2.6.20)
   - `minor` - New features (2.6.19 → 2.7.0)
   - `major` - Breaking changes (2.6.19 → 3.0.0)
   - Or enter a specific version like `2.7.0`
4. Click "Run workflow"

The workflow will automatically:
- Validate changelog entries exist
- Run the release preparation script
- Generate categorized release notes
- Create a release branch
- Commit all changes
- Create a pull request with detailed release notes

You'll get a PR ready for review and merging. No local setup required.

### Option B: Using the Script Locally

**Preview what will happen (dry-run mode):**
```bash
npm run release:prepare -- patch --dry-run
```

This shows you exactly what will change without modifying any files.

**Apply the changes:**
```bash
npm run release:prepare patch  # or minor, major, or 2.6.15
```

Or without argument to be prompted:
```bash
npm run release:prepare
```

This will:
- Review changelog entries
- Update package.json, package-lock.json, appdata.xml
- Delete consumed changelog files
- Show categorized release notes preview
- Show next steps

Then create release PR:
```bash
git checkout -b release/vX.Y.Z
git add .
git commit -m "chore: release vX.Y.Z"
git push -u origin release/vX.Y.Z
gh pr create --title "Release vX.Y.Z" --body-file <(npm run generate-release-notes X.Y.Z)
```

### Option C: Manual

1. Review changelog files:
   ```bash
   ls .changelog/
   cat .changelog/*
   ```

2. Update version:
   ```bash
   # Edit package.json: "version": "X.Y.Z"
   npm install  # Updates package-lock.json
   ```

3. Update appdata.xml:
   ```xml
   <release version="X.Y.Z" date="YYYY-MM-DD">
     <description>
       <ul>
         <li>Entry from pr-123.txt</li>
         <li>Entry from pr-124.txt</li>
       </ul>
     </description>
   </release>
   ```

4. Delete changelog files:
   ```bash
   rm .changelog/*.txt
   ```

5. Create release PR:
   ```bash
   git checkout -b release/vX.Y.Z
   git add .
   git commit -m "chore: release vX.Y.Z"
   git push -u origin release/vX.Y.Z
   gh pr create --title "Release vX.Y.Z" --body "Release vX.Y.Z"
   ```

### Option D: LLM-Assisted

Point an LLM at `.changelog/` and ask it to prepare the release:

```
"Prepare release vX.Y.Z:
1. Read .changelog/*.txt files
2. Update package.json version
3. Generate appdata.xml entry
4. Delete changelog files
Show me the changes."
```

Then create release PR as above.

## Enhanced Release Notes

The release process automatically generates enhanced release notes that include:

### Categorization

Changes are automatically categorized based on conventional commit prefixes:
- 🚀 **New Features** - `feat:` prefix or "add", "implement" keywords
- 🐛 **Bug Fixes** - `fix:` prefix or "fix" keyword
- 📚 **Documentation** - `docs:` prefix
- 📦 **Dependencies** - "upgrade", "bump" keywords
- ♻️ **Code Improvements** - `refactor:` prefix
- ⚡ **Performance** - `perf:` prefix
- 🔒 **Security** - `security:` prefix
- 🔧 **Maintenance** - Other changes

### Auto-Detected Documentation Links

The system automatically detects and links to relevant documentation:

- **Electron updates**: When a changelog entry mentions Electron version changes, links to Electron release notes are included
- **Configuration changes**: When entries reference configuration options from `docs/configuration.md`, links to the relevant configuration sections are added

### Generate Release Notes Independently

You can generate release notes without running the full release:

```bash
# Full format with all categories and links
npm run generate-release-notes

# With specific version
npm run generate-release-notes -- 2.8.0

# Summary format (shorter)
npm run generate-release-notes -- --summary

# JSON format (for programmatic use)
npm run generate-release-notes -- --json
```

## Dry-Run Mode

Before making any changes, you can preview what will happen:

```bash
npm run release:prepare -- patch --dry-run
```

Or with short flag:
```bash
npm run release:prepare -- patch -n
```

Dry-run mode shows:
- Files that would be updated
- Version changes (old → new)
- Changelog files that would be deleted
- Full release notes preview

No files are modified during dry-run.

## After PR Merge

When the release PR merges to main:
- Build workflow detects version change
- Creates GitHub draft release
- Snap edge channel publishes with a version suffix (e.g., `2.7.5-edge.g1a2b3c4`) to distinguish it from the release build

Then:
1. Promote GitHub draft → full release
   - This triggers Flatpak
   - This triggers the **Snap Release** workflow, which builds and publishes the release version to the **candidate** channel
2. Test the Snap candidate version
3. Manually promote Snap candidate → stable: `snapcraft release teams-for-linux <revision> stable`

:::info Snap Channels
- **edge** — Every push to main. Versioned with commit SHA suffix (e.g., `2.7.5-edge.g1a2b3c4`)
- **candidate** — Automatically published when a GitHub Release is published. Uses the clean release version (e.g., `2.7.5`)
- **stable** — Manual promotion from candidate after testing
:::

## Manual Changelog Entries

If you need to add an entry manually:

```bash
echo "Your description - by @username (#PR)" > .changelog/manual-$(date +%s).txt
```

Or just create a `.txt` file in `.changelog/` with any text editor.

## File Structure

```
.changelog/              # Staging area
├── pr-123.txt          # Auto-generated
├── pr-124.txt          # Auto-generated
└── manual-*.txt        # Manual entries

scripts/
├── release-prepare.mjs       # Main release script
└── generateReleaseNotes.mjs  # Release notes generator
```

Each changelog file contains one line:
```
Add MQTT integration - by @username (#123)
```

## Workflow Diagram

```
PRs merged → .changelog/*.txt accumulate
     ↓
Ready to release → Preview with --dry-run
     ↓
Prepare release → Update versions & appdata.xml
     ↓
Create release PR → Push to release/vX.Y.Z
     ↓                (PR includes categorized release notes)
Merge to main → Build triggers automatically
     ↓
Publish → Draft release, Snap edge (with commit SHA suffix)
     ↓
Promote draft → Full release, Snap candidate, Flatpak
     ↓
Test candidate → Promote Snap candidate → stable
```

## Tips

**Preview before releasing:**
```bash
npm run release:prepare -- patch --dry-run
```

**Edit changelog entries:** Just edit the `.txt` files before running `release:prepare`

**Skip entries:** Delete any `.changelog/*.txt` file you don't want in the release

**Check pending changes:**
```bash
ls .changelog/ && cat .changelog/*
```

**Preview release notes:**
```bash
npm run generate-release-notes
```

**See recent commits:**
```bash
git log --oneline --since="2 weeks ago"
```

## Benefits

- **Decouple merge from release** - Merge freely, release when ready
- **Bundle multiple PRs** - Accumulate changes before releasing
- **Preview before committing** - Dry-run mode shows all changes
- **Auto-categorized notes** - Changes grouped by type automatically
- **Smart documentation links** - Electron and config changes link to docs
- **LLM-friendly** - Plain text files, easy for AI to read
- **Always editable** - Can review and modify before releasing
- **Full control** - You decide when to ship

## Related Documentation

- [ADR 005: AI-Powered Changelog Generation](adr/005-ai-powered-changelog-generation.md)
- [Release Info Generation](release-info.md) - Technical details of release info script
