# Release Automation Research Plan

**Date:** 2025-11-12
**Status:** Research & Planning (No Implementation Yet)
**Goal:** Design a lightweight release automation that bundles PRs and optionally uses AI for changelog generation

---

## Problem Statement

**Current pain point:** Manually writing changelog entries in `appdata.xml` when preparing releases after bundling multiple PRs.

**Desired outcome:**
1. Bundle multiple PRs before releasing
2. Only trigger builds when version changes
3. Optionally use AI/bot to generate changelog from one-line-per-feature input
4. Keep manual option for those who prefer it
5. Draft releases can be overwritten (for testing edge builds)

---

## Research Findings

### 1. Version Change Detection

**Question:** How to detect if package.json version changed and only build then?

**Available GitHub Actions:**

| Action | Description | Key Feature |
|--------|-------------|-------------|
| `EndBug/version-check` | Detects version changes in package.json | Outputs bump type (patch/minor/major), SHA |
| `PostHog/check-package-version` | Compares version between repo and npm | Auto-publishes on version bump |
| `MontyD/package-json-updated-action` | Checks if version updated in latest commit | Simple true/false output |
| `justincy/github-action-npm-release` | Auto-generates release on version change | Creates release + tag automatically |

**Recommended Approach:**
```yaml
# In .github/workflows/build.yml
jobs:
  check_version:
    runs-on: ubuntu-latest
    outputs:
      version_changed: ${{ steps.check.outputs.changed }}
      new_version: ${{ steps.check.outputs.version }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2  # Need 2 commits to compare

      - id: check
        name: Check if version changed
        run: |
          # Compare package.json version between HEAD and HEAD~1
          OLD_VERSION=$(git show HEAD~1:package.json | jq -r '.version')
          NEW_VERSION=$(jq -r '.version' package.json)

          if [ "$OLD_VERSION" != "$NEW_VERSION" ]; then
            echo "changed=true" >> $GITHUB_OUTPUT
            echo "version=$NEW_VERSION" >> $GITHUB_OUTPUT
          else
            echo "changed=false" >> $GITHUB_OUTPUT
          fi

  build:
    needs: check_version
    if: needs.check_version.outputs.version_changed == 'true'
    # ... rest of build
```

**Pros:**
- ✅ Only builds when version actually changes
- ✅ Can merge multiple PRs without triggering builds
- ✅ Simple bash script, no external dependencies

**Cons:**
- ⚠️ Requires fetch-depth: 2 to compare commits
- ⚠️ Won't work on first commit or force-push

---

### 2. Draft Release Overwriting

**Question:** Can electron-builder overwrite existing draft releases with the same version?

**Finding:** There's a known bug (electron-builder #6676) where it creates multiple drafts instead of updating existing ones.

**Workarounds:**

#### Option A: Delete existing draft first
```yaml
- name: Delete existing draft release
  continue-on-error: true
  env:
    GH_TOKEN: ${{ github.token }}
  run: |
    VERSION=$(jq -r '.version' package.json)
    TAG_NAME="v$VERSION"

    # Find draft release with this version using JSON output for robustness
    RELEASE_ID=$(gh release list --json tagName,isDraft,id | jq -r ".[] | select(.tagName == \"$TAG_NAME\" and .isDraft) | .id")

    if [ -n "$RELEASE_ID" ]; then
      gh release delete "$TAG_NAME" --yes
      echo "Deleted existing draft $TAG_NAME"
    fi

- name: Build and publish
  run: npm run dist:linux:x64 -- --publish always
```

#### Option B: Use semantic-release to create release first
```yaml
# semantic-release creates the draft
- name: Create release
  uses: cycjimmy/semantic-release-action@v4

# electron-builder uploads to existing release
- name: Build and upload
  run: npm run dist -- --publish always
```

#### Option C: Manual deletion via GitHub CLI
```bash
# Before running build workflow
gh release delete v2.7.0 --yes
# Then trigger workflow
```

**Recommended:** Option A (auto-delete in workflow) - most seamless.

---

### 3. Changelog File Structure

**Question:** What should the changelog file format look like?

**Design Options:**

#### Option 1: Simple Text Files
```
.changelog/
├── add-mqtt-integration.txt
├── fix-notification-bug.txt
└── add-gpu-debug-window.txt

# Content of add-mqtt-integration.txt:
Add MQTT integration for Teams status publishing
```

**Pros:** Dead simple, easy to create manually or via script
**Cons:** No metadata (type, PR number, etc.)

#### Option 2: YAML with Metadata
```yaml
# .changelog/add-mqtt-integration.yml
type: feature  # or: fix, docs, chore
description: Add MQTT integration for Teams status publishing
pr: 1926
author: Donnyp751
closes: 1791
```

**Pros:** Structured, can auto-link PRs/issues
**Cons:** More complex for contributors

#### Option 3: Markdown with Frontmatter
```markdown
---
type: feature
pr: 1926
---

Add MQTT integration for Teams status publishing

Allows publishing Teams status to MQTT broker for home automation integrations.
```

**Pros:** Human-readable, supports longer descriptions
**Cons:** Overkill for simple entries

**Recommended:** Start with Option 1 (simple text), upgrade to Option 2 if needed.

---

### 4. LLM/Bot Options for Changelog Generation

**Question:** How can we use AI to generate changelog entries from one-line inputs?

**Option A: Claude AI via Official GitHub Action**

```yaml
# .github/workflows/generate-changelog.yml
name: Generate Changelog Entry

on:
  workflow_dispatch:
    inputs:
      features:
        description: 'One feature per line'
        required: true
        type: string

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Generate changelog with Claude
        uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            Given these features (one per line):

            ${{ inputs.features }}

            Generate concise changelog entries suitable for an appdata.xml file.
            Format as bullet points, focusing on user-facing changes.

      - name: Save to file
        run: |
          echo "${{ steps.claude.outputs.response }}" > .changelog/auto-generated.txt

      - name: Create PR
        uses: peter-evans/create-pull-request@v6
        with:
          title: "chore: auto-generated changelog entries"
          body: "Generated by Claude AI from provided feature list"
```

**Pros:**
- ✅ High quality, context-aware generation
- ✅ Official Anthropic support
- ✅ Can understand nuance and write user-friendly text

**Cons:**
- ⚠️ Requires API key + costs money (though cheap)
- ⚠️ External dependency

**Cost:** ~$0.01 per changelog generation (Haiku model)

**Option B: Ollama (Free Local LLM)**

```yaml
# .github/workflows/generate-changelog.yml
name: Generate Changelog with Ollama

on:
  workflow_dispatch:
    inputs:
      features:
        description: 'One feature per line'
        required: true

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Ollama
        uses: ai-action/ollama-action@v1
        with:
          model: 'llama3.2'
          prompt: |
            Given these features, write concise changelog entries:

            ${{ inputs.features }}

            Format as bullet points, focusing on user-facing changes.
            Keep it professional and concise.

      - name: Save output
        run: echo "${{ steps.ollama.outputs.response }}" > .changelog/auto-generated.txt
```

**Pros:**
- ✅ Completely free
- ✅ No API keys needed
- ✅ Runs entirely in GitHub Actions

**Cons:**
- ⚠️ Slower than Claude API
- ⚠️ Lower quality output
- ⚠️ Takes ~2-3 minutes to download model

**Option C: Simple Template-Based (No AI)**

```bash
#!/bin/bash
# scripts/create-changelog-entry.sh

FEATURE=$1
TYPE=${2:-feature}  # feature, fix, docs

case $TYPE in
  feature)
    PREFIX="Feature:"
    ;;
  fix)
    PREFIX="Fix:"
    ;;
  docs)
    PREFIX="Docs:"
    ;;
esac

echo "$PREFIX $FEATURE" > ".changelog/$(date +%s).txt"
```

**Pros:**
- ✅ No dependencies
- ✅ Instant
- ✅ Predictable output

**Cons:**
- ⚠️ No AI assistance
- ⚠️ User must write good descriptions

**Recommended:** Start with Option C (template), add Option A (Claude) if you want AI help, Option B (Ollama) if you want free AI.

---

### 5. Integration Points & Workflow

**Question:** When and how does each piece trigger?

**Proposed Workflow:**

```
┌─────────────────────────────────────────────────────────────┐
│ PHASE 1: PR Development                                     │
└─────────────────────────────────────────────────────────────┘

Developer creates PR #123: "Add MQTT integration"

OPTION A (Manual):
  └─> Developer runs: scripts/add-changelog.sh "Add MQTT integration" feature
      └─> Creates: .changelog/123-mqtt.txt
      └─> Commits to PR

OPTION B (Bot command):
  └─> Developer comments: /changelog feature Add MQTT integration
      └─> Bot creates: .changelog/123-mqtt.txt
      └─> Bot commits to PR

OPTION C (Auto-detect):
  └─> Bot reads PR title/description
      └─> Auto-creates: .changelog/123-mqtt.txt
      └─> Bot commits to PR

┌─────────────────────────────────────────────────────────────┐
│ PHASE 2: Merge to Main (No Build!)                         │
└─────────────────────────────────────────────────────────────┘

PR #123 merged to main
  ├─> .changelog/123-mqtt.txt is now on main
  ├─> package.json version still: 2.6.12
  └─> Build workflow runs but SKIPS (version unchanged)

PR #124 merged to main (fix notifications)
  ├─> .changelog/124-fix-notif.txt is now on main
  ├─> package.json version still: 2.6.12
  └─> Build workflow runs but SKIPS (version unchanged)

PR #125 merged to main (add GPU debug)
  ├─> .changelog/125-gpu.txt is now on main
  ├─> package.json version still: 2.6.12
  └─> Build workflow runs but SKIPS (version unchanged)

Main branch now has:
  .changelog/
  ├── 123-mqtt.txt
  ├── 124-fix-notif.txt
  └── 125-gpu.txt

┌─────────────────────────────────────────────────────────────┐
│ PHASE 3: Prepare Release                                   │
└─────────────────────────────────────────────────────────────┘

Maintainer runs (locally or via bot):
  $ npm run release:prepare

  This script:
    1. Reads all .changelog/*.txt files
    2. Generates changelog text:
       • Add MQTT integration for Teams status publishing
       • Fix: Notification behavior for system tray
       • Feature: Add GPU debug window for diagnostics

    3. Updates appdata.xml with new <release> entry
    4. Deletes .changelog/*.txt files (consumed)
    5. Prompts for version bump: patch/minor/major
    6. Updates package.json version (2.6.12 → 2.7.0)
    7. Runs npm install (updates package-lock.json)

    8. Shows summary:
       ╔══════════════════════════════════════╗
       ║  Ready to Release v2.7.0             ║
       ║                                      ║
       ║  • Add MQTT integration              ║
       ║  • Fix notification behavior         ║
       ║  • Add GPU debug window              ║
       ║                                      ║
       ║  Files changed:                      ║
       ║    - package.json                    ║
       ║    - package-lock.json               ║
       ║    - appdata.xml                     ║
       ║    - .changelog/ (deleted)           ║
       ╚══════════════════════════════════════╝

       Commit these changes? (y/n)

Maintainer reviews and confirms:
  $ git add .
  $ git commit -m "chore: release v2.7.0"
  $ git push origin main

┌─────────────────────────────────────────────────────────────┐
│ PHASE 4: Automatic Build & Publish                         │
└─────────────────────────────────────────────────────────────┘

Push to main detected
  └─> Build workflow runs
      └─> check_version step:
          ├─> OLD: 2.6.12
          ├─> NEW: 2.7.0
          └─> VERSION CHANGED: true ✅

      └─> build job (runs because version changed):
          ├─> Delete existing draft v2.7.0 (if exists)
          ├─> Build Linux x64/arm64/arm
          ├─> Build macOS
          ├─> Build Windows
          ├─> Create GitHub draft release v2.7.0
          └─> Publish to Snap edge channel

Maintainer tests on Snap edge...

When ready:
  └─> Promote GitHub draft → full release
      └─> Flatpak auto-detects and publishes
      └─> Manually promote Snap edge → stable
```

---

### 6. Manual Override & Fallback Mechanisms

**Question:** What if the automation fails or user wants manual control?

**Fallback Plan:**

| Scenario | Fallback |
|----------|----------|
| **No changelog files** | Script prompts: "Enter changelog manually? (y/n)" |
| **AI generation fails** | Falls back to using raw input as-is |
| **User wants manual editing** | Script opens editor before committing |
| **Version detection fails** | Workflow always runs (safe default) |
| **Build fails** | Draft release not created (status quo) |
| **Prefer old workflow** | Can still manually edit appdata.xml (script detects and skips) |

**Emergency Override:**
```bash
# Skip all automation, use current process
SKIP_AUTOMATION=1 npm run release:prepare
# → Just prompts for version, opens editor for appdata.xml
```

---

### 7. Implementation Phases

**Phase 0: Preparation (Research - Current Phase)**
- [x] Research version detection
- [x] Research changelog formats
- [x] Research AI/bot options
- [x] Document workflow
- [ ] Get user approval on approach

**Phase 1: Core Automation (Week 1)**
- [ ] Create `.changelog/` directory structure
- [ ] Create `scripts/release-prepare.js`
  - Reads changelog files
  - Generates appdata.xml entry
  - Prompts for version bump
  - Updates package.json
- [ ] Test manually with sample changelog files

**Phase 2: Workflow Integration (Week 2)**
- [ ] Update `.github/workflows/build.yml`:
  - Add version change detection
  - Skip build if version unchanged
  - Delete existing draft before build
- [ ] Update `.github/workflows/snap.yml` similarly
- [ ] Test on a feature branch

**Phase 3: Helper Scripts (Week 3)**
- [ ] Create `scripts/add-changelog.sh` (simple CLI tool)
- [ ] Add npm script: `npm run changelog:add`
- [ ] Update CONTRIBUTING.md with new process

**Phase 4: Optional AI Integration (Week 4+)**
- [ ] Choose AI option (Claude/Ollama/None)
- [ ] Create `.github/workflows/generate-changelog.yml` (if AI chosen)
- [ ] Add bot command support (if desired)
- [ ] Test AI generation quality

---

## Comparison Matrix

| Feature | Current Process | Proposed (No AI) | Proposed (With AI) |
|---------|----------------|------------------|-------------------|
| **PR workflow** | Nothing extra | Add changelog file | Add changelog file OR use bot |
| **Merge to main** | Build always | Build only on version change | Build only on version change |
| **Changelog writing** | Manual (during release) | Manual (during PR) | AI-generated from one-liners |
| **Version bump** | Manual | Semi-automated (prompts) | Semi-automated (prompts) |
| **appdata.xml** | Manual editing | Auto-generated | Auto-generated |
| **Bundle PRs** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Control** | ✅ Full | ✅ Full | ✅ Full |
| **Build efficiency** | ❌ Every push | ✅ Only on version change | ✅ Only on version change |
| **Changelog quality** | Depends on mood | Consistent | AI-enhanced |

---

## Recommended Approach

**Start Simple, Add Complexity if Needed:**

### Minimal Viable Automation (Recommended First Step)

1. **Changelog files:** Simple `.changelog/*.txt` format
2. **Helper script:** `scripts/add-changelog.sh "description" [type]`
3. **Release script:** `scripts/release-prepare.js` (reads files, generates appdata.xml)
4. **Workflow:** Add version change detection (skip builds)
5. **No AI yet** - Keep it simple

**Estimated effort:** 4-6 hours of development + testing

### Future Enhancements (If You Like It)

1. Add Claude AI integration for better descriptions
2. Add bot commands (`/changelog feature ...`)
3. Auto-detect PR descriptions and create changelog files
4. Scheduled releases (e.g., weekly version bump)

---

## File Structure Preview

```
teams-for-linux/
├── .changelog/                        # NEW: Pending changelog entries
│   ├── README.md                      # How to add entries
│   └── .gitkeep                       # Keep folder in git
│
├── .github/
│   └── workflows/
│       ├── build.yml                  # MODIFIED: Add version detection
│       ├── snap.yml                   # MODIFIED: Add version detection
│       └── generate-changelog.yml     # OPTIONAL: AI generation
│
├── scripts/
│   ├── add-changelog.sh               # NEW: Helper to create changelog files
│   ├── release-prepare.js             # NEW: Main release preparation script
│   └── generate-appdata-from-changelog.js  # NEW: Convert changelog → XML
│
├── package.json                       # Add npm scripts
└── CONTRIBUTING.md                    # Document new workflow
```

---

## Example Usage

### Developer Workflow (No AI)
```bash
# Creating PR with feature
git checkout -b feat/mqtt-integration

# Do the work...

# Add changelog entry
npm run changelog:add
# Prompts:
#   Type? (feature/fix/docs): feature
#   Description: Add MQTT integration for status publishing
# Creates: .changelog/1234-mqtt-integration.txt

git add .changelog/
git commit -m "feat: add MQTT integration"
git push

# Create PR, merge when ready
# → No build triggered (version unchanged)
```

### Maintainer Workflow (Bundle & Release)
```bash
# After merging multiple PRs, ready to release

npm run release:prepare

# Interactive prompts:
#   Found 3 changelog entries:
#     • Add MQTT integration for status publishing
#     • Fix notification behavior in system tray
#     • Add GPU debug window for diagnostics
#
#   Generate appdata.xml entry? (Y/n): y
#   ✅ Generated appdata.xml entry
#
#   Current version: 2.6.12
#   Version bump (patch/minor/major): minor
#   ✅ Updated to 2.7.0
#
#   Files modified:
#     • package.json
#     • package-lock.json
#     • com.github.IsmaelMartinez.teams_for_linux.appdata.xml
#     • .changelog/ (3 files deleted)
#
#   Review changes? (Y/n): y
#   [Opens diff in editor]
#
#   Commit changes? (Y/n): y

# Script commits and pushes
# → Version changed → Build triggered → Snap edge + GitHub draft
```

### Optional: AI-Assisted (With Claude)
```bash
# Quick one-liners, let AI polish them
npm run changelog:generate

# Prompts:
#   Enter features (one per line, empty line to finish):
#     MQTT integration
#     notification fix
#     GPU debug window
#
#   [Calls Claude AI...]
#
#   Generated changelog:
#     • Add MQTT integration for Teams status publishing - enables
#       home automation and status light integrations
#     • Fix: Restore notification behavior in system tray to prevent
#       notifications from getting stuck
#     • Feature: Add GPU debug window accessible from Debug menu for
#       diagnosing graphics acceleration issues
#
#   Save to .changelog/? (Y/n): y
#   ✅ Saved to .changelog/ai-generated-1699999999.txt
```

---

## Questions to Resolve Before Implementation

1. **Changelog file location:** `.changelog/` or `.changelogs/` or `changelogs/`?
2. **File naming:** `<pr-number>-<slug>.txt` or `<timestamp>.txt` or `<author>-<slug>.txt`?
3. **AI option:** Start with none? Add Claude? Add Ollama? Add both?
4. **Automation level:** Helper scripts only? Or add GitHub bot commands?
5. **Version bump:** Interactive prompt? Or infer from changelog types (feat=minor, fix=patch)?
6. **Draft deletion:** Auto-delete existing drafts? Or warn and skip?
7. **Snap edge:** Keep current behavior (always publish)? Or make conditional?

---

## Cost Analysis

### Development Time
- **Minimal (no AI):** 4-6 hours
- **With AI (Claude):** 6-8 hours
- **With bot commands:** 10-12 hours

### Ongoing Costs
- **No AI:** $0
- **Claude API:** ~$0.01 per release (~$0.50/year)
- **Ollama:** $0 (runs in CI for free)

### Time Savings
- **Current:** 5-10 minutes per release (manual editing)
- **With automation:** 1-2 minutes (review generated changelog)
- **Savings:** ~70-80% reduction in release prep time

---

## Next Steps

1. **Review this research plan**
2. **Answer the questions above**
3. **Choose AI option (None/Claude/Ollama)**
4. **Approve the workflow design**
5. **I'll implement the chosen approach**

---

## Decision Log

Date | Decision | Rationale
-----|----------|----------
2025-11-12 | Research lightweight automation | Current manual XML editing tedious with high PR velocity
_TBD_ | Choose changelog file format | _Pending user input_
_TBD_ | Choose AI integration level | _Pending user input_
_TBD_ | Approve workflow design | _Pending user input_

---

**Ready to proceed?** Let me know which options you prefer, and I'll implement the solution!
