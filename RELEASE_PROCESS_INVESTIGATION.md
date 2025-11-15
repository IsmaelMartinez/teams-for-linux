# Release Process Investigation & Recommendations

**Date:** 2025-11-12
**Status:** Proposal
**Author:** Claude (AI Analysis)

## Executive Summary

The current release process forces one release per merge to main, making it unsuitable for the high-velocity AI-assisted development workflow. This investigation recommends implementing a **Changesets-based workflow with manual release triggers** to decouple merging from releasing while maintaining automated changelog generation.

---

## Current Release Process Analysis

### How It Works Today

1. Developer manually updates `package.json` version
2. Developer manually edits `com.github.IsmaelMartinez.teams_for_linux.appdata.xml` to add release notes
3. `npm run generate-release-info` validates version consistency across files
4. Merge to `main` triggers **immediate automatic release**:
   - GitHub Release (draft) via electron-builder
   - Snap Store publish (`--publish always`)
   - Builds for all platforms (Linux x64/arm64/arm, macOS, Windows)

### Pain Points

| Issue | Impact | Root Cause |
|-------|--------|------------|
| **One release per merge** | Can't accumulate changes | `--publish always` + merge trigger |
| **No ship control** | Can't decide when to release | Automatic on every merge |
| **Manual XML editing** | Error-prone, tedious | No automated changelog |
| **High release volume** | Too many releases with AI PRs | Tight coupling |
| **Version bump overhead** | Extra step for every PR | Manual process |

### Key Files Involved

- `package.json` - Version number
- `package-lock.json` - Must match package.json
- `com.github.IsmaelMartinez.teams_for_linux.appdata.xml` - Release notes
- `.github/workflows/build.yml` - Main release workflow
- `.github/workflows/snap.yml` - Snap publishing
- `scripts/generateReleaseInfo.js` - Validation script

---

## Comparison: betis-escocia Project

The betis-escocia project uses a **continuous deployment model** for a web application:

- **No versioned releases** - It's a Next.js web app deployed to Vercel
- **Auto-deploy on merge** - Every merge to main deploys to production
- **No changelog** - Deployment history tracked via commits/PRs
- **Not applicable** - Different deployment model (web vs. Electron distribution)

**Key Insight:** The web app model doesn't translate to Electron apps that need:
- Versioned releases (SemVer)
- Distribution packages (AppImage, deb, rpm, snap, dmg, exe)
- Changelog management for users
- Controlled release cadence

---

## Recommended Solutions

### Option 1: Release-Please (Automated, Commit-Based)

**How it works:**
- Analyzes git commits using Conventional Commits (e.g., `feat:`, `fix:`)
- Automatically creates/updates a "Release PR" with version bump + changelog
- Merge the Release PR when ready to ship → triggers release workflow
- Release workflow then publishes to GitHub/Snap/etc.

**Workflow:**
```
1. Developer merges PR to main (no release)
2. Release-Please bot updates "Release PR" automatically
3. Multiple PRs accumulate in the Release PR
4. Maintainer reviews and merges Release PR → RELEASE!
5. GitHub Action publishes to all platforms
```

**Pros:**
- ✅ Fully automated changelog generation
- ✅ Decouples merge from release
- ✅ Clear "release intent" (merge the Release PR)
- ✅ Works with electron-builder
- ✅ Industry standard (used by Google, many OSS projects)

**Cons:**
- ⚠️ Requires commit message discipline (Conventional Commits)
- ⚠️ AI tools may need prompting for correct commit formats
- ⚠️ Less explicit than changesets (relies on commit parsing)

**Implementation Effort:** Low (1-2 hours)

---

### Option 2: Changesets (Explicit, File-Based)

**How it works:**
- Developers add `.changeset/*.md` files describing changes
- Run `npx changeset version` to consume changesets → version bump + CHANGELOG
- Commit the version bump, then merge to main
- Separate manual workflow trigger to publish

**Workflow:**
```
1. Developer creates PR + adds changeset file
2. Merge PR to main (no release)
3. Multiple PRs with changesets accumulate on main
4. Maintainer runs: npx changeset version
5. Reviews version bump + CHANGELOG updates
6. Commits and pushes
7. Manually triggers release workflow → RELEASE!
```

**Pros:**
- ✅ Explicit intent (changeset file = "this should be in next release")
- ✅ Great for bundling multiple PRs
- ✅ Clear, human-readable changelog entries
- ✅ Industry standard (pnpm, Radix UI, many monorepos)
- ✅ Works independently of commit messages

**Cons:**
- ⚠️ Extra step: remembering to add changeset
- ⚠️ Designed for NPM packages (needs adaptation for Electron)
- ⚠️ Slightly more manual than Release-Please

**Implementation Effort:** Medium (3-4 hours)

---

### Option 3: Hybrid - Changesets + Manual Release Trigger (RECOMMENDED)

**How it works:**
- Combine changesets for changelog management
- Use `workflow_dispatch` for manual release control
- Decouple all three stages: merge → version → publish

**Workflow:**
```
1. Developer creates PR with changeset file (.changeset/awesome-feature.md)
2. Merge PR to main (no version bump, no release)
3. Repeat for multiple PRs (accumulate changesets)
4. When ready to release:
   a. Maintainer runs: npx changeset version (local or CI)
   b. Reviews CHANGELOG.md and package.json changes
   c. Commits version bump to main
   d. Manually triggers "Publish Release" workflow (GitHub UI button)
5. Workflow publishes to GitHub, Snap, Flatpak, etc.
```

**Detailed Steps:**

#### Step 1: Developer Adds Changeset (in PR)
```bash
npx changeset add
# Prompts:
# - What kind of change? (patch/minor/major)
# - Summary: "Add MQTT integration for status updates"
# Creates: .changeset/fuzzy-dogs-jump.md
```

#### Step 2: Merge PRs (No Release)
- Multiple PRs can merge to main
- Each carries a changeset file
- No automatic version bumps
- No automatic releases

#### Step 3: Maintainer Prepares Release
```bash
# Run locally or via CI on a release branch
npx changeset version

# This:
# - Deletes consumed changeset files
# - Updates package.json version
# - Generates CHANGELOG.md entries
# - Updates appdata.xml (custom script)

# Review changes, commit, push
git add .
git commit -m "chore: release v2.7.0"
git push origin main
```

#### Step 4: Trigger Release Workflow
- Go to GitHub Actions → "Publish Release" workflow
- Click "Run workflow"
- Select branch: main
- Workflow builds and publishes all platforms

**Pros:**
- ✅ Full control over when to release
- ✅ Bundle unlimited PRs into one release
- ✅ Explicit changelog entries (changeset files)
- ✅ Automated changelog generation
- ✅ No accidental releases
- ✅ Works well with AI workflows
- ✅ Clear separation: merge ≠ version ≠ publish

**Cons:**
- ⚠️ Requires discipline to add changeset files
- ⚠️ Need custom script to sync appdata.xml
- ⚠️ Slightly more complex workflow

**Implementation Effort:** Medium-High (4-6 hours)

---

### Option 4: Simple Manual Trigger (Minimal Change)

**How it works:**
- Keep current manual version bump process
- Remove `--publish always` from workflows
- Add `workflow_dispatch` trigger to release workflow
- Manually trigger releases when ready

**Workflow:**
```
1. Developer merges PR to main (no release)
2. Multiple PRs accumulate
3. Maintainer manually:
   a. Updates package.json version
   b. Edits appdata.xml with changelog
   c. Commits version bump
   d. Triggers release workflow
```

**Pros:**
- ✅ Minimal code changes
- ✅ Familiar process
- ✅ Full control

**Cons:**
- ⚠️ Still manual changelog editing
- ⚠️ No automation improvements
- ⚠️ Doesn't scale well with AI velocity

**Implementation Effort:** Very Low (30 minutes)

---

## Recommended Approach: Hybrid (Option 3)

### Why This Is Best

1. **Solves the core problem** - Decouples merge from release
2. **Scales with AI** - Can accumulate dozens of PRs before release
3. **Maintains quality** - Automated changelog prevents errors
4. **Provides control** - Maintainer decides exactly when to ship
5. **Industry proven** - Changesets used by major projects
6. **Future-proof** - Easy to add automation later (auto-version on schedule)

### Migration Path

#### Phase 1: Setup (Week 1)
1. Install changesets: `npm install -D @changesets/cli`
2. Initialize: `npx changeset init`
3. Configure `.changeset/config.json` for teams-for-linux
4. Create custom script: `scripts/updateAppdataFromChangelog.js`
5. Update workflows to use `workflow_dispatch` instead of auto-publish

#### Phase 2: Testing (Week 2)
1. Create test PRs with changesets
2. Merge to a test branch
3. Run `changeset version` to verify output
4. Test manual release trigger
5. Validate all platforms build correctly

#### Phase 3: Documentation (Week 3)
1. Update CONTRIBUTING.md with changeset workflow
2. Add changeset template examples
3. Create release checklist for maintainers
4. Document emergency release process

#### Phase 4: Rollout (Week 4)
1. Merge changes to main
2. Announce new workflow to contributors
3. Monitor first few releases
4. Gather feedback and iterate

---

## Technical Implementation Details

### File Structure Changes

```
teams-for-linux/
├── .changeset/
│   ├── config.json                    # Changeset configuration
│   ├── README.md                      # How to add changesets
│   └── fuzzy-dogs-jump.md            # Example changeset file
├── .github/
│   └── workflows/
│       ├── build.yml                  # MODIFIED: Remove auto-publish
│       ├── snap.yml                   # MODIFIED: Remove auto-publish
│       └── release-manual.yml         # NEW: Manual release trigger
├── scripts/
│   ├── generateReleaseInfo.js        # KEEP: Validation
│   ├── updateAppdataFromChangelog.js # NEW: Sync appdata.xml
│   └── changesetVersion.js           # NEW: Wrapper for changeset version
├── CHANGELOG.md                       # NEW: Auto-generated
├── package.json                       # MODIFIED: Add changeset scripts
└── com.github.IsmaelMartinez...xml   # MODIFIED: Updated by script
```

### Workflow Configuration

#### .changeset/config.json
```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

#### .github/workflows/release-manual.yml (New)
```yaml
name: Manual Release

on:
  workflow_dispatch:
    inputs:
      dry_run:
        description: 'Dry run (no publish)'
        required: false
        default: false
        type: boolean

env:
  GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install dependencies
        run: npm ci

      - name: Validate release info
        run: npm run generate-release-info

      - name: Build all platforms
        if: ${{ !inputs.dry_run }}
        run: npm run dist -- --publish always
```

#### scripts/updateAppdataFromChangelog.js (New)
```javascript
#!/usr/bin/env node

/**
 * Syncs CHANGELOG.md entries to appdata.xml
 * Runs after `changeset version` to keep XML in sync
 */

const fs = require('node:fs');
const path = require('node:path');
const xml2js = require('xml2js');

async function updateAppdata() {
  // Read package.json for version
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const version = pkg.version;

  // Parse CHANGELOG.md
  const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
  const versionMatch = changelog.match(
    new RegExp(`## ${version.replace(/\./g, '\\.')}\s+([\s\S]*?)(?=##|$)`)
  );

  if (!versionMatch) {
    throw new Error(`No changelog entry found for version ${version}`);
  }

  // Extract bullet points
  const changes = versionMatch[1]
    .split('\n')
    .filter(line => line.trim().startsWith('-'))
    .map(line => line.trim().substring(2).trim());

  // Read appdata.xml
  const appdataPath = 'com.github.IsmaelMartinez.teams_for_linux.appdata.xml';
  const appdataXml = fs.readFileSync(appdataPath, 'utf8');

  // Parse XML
  const parser = new xml2js.Parser();
  const appdata = await parser.parseStringPromise(appdataXml);

  // Add or update release entry
  const releases = appdata.component.releases[0].release || [];
  const existingIndex = releases.findIndex(r => r.$.version === version);

  const newRelease = {
    $: {
      version: version,
      date: new Date().toISOString().split('T')[0]
    },
    description: [{
      ul: [{
        li: changes
      }]
    }]
  };

  if (existingIndex >= 0) {
    releases[existingIndex] = newRelease;
  } else {
    releases.unshift(newRelease);
  }

  appdata.component.releases[0].release = releases;

  // Build XML
  const builder = new xml2js.Builder();
  const updatedXml = builder.buildObject(appdata);

  // Write back
  fs.writeFileSync(appdataPath, updatedXml);

  console.log(`✅ Updated appdata.xml with version ${version}`);
}

updateAppdata().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
```

#### package.json scripts (Add)
```json
{
  "scripts": {
    "changeset": "changeset",
    "changeset:add": "changeset add",
    "version": "changeset version && node scripts/updateAppdataFromChangelog.js",
    "release:prepare": "npm run version && npm run generate-release-info",
    "release:dry-run": "npm run dist -- --publish never"
  }
}
```

### Changeset Example

#### .changeset/add-mqtt-integration.md
```markdown
---
"teams-for-linux": minor
---

Add MQTT integration for Teams status publishing

This feature allows teams-for-linux to publish your Teams status (Available, Busy, In a meeting, etc.) to an MQTT broker, enabling home automation integrations and status lights.

Implemented by @Donnyp751 (closes #1791)
```

---

## Release Workflow Comparison

| Stage | Current Process | Recommended Process |
|-------|----------------|---------------------|
| **PR Created** | Update version manually | Add changeset file |
| **PR Merged** | → Automatic release! 🚀 | → No action |
| **Multiple PRs** | ❌ Not possible | ✅ Accumulate changesets |
| **Ready to Release** | N/A (already released) | Run `npm run release:prepare` |
| **Version Update** | Manual edit | Automated from changesets |
| **Changelog** | Manual XML edit | Automated (CHANGELOG.md → appdata.xml) |
| **Publish** | Automatic on merge | Manual workflow trigger |
| **Control** | ❌ None | ✅ Full control |

---

## Migration Checklist

- [ ] Install changesets: `npm install -D @changesets/cli`
- [ ] Initialize changesets: `npx changeset init`
- [ ] Create `scripts/updateAppdataFromChangelog.js`
- [ ] Update `.github/workflows/build.yml` (remove `--publish always`)
- [ ] Update `.github/workflows/snap.yml` (remove `--publish always`)
- [ ] Create `.github/workflows/release-manual.yml`
- [ ] Update `package.json` with changeset scripts
- [ ] Create `.changeset/README.md` with instructions
- [ ] Update `CONTRIBUTING.md` with new workflow
- [ ] Test on a feature branch
- [ ] Create first release with new process
- [ ] Document learnings

---

## Alternative: Quick Win (Option 4)

If you want immediate relief without the full changeset setup:

### Minimal Changes
1. Modify `.github/workflows/build.yml`:
   ```yaml
   - name: Release
     if: contains(github.ref, 'main') && contains(github.event.head_commit.message, '[release]')
     run: npm run dist:linux:x64 -- --publish always
   ```

2. Add manual trigger:
   ```yaml
   on:
     push:
       branches: [main]
     workflow_dispatch:  # Add this
   ```

3. Release process:
   - Merge multiple PRs to main (no release)
   - When ready: create a commit with `[release]` in message
   - Or: manually trigger workflow from GitHub UI

**Result:** Decouples merge from release in 15 minutes, but keeps manual changelog editing.

---

## Recommendations Summary

1. **Immediate (This Week):** Implement Option 4 (quick win) to get immediate relief
2. **Short-term (Next Month):** Migrate to Option 3 (Changesets + Manual Trigger)
3. **Long-term (Future):** Consider automation triggers (e.g., release every 2 weeks)

The changeset approach will scale beautifully with AI-assisted development and give you the control you need over the release cadence.

---

## Questions & Answers

**Q: What if I forget to add a changeset?**
A: Add a CI check that fails PRs without changesets (with override flag for docs-only changes).

**Q: Can I still do emergency releases?**
A: Yes! The manual trigger allows immediate releases at any time.

**Q: How do I handle breaking changes?**
A: Changesets support major version bumps. Run `changeset add` and select "major".

**Q: What about the Snap Store?**
A: Same workflow - manual trigger publishes everywhere simultaneously.

**Q: Can I automate version bumps on a schedule?**
A: Yes! Add a weekly cron trigger that runs `changeset version` automatically.

---

## Next Steps

1. Review this document and choose an approach
2. Schedule implementation time
3. Test on a feature branch
4. Migrate main branch
5. Update contributor documentation
6. Monitor first few releases
7. Iterate based on feedback

Let me know which option you'd like to implement, and I can create the necessary files and workflows!
