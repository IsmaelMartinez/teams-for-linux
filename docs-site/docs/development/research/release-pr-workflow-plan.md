# Release PR Workflow - Implementation Plan

**Date:** 2025-11-12
**Status:** Future Enhancement (Not Currently Implemented)
**Approach:** GitHub Action (manual trigger) that creates Release PR

**Note:** Currently using manual process documented in [manual-release-process.md](../manual-release-process.md). This document describes potential future automation.

---

## Overview

Instead of releasing on every merge to main, we:
1. Accumulate PRs with changelog files
2. Manually trigger "Create Release PR" action
3. Review the Release PR
4. Merge Release PR → triggers build & publish

---

## Architecture

### Component 1: Release Preparation Script
**File:** `scripts/create-release-pr.js`

**What it does:**
1. Reads all `.changelog/*.txt` files
2. Prompts for version bump (or takes as argument)
3. Updates package.json, appdata.xml, package-lock.json
4. Returns changes (doesn't commit yet - Action does that)

**Can be run:**
- Locally: `node scripts/create-release-pr.js minor`
- By GitHub Action: Action calls script, commits, pushes, creates PR

---

### Component 2: GitHub Action
**File:** `.github/workflows/create-release-pr.yml`

**Trigger:** `workflow_dispatch` (manual button in GitHub UI)

**Inputs:**
- Version bump type: patch/minor/major (dropdown)
- Optional: custom version number

**What it does:**
1. Runs `create-release-pr.js`
2. Creates branch: `release/v2.7.0`
3. Commits changes
4. Pushes branch
5. Creates PR with:
   - Title: `chore: release v2.7.0`
   - Label: `release`
   - Description: Auto-generated release notes preview
6. Comments on PR with checklist

---

### Component 3: Build Workflow Detection
**File:** `.github/workflows/build.yml` (modified)

**Detection logic:**
```yaml
# Only publish if:
# 1. On main branch
# 2. AND (PR has "release" label OR version changed)
```

**Options:**

**Option A: Detect "release" label**
```yaml
if: |
  github.ref == 'refs/heads/main' &&
  github.event.pull_request.labels.*.name == 'release'
```

**Option B: Detect version change**
```yaml
- name: Check version changed
  id: version
  run: |
    OLD=$(git show HEAD~1:package.json | jq -r .version)
    NEW=$(jq -r .version package.json)
    if [ "$OLD" != "$NEW" ]; then
      echo "changed=true" >> $GITHUB_OUTPUT
    fi

if: steps.version.outputs.changed == 'true'
```

**Recommendation:** Use **Option B (version change)** because:
- More reliable (doesn't depend on labels)
- Works even if label is forgotten
- Clear intent (version changed = release)

---

## Workflow Diagrams

### Full Flow
```
┌─────────────────────────────────────────────────┐
│ PHASE 1: PR Development (Automatic)            │
└─────────────────────────────────────────────────┘

Developer creates PR #123
  ↓
Bot commits .changelog/pr-123.txt to PR branch
  ↓
Merge PR #123 to main
  ↓
Tests run ✅
Build skipped ❌ (no version change)

Developer creates PR #124
  ↓
Bot commits .changelog/pr-124.txt to PR branch
  ↓
Merge PR #124 to main
  ↓
Tests run ✅
Build skipped ❌ (no version change)

Main branch now has:
  .changelog/pr-123.txt
  .changelog/pr-124.txt

┌─────────────────────────────────────────────────┐
│ PHASE 2: Create Release PR (Manual Trigger)    │
└─────────────────────────────────────────────────┘

YOU → GitHub Actions → "Create Release PR" → Run workflow
  ↓
Choose: Version bump = "minor"
  ↓
Action runs:
  1. Runs create-release-pr.js
     - Reads .changelog/pr-123.txt, pr-124.txt
     - Calculates new version: 2.7.0
     - Updates package.json (2.6.14 → 2.7.0)
     - Updates appdata.xml (adds <release> entry)
     - Runs npm install (updates package-lock.json)
     - Deletes .changelog/*.txt files

  2. Creates branch: release/v2.7.0

  3. Commits changes:
     - package.json
     - package-lock.json
     - appdata.xml
     - .changelog/ (deleted files)

  4. Pushes branch to GitHub

  5. Creates PR:
     - Title: "chore: release v2.7.0"
     - Label: "release"
     - Base: main
     - Description:
       ```
       ## Release v2.7.0

       ### Changes
       - Add MQTT integration - by @user (#123)
       - Fix notification behavior - by @user (#124)

       ### Files Modified
       - package.json (2.6.14 → 2.7.0)
       - package-lock.json
       - appdata.xml
       - .changelog/ (2 files deleted)

       ### Checklist
       - [ ] Review changelog entries
       - [ ] Verify version number
       - [ ] Check appdata.xml format

       ### Next Steps
       Merge this PR to trigger:
       - GitHub draft release
       - Snap edge publish
       - All platform builds
       ```

┌─────────────────────────────────────────────────┐
│ PHASE 3: Review Release PR                      │
└─────────────────────────────────────────────────┘

YOU review the PR:
  ✅ Check changelog entries
  ✅ Verify version is correct
  ✅ Can edit files if needed

Optional: Run tests locally
  npm ci
  npm run test:e2e
  npm run lint

┌─────────────────────────────────────────────────┐
│ PHASE 4: Merge Release PR → Publish             │
└─────────────────────────────────────────────────┘

YOU → Merge Release PR to main
  ↓
Build workflow detects:
  - Version changed: 2.6.14 → 2.7.0 ✅
  - On main branch ✅
  ↓
Builds all platforms:
  - Linux x64, arm64, armv7l
  - macOS x64, arm64
  - Windows x64
  ↓
Publishes:
  - GitHub draft release (with release notes)
  - Snap edge channel
  ↓
YOU test Snap edge
  ↓
When ready:
  - Promote GitHub draft → full release
  - Flatpak auto-detects and publishes
  - Manually promote Snap edge → stable
```

---

## File Structure

```
teams-for-linux/
├── .github/
│   └── workflows/
│       ├── changelog-generator.yml        # Existing: Bot adds changelog to PRs
│       ├── create-release-pr.yml          # NEW: Manual trigger to create Release PR
│       └── build.yml                      # MODIFIED: Only build on version change
│
├── scripts/
│   ├── add-changelog.sh                   # Existing: Manual changelog entry
│   ├── release-prepare.js                 # Existing: Will be refactored
│   └── create-release-pr.js               # NEW: Core release logic
│
└── package.json                           # Add new script
```

---

## Implementation Details

### 1. Create Release PR Script

**File:** `scripts/create-release-pr.js`

```javascript
#!/usr/bin/env node

/**
 * Create Release PR
 *
 * Prepares a release by:
 * 1. Reading changelog files
 * 2. Updating version
 * 3. Generating appdata.xml entry
 * 4. Returning changes for GitHub Action to commit
 *
 * Can run standalone or via GitHub Action
 */

const fs = require('node:fs');
const path = require('node:path');
const xml2js = require('xml2js');
const { execSync } = require('node:child_process');

async function createRelease(bumpType) {
  // Read changelog files
  const changelogDir = path.join(process.cwd(), '.changelog');
  const files = fs.readdirSync(changelogDir).filter(f => f.endsWith('.txt'));

  if (files.length === 0) {
    throw new Error('No changelog entries found');
  }

  const entries = files.map(f =>
    fs.readFileSync(path.join(changelogDir, f), 'utf8').trim()
  );

  // Calculate new version
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const [major, minor, patch] = pkg.version.split('.').map(Number);

  let newVersion;
  switch (bumpType) {
    case 'major': newVersion = `${major + 1}.0.0`; break;
    case 'minor': newVersion = `${major}.${minor + 1}.0`; break;
    case 'patch': newVersion = `${major}.${minor}.${patch + 1}`; break;
    default: newVersion = bumpType; // Custom version
  }

  // Update package.json
  pkg.version = newVersion;
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

  // Update appdata.xml (same logic as release-prepare.js)
  // ... (code from release-prepare.js)

  // Run npm install
  const safePath = process.platform === 'win32'
    ? 'C:\\Windows\\System32;C:\\Program Files\\nodejs'
    : '/usr/local/bin:/usr/bin:/bin';
  execSync('npm install', {
    stdio: 'ignore',
    env: { ...process.env, PATH: safePath }
  });

  // Delete changelog files
  files.forEach(f => fs.unlinkSync(path.join(changelogDir, f)));

  // Return metadata for PR description
  return {
    version: newVersion,
    entries,
    filesDeleted: files.length
  };
}

// Export for GitHub Action
module.exports = { createRelease };

// CLI usage
if (require.main === module) {
  const bumpType = process.argv[2] || 'patch';
  createRelease(bumpType)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(err => {
      console.error(err.message);
      process.exit(1);
    });
}
```

---

### 2. GitHub Action

**File:** `.github/workflows/create-release-pr.yml`

```yaml
name: Create Release PR

on:
  workflow_dispatch:
    inputs:
      bump:
        description: 'Version bump type'
        required: true
        type: choice
        options:
          - patch
          - minor
          - major
        default: 'minor'
      custom_version:
        description: 'Custom version (optional, overrides bump type)'
        required: false
        type: string

jobs:
  create-release-pr:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2  # Need history to check version change

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install dependencies
        run: npm ci

      - name: Run release preparation script
        id: prepare
        run: |
          # Use custom version if provided, otherwise use bump type
          VERSION="${{ inputs.custom_version }}"
          if [ -z "$VERSION" ]; then
            VERSION="${{ inputs.bump }}"
          fi

          # Run script and capture output
          RESULT=$(node scripts/create-release-pr.js "$VERSION")

          # Extract version from result
          NEW_VERSION=$(echo "$RESULT" | jq -r '.version')
          echo "version=$NEW_VERSION" >> $GITHUB_OUTPUT

          # Save full result for PR description
          echo "$RESULT" > /tmp/release-info.json

      - name: Create release branch
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

          git checkout -b release/v${{ steps.prepare.outputs.version }}

      - name: Commit changes
        run: |
          git add package.json package-lock.json com.github.IsmaelMartinez.teams_for_linux.appdata.xml .changelog/
          git commit -m "chore: release v${{ steps.prepare.outputs.version }}"
          git push origin release/v${{ steps.prepare.outputs.version }}

      - name: Generate PR description
        id: description
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const releaseInfo = JSON.parse(fs.readFileSync('/tmp/release-info.json', 'utf8'));

            const entries = releaseInfo.entries.map(e => `- ${e}`).join('\n');

            const description = `## Release v${releaseInfo.version}

            ### Changes
            ${entries}

            ### Files Modified
            - \`package.json\` (version bump)
            - \`package-lock.json\` (updated)
            - \`appdata.xml\` (new release entry)
            - \`.changelog/\` (${releaseInfo.filesDeleted} files deleted)

            ### Checklist
            - [ ] Review changelog entries
            - [ ] Verify version number
            - [ ] Check appdata.xml format

            ### Next Steps
            Merging this PR will trigger:
            - ✅ Build all platforms (Linux, macOS, Windows)
            - ✅ Create GitHub draft release
            - ✅ Publish to Snap edge channel

            After merge:
            1. Test Snap edge version
            2. Promote GitHub draft → full release (triggers Flatpak)
            3. Manually promote Snap edge → stable
            `;

            core.setOutput('description', description);

      - name: Create Pull Request
        uses: actions/github-script@v7
        with:
          script: |
            const pr = await github.rest.pulls.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: `chore: release v${{ steps.prepare.outputs.version }}`,
              head: `release/v${{ steps.prepare.outputs.version }}`,
              base: 'main',
              body: `${{ steps.description.outputs.description }}`
            });

            // Add "release" label
            await github.rest.issues.addLabels({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: pr.data.number,
              labels: ['release']
            });

            console.log(`✅ Release PR created: ${pr.data.html_url}`);
            core.summary.addRaw(`🚀 Release PR created: [#${pr.data.number}](${pr.data.html_url})`);
            await core.summary.write();
```

---

### 3. Build Workflow Modification

**File:** `.github/workflows/build.yml` (add version check)

```yaml
jobs:
  check_version:
    runs-on: ubuntu-latest
    outputs:
      version_changed: ${{ steps.check.outputs.changed }}
      new_version: ${{ steps.check.outputs.version }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - name: Check if version changed
        id: check
        run: |
          OLD_VERSION=$(git show HEAD~1:package.json | jq -r '.version')
          NEW_VERSION=$(jq -r '.version' package.json)

          echo "Old version: $OLD_VERSION"
          echo "New version: $NEW_VERSION"

          if [ "$OLD_VERSION" != "$NEW_VERSION" ]; then
            echo "changed=true" >> $GITHUB_OUTPUT
            echo "version=$NEW_VERSION" >> $GITHUB_OUTPUT
            echo "✅ Version changed: $OLD_VERSION → $NEW_VERSION"
          else
            echo "changed=false" >> $GITHUB_OUTPUT
            echo "⏭️  Version unchanged, skipping build"
          fi

  linux_x64:
    needs: check_version
    runs-on: ubuntu-latest
    steps:
      # ... existing steps ...

      - name: Build for Release
        # Only build if version changed AND on main branch
        if: needs.check_version.outputs.version_changed == 'true' && contains(github.ref, 'main')
        run: npm run dist:linux:x64 -- --publish always

      - name: Build for PR
        if: needs.check_version.outputs.version_changed != 'true' || !contains(github.ref, 'main')
        run: npm run dist:linux:x64 -- --publish never
```

---

## Usage Examples

### Creating a Release

**Via GitHub UI:**
```
1. Go to Actions tab
2. Click "Create Release PR"
3. Click "Run workflow"
4. Select branch: main
5. Choose bump type: minor
6. Click "Run workflow"
7. Wait ~2 minutes
8. Review the created PR
9. Merge when ready
```

**Via CLI (local testing):**
```bash
node scripts/create-release-pr.js minor
```

---

## Benefits

| Aspect | Benefit |
|--------|---------|
| **Visibility** | See entire release in one PR |
| **Control** | Manual approval before release |
| **Review** | Can edit before merging |
| **Clean history** | One commit per release |
| **CI efficiency** | Only builds on actual releases |
| **Flexibility** | Can run manually or automate later |

---

## Future Enhancements (Optional)

### 1. Automated Weekly Releases
```yaml
on:
  schedule:
    - cron: '0 10 * * 1'  # Every Monday at 10am
```

### 2. Auto-generate GitHub Release Notes
```yaml
- name: Generate release notes
  run: |
    gh api repos/${{ github.repository }}/releases/generate-notes \
      -f tag_name="v${{ steps.prepare.outputs.version }}" \
      -f target_commitish="main"
```

### 3. Slack/Discord Notifications
```yaml
- name: Notify team
  if: success()
  run: |
    curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
      -d "Release PR v${{ steps.prepare.outputs.version }} created!"
```

---

## Migration Plan

### Phase 1: Setup (Week 1)
1. Create `scripts/create-release-pr.js`
2. Create `.github/workflows/create-release-pr.yml`
3. Test on a feature branch

### Phase 2: Build Detection (Week 1)
1. Modify `.github/workflows/build.yml`
2. Add version change detection
3. Test that builds skip on normal merges

### Phase 3: First Release (Week 2)
1. Accumulate 2-3 PRs with changelog files
2. Trigger "Create Release PR" action
3. Review the generated PR
4. Merge and verify build triggers

### Phase 4: Documentation (Week 2)
1. Update CONTRIBUTING.md
2. Add to CLAUDE.md
3. Create quick reference guide

---

## Rollback Plan

If something goes wrong:
1. Can still use old process (manual version bump + merge)
2. Workflow only triggers on version change (safe)
3. Can disable action via GitHub UI
4. Can revert commits easily

---

## Success Criteria

After 1 month:
- ✅ No accidental releases
- ✅ Clear release history
- ✅ Reduced CI/CD costs (fewer builds)
- ✅ Faster merges (no build wait)
- ✅ Clean git history

---

## Next Steps

1. **Review this plan** - Does the flow make sense?
2. **Approve approach** - Manual action + release PR
3. **Implement** - Create the scripts and workflows
4. **Test** - On a feature branch first
5. **Deploy** - Merge to main and use for next release

Ready to implement?
