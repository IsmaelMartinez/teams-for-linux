# Manual Release Process with Changelog Files

**Status:** Current Process
**Date:** 2025-11-12

---

## Overview

This documents the manual release process using accumulated `.changelog/*.txt` files. The files make it easier to communicate changes to an LLM when preparing releases.

---

## How It Works

### 1. PRs Accumulate Changelog Files

When PRs are merged to main, each includes a `.changelog/pr-XXX.txt` file:

```
main branch:
├── .changelog/
│   ├── pr-123.txt  → "Add MQTT integration - by @user (#123)"
│   ├── pr-124.txt  → "Fix notification behavior - by @user (#124)"
│   └── pr-125.txt  → "Add GPU debug window - by @user (#125)"
├── package.json (version: 2.6.14)
└── appdata.xml (no entry for these changes yet)
```

### 2. Prepare Release Manually

When ready to release, you can either:

**Option A: Use the script**
```bash
npm run release:prepare
```

The script:
1. Reads all `.changelog/*.txt` files
2. Shows you the list
3. Prompts for version bump (patch/minor/major)
4. Updates `package.json`, `package-lock.json`, `appdata.xml`
5. Deletes consumed `.changelog/*.txt` files
6. Shows you what to commit

**Option B: Ask an LLM to help**
```
You: "I want to prepare release v2.7.0. Here are the changelog files:
     - .changelog/pr-123.txt
     - .changelog/pr-124.txt
     - .changelog/pr-125.txt

     Please update package.json to 2.7.0 and generate the appdata.xml entry."

LLM: Reads the files, updates versions, generates XML
```

### 3. Review & Commit

```bash
# Review changes
git diff

# Commit
git add .
git commit -m "chore: release v2.7.0"
git push origin main
```

### 4. Build & Publish

The build workflow detects the version change and:
- Builds all platforms
- Creates GitHub draft release
- Publishes to Snap edge

Then you:
- Test Snap edge version
- Promote GitHub draft → full release (triggers Flatpak)
- Manually promote Snap edge → stable

---

## Benefits of Changelog Files

### For You
- **No memory burden** - Changes documented when PR is fresh
- **Easy to review** - Just read the text files
- **Flexible** - Can edit files before releasing
- **LLM-friendly** - Easy to point LLM at the files

### For LLMs
- **Context in files** - Don't need to remember conversations
- **Simple format** - Plain text, one line per file
- **Clear intent** - Each file is a discrete change
- **Easy to process** - Read files → generate XML

---

## Manual Steps (Detailed)

### Step 1: Check What's Ready to Release

```bash
ls .changelog/
# Shows: pr-123.txt  pr-124.txt  pr-125.txt

cat .changelog/*
# Shows all entries
```

### Step 2: Update Version

Edit `package.json`:
```json
{
  "version": "2.7.0"  // Was 2.6.14
}
```

Run npm install:
```bash
npm install  // Updates package-lock.json
```

### Step 3: Update appdata.xml

Add new release entry at the top of `<releases>`:

```xml
<release version="2.7.0" date="2025-11-12">
  <description>
    <ul>
      <li>Add MQTT integration - by @user (#123)</li>
      <li>Fix notification behavior - by @user (#124)</li>
      <li>Add GPU debug window - by @user (#125)</li>
    </ul>
  </description>
</release>
```

**Tip:** You can ask an LLM to generate this from the `.changelog/*.txt` files

### Step 4: Delete Changelog Files

```bash
rm .changelog/*.txt
```

### Step 5: Commit & Push

```bash
git add .
git commit -m "chore: release v2.7.0"
git push origin main
```

---

## Working with LLMs

### Asking LLM to Prepare Release

**Good prompts:**

```
"Prepare release v2.7.0. Read all files in .changelog/ directory and:
1. Update package.json version to 2.7.0
2. Generate appdata.xml entry with all changes
3. Delete the changelog files"
```

```
"I have 3 changelog files in .changelog/. Create the XML entry for
appdata.xml release v2.7.0 using those files."
```

**What the LLM will do:**
1. Read `.changelog/*.txt` files
2. Generate properly formatted XML
3. Show you the changes to review

### Advantages

- **Consistent format** - LLM knows the structure
- **Quick iteration** - Easy to ask for changes
- **Less error-prone** - LLM handles XML formatting
- **Automated** - But you still control when

---

## File Structure

```
teams-for-linux/
├── .changelog/              # Staging area for release notes
│   ├── pr-123.txt          # "Add MQTT integration..."
│   ├── pr-124.txt          # "Fix notification behavior..."
│   └── pr-125.txt          # "Add GPU debug window..."
│
├── .github/
│   └── workflows/
│       ├── changelog-generator.yml  # Auto-adds changelog to PRs
│       └── build.yml               # Builds on version change
│
├── scripts/
│   ├── add-changelog.sh            # Manual: add changelog entry
│   ├── release-prepare.js          # Optional: automated preparation
│   └── generateReleaseInfo.js      # Existing: validation
│
├── package.json                     # Version number
└── appdata.xml                      # Release notes
```

---

## Current Workflow (Summary)

```
┌──────────────────────────────────────┐
│ 1. Develop & Merge PRs              │
│    - Bot adds .changelog/pr-XXX.txt │
│    - Files accumulate on main       │
└──────────────────────────────────────┘
              ↓
┌──────────────────────────────────────┐
│ 2. Ready to Release                 │
│    - Review .changelog/*.txt files  │
│    - Decide on version number       │
└──────────────────────────────────────┘
              ↓
┌──────────────────────────────────────┐
│ 3. Prepare (Choose One)             │
│    A. Run: npm run release:prepare  │
│    B. Ask LLM to help               │
│    C. Edit files manually           │
└──────────────────────────────────────┘
              ↓
┌──────────────────────────────────────┐
│ 4. Review & Commit                  │
│    - git diff (check changes)       │
│    - git commit & push              │
└──────────────────────────────────────┘
              ↓
┌──────────────────────────────────────┐
│ 5. Build Automatically              │
│    - GitHub draft release           │
│    - Snap edge publish              │
└──────────────────────────────────────┘
              ↓
┌──────────────────────────────────────┐
│ 6. Promote When Ready               │
│    - Test Snap edge                 │
│    - Promote draft → release        │
│    - Snap edge → stable             │
└──────────────────────────────────────┘
```

---

## Tips

### Adding Changelog Manually

If bot doesn't run or you want manual control:

```bash
npm run changelog:add "Your feature description"
# Creates: .changelog/manual-TIMESTAMP.txt
```

### Editing Changelog Entries

Just edit the `.txt` files directly:

```bash
vim .changelog/pr-123.txt
# Change the text as needed
```

### Skipping Entries

Delete files you don't want in the release:

```bash
rm .changelog/pr-internal-refactor.txt
```

### Checking What Changed

```bash
git log --oneline --since="2 weeks ago"
# Shows recent commits

ls .changelog/
# Shows pending changelog entries
```

---

## Example LLM Conversation

**You:**
```
I want to create release v2.7.0. Please:
1. Read all .changelog/*.txt files
2. Update package.json version to 2.7.0
3. Generate the appdata.xml <release> entry
4. Delete the changelog files after using them
```

**LLM Response:**
```
I'll prepare release v2.7.0:

Found 3 changelog entries:
- Add MQTT integration - by @user (#123)
- Fix notification behavior - by @user (#124)
- Add GPU debug window - by @user (#125)

Updated files:
- package.json: 2.6.14 → 2.7.0
- appdata.xml: Added release entry
- Deleted 3 changelog files

Ready to commit!
```

---

## Advantages of This Approach

| Aspect | Benefit |
|--------|---------|
| **Simplicity** | No complex automation, just files |
| **Flexibility** | Use script, LLM, or manual |
| **Control** | You decide when to release |
| **LLM-friendly** | Easy context for AI assistance |
| **Reviewable** | See changes before committing |
| **Low overhead** | One file per PR, that's it |

---

## Future Automation (Optional)

If you want to automate later:
- GitHub Action to create Release PR
- Scheduled releases (weekly/monthly)
- Auto-generate from commit messages

But for now, manual is fine and gives you full control.

---

## Quick Reference

**View pending changes:**
```bash
ls .changelog/ && cat .changelog/*
```

**Prepare release (scripted):**
```bash
npm run release:prepare
```

**Prepare release (manual):**
1. Edit package.json version
2. Run npm install
3. Update appdata.xml
4. Delete .changelog/*.txt
5. Commit & push

**Prepare release (with LLM):**
1. Point LLM at .changelog/ directory
2. Ask it to generate release
3. Review & commit

That's it!
