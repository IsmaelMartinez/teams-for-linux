# Release Process

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
- Create a release branch
- Commit all changes
- Create a pull request

You'll get a PR ready for review and merging. No local setup required.

### Option B: Using the Script Locally

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
- Show next steps

Then create release PR:
```bash
git checkout -b release/vX.Y.Z
git add .
git commit -m "chore: release vX.Y.Z"
git push -u origin release/vX.Y.Z
gh pr create --title "Release vX.Y.Z" --body "Release vX.Y.Z"
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

## After PR Merge

When the release PR merges to main:
- Build workflow detects version change
- Creates GitHub draft release
- Publishes to Snap edge channel

Then:
1. Test Snap edge version
2. Promote GitHub draft → full release (triggers Flatpak)
3. Manually promote Snap edge → stable

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
```

Each file contains one line:
```
Add MQTT integration - by @username (#123)
```

## Workflow Diagram

```
PRs merged → .changelog/*.txt accumulate
     ↓
Ready to release → Review changelog files
     ↓
Prepare release → Update versions & appdata.xml
     ↓
Create release PR → Push to release/vX.Y.Z
     ↓
Merge to main → Build triggers automatically
     ↓
Publish → Draft release, Snap edge
     ↓
Promote → Full release, Snap stable
```

## Tips

**Edit changelog entries:** Just edit the `.txt` files before running `release:prepare`

**Skip entries:** Delete any `.changelog/*.txt` file you don't want in the release

**Check pending changes:**
```bash
ls .changelog/ && cat .changelog/*
```

**See recent commits:**
```bash
git log --oneline --since="2 weeks ago"
```

## Benefits

- **Decouple merge from release** - Merge freely, release when ready
- **Bundle multiple PRs** - Accumulate changes before releasing
- **LLM-friendly** - Plain text files, easy for AI to read
- **Always editable** - Can review and modify before releasing
- **Full control** - You decide when to ship

## Related Documentation

- [ADR 005: AI-Powered Changelog Generation](adr/005-ai-powered-changelog-generation.md)
- [Release Info Generation](release-info.md) - Technical details of release info script
