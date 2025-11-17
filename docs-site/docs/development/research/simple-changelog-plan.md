# Simple Changelog Automation - Implementation Plan

**Date:** 2025-11-12
**Status:** In Progress - Testing Phase
**Approach:** Start simple, automate later

---

## Overview

Simple workflow using `.changelog/*.txt` files to track changes:
1. Bot adds changelog files to PRs (automated)
2. Files accumulate on main as PRs merge
3. Manual release preparation (you or LLM-assisted)
4. Version change triggers build

**Focus:** Get the basic flow working first, script/automate later if needed.

---

## The Simple Flow

```
┌─────────────────────────────────────┐
│ 1. PR Created                       │
│    - Bot runs on PR open            │
│    - Gemini generates summary       │
│    - Creates .changelog/pr-XXX.txt  │
│    - Commits to PR branch           │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 2. PR Merged to Main                │
│    - .changelog/pr-XXX.txt on main  │
│    - Tests run                      │
│    - NO build (version unchanged)   │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 3. Multiple PRs Merge               │
│    - .changelog/ directory fills up │
│    - Each PR = one text file        │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 4. Manual Release Prep              │
│    Option A: npm run release:prepare│
│    Option B: Ask LLM to help        │
│    Option C: Edit files manually    │
│                                     │
│    Result:                          │
│    - package.json updated           │
│    - appdata.xml updated            │
│    - .changelog/*.txt deleted       │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 5. Commit & Push                    │
│    - git commit -m "release v2.7.0" │
│    - git push origin main           │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ 6. Build Triggers (Version Changed) │
│    - GitHub draft release           │
│    - Snap edge publish              │
│    - All platforms built            │
└─────────────────────────────────────┘
```

---

## Components Implemented

### ✅ Completed

1. **Changelog Generator Workflow** (`.github/workflows/changelog-generator.yml`)
   - Triggers: PR opened/updated
   - Calls Gemini API
   - Creates `.changelog/pr-XXX.txt` on PR branch
   - Security: No script injection, uses github-script

2. **Release Preparation Script** (`scripts/release-prepare.js`)
   - Reads `.changelog/*.txt` files
   - Interactive prompts
   - Updates package.json, appdata.xml
   - Deletes consumed files
   - Security: Safe PATH, isolated environment

3. **Manual Helper** (`scripts/add-changelog.sh`)
   - For manual changelog entries
   - Simple text file creation

4. **Documentation** (`.changelog/README.md` and `docs-site/docs/development/manual-release-process.md`)
   - Explains workflow
   - Shows manual steps
   - LLM-friendly guide

5. **Package Scripts** (`package.json`)
   - `npm run changelog:add`
   - `npm run release:prepare`

### 🔄 To Test

1. **Spike 1:** Test changelog generator on real PR
2. **Spike 2:** Test manual release preparation
3. **Spike 3:** Verify build doesn't trigger on normal merge
4. **Spike 4:** Verify build triggers on version change

---

## Validation Spikes

### Spike 1: Changelog Generator Works ⚠️ CRITICAL

**Goal:** Verify bot can add changelog to PR

**Prerequisites:**
- Add `GEMINI_API_KEY` to GitHub Secrets

**Test Steps:**
1. Create a test PR on this branch
2. Verify workflow runs automatically
3. Check if `.changelog/pr-XXX.txt` is created
4. Review the generated summary quality
5. Verify file is committed to PR branch

**Success Criteria:**
- ✅ Workflow runs without errors
- ✅ Gemini generates reasonable summary
- ✅ File created in `.changelog/` directory
- ✅ Committed by github-actions[bot]
- ✅ No security issues

**If it fails:**
- Check Gemini API key is set
- Review workflow logs
- Verify permissions (contents: write, pull-requests: write)
- Check for script injection issues

**Estimated Time:** 15 minutes

---

### Spike 2: Manual Release Preparation Works

**Goal:** Verify release script can consume changelog files

**Test Steps:**
1. Create 2-3 fake changelog files:
   ```bash
   mkdir -p .changelog
   echo "Test feature one (#100)" > .changelog/pr-100.txt
   echo "Test feature two (#101)" > .changelog/pr-101.txt
   ```
2. Run: `npm run release:prepare`
3. Choose version: patch (test version)
4. Verify outputs:
   - package.json updated
   - appdata.xml has new entry
   - .changelog files deleted

**Success Criteria:**
- ✅ Script reads files correctly
- ✅ Interactive prompts work
- ✅ All files updated properly
- ✅ Changelog files deleted
- ✅ XML format valid

**Rollback:**
```bash
git checkout package.json package-lock.json appdata.xml
rm -rf .changelog/*.txt
```

**Estimated Time:** 10 minutes

---

### Spike 3: Normal Merges Don't Trigger Builds

**Goal:** Verify builds skip when version unchanged

**Test Steps:**
1. Merge a PR with changelog file
2. Check GitHub Actions logs
3. Verify tests run but build skips

**Current Status:** ⚠️ Not implemented yet

**Note:** Currently ALL merges to main trigger builds. Need to add version change detection to build.yml if we want this optimization.

**Decision Point:** Do we need this now, or is it okay to build on every merge?

**Estimated Time:** If implemented: 30 minutes

---

### Spike 4: Version Change Triggers Build

**Goal:** Verify builds run when version changes

**Test Steps:**
1. Prepare a release (version bump)
2. Commit and push to main
3. Verify build workflow runs
4. Check all platforms build
5. Verify GitHub draft created
6. Verify Snap edge published

**Success Criteria:**
- ✅ Build detects version change
- ✅ All platforms compile
- ✅ Draft release created
- ✅ Snap edge has new version

**Estimated Time:** 20 minutes (mostly waiting for builds)

---

## Current State

### What Works
- ✅ Changelog generator workflow (code complete, needs testing)
- ✅ Release preparation script (code complete, needs testing)
- ✅ Security fixes (PATH isolation, no script injection)
- ✅ Documentation (manual process guide)

### What's Not Implemented
- ❌ Version change detection in build.yml (optional optimization)
- ❌ GitHub Action for Release PR (future automation)
- ❌ Automated release notes generation (future nice-to-have)

### What Needs Testing
- ⚠️ Spike 1: Changelog generator on real PR
- ⚠️ Spike 2: Release preparation script
- ⚠️ Spike 4: End-to-end release flow

---

## Next Steps (Priority Order)

### Step 1: Add Gemini API Key ⚠️ REQUIRED
```
1. Go to https://aistudio.google.com/
2. Create API key (free tier)
3. Add to GitHub repo:
   Settings → Secrets and variables → Actions
   New secret: GEMINI_API_KEY
```

### Step 2: Run Spike 1 (Test Changelog Generator)
```
1. Create a small test PR on this branch
2. Observe workflow run
3. Verify changelog file created
4. Check quality of generated text
5. Merge PR to see file on main
```

### Step 3: Run Spike 2 (Test Release Script)
```
1. Create fake changelog files
2. Run: npm run release:prepare
3. Verify all updates work
4. Rollback test changes
```

### Step 4: Decide on Build Optimization
```
Question: Skip builds on normal merges?
- Yes → Implement version detection in build.yml
- No → Keep current behavior (build always)
```

### Step 5: Full Release Test
```
1. Accumulate real changelog files
2. Prepare actual release
3. Test complete flow
4. Verify Snap edge + GitHub draft
```

---

## Decisions to Make

### 1. Build on Every Merge?

**Option A: Current (Build Always)**
- Pros: Simple, ensures every change builds
- Cons: Wastes CI/CD resources, slow merges

**Option B: Build Only on Version Change**
- Pros: Fast merges, lower costs
- Cons: Need to implement detection logic

**Recommendation:** Start with Option A (current), optimize later if needed

### 2. Release Automation Level?

**Level 1: Fully Manual** ✅ (Current)
- Edit files manually or use script
- Full control, simple

**Level 2: LLM-Assisted** ✅ (Current)
- Point LLM at .changelog/ files
- LLM generates updates
- You review and commit

**Level 3: GitHub Action** (Future)
- Button to create Release PR
- Automated but manual trigger

**Level 4: Scheduled** (Future)
- Auto-release weekly/monthly
- Fully automated

**Recommendation:** Start at Level 1-2, see how it feels

---

## File Structure (Current)

```
teams-for-linux/
├── .changelog/
│   └── README.md                     # ✅ Explains system
│
├── .github/
│   └── workflows/
│       ├── changelog-generator.yml   # ✅ Auto-adds to PRs
│       └── build.yml                 # ⚠️ Needs version detection (optional)
│
├── scripts/
│   ├── add-changelog.sh              # ✅ Manual entry helper
│   ├── release-prepare.js            # ✅ Automated prep script
│   └── generateReleaseInfo.js        # ✅ Existing validation
│
├── docs-site/docs/development/
│   ├── manual-release-process.md     # ✅ User guide
│   └── research/
│       ├── spike-1-gemini-quality-results.md          # ✅ Validation
│       ├── spike-2-implementation-results.md          # ✅ Implementation
│       ├── security-fixes-and-improvements.md         # ✅ Security
│       └── release-pr-workflow-plan.md                # 📋 Future
│
└── package.json                      # ✅ Has npm scripts
```

---

## Success Criteria

After completing all spikes:

- ✅ PRs get changelog files automatically
- ✅ Files accumulate on main
- ✅ Release prep works (manual or scripted)
- ✅ Builds trigger correctly
- ✅ Snap edge gets new versions
- ✅ GitHub drafts created properly

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Gemini API fails | Low | Medium | Fallback to PR title |
| Permissions issue | Low | High | Test on feature branch first |
| Build always triggers | High | Low | Document as known behavior |
| XML format breaks | Low | High | Validation script catches it |
| Changelog files lost | Low | Medium | Files are in git, recoverable |

---

## Timeline

**Week 1:**
- ✅ Day 1-2: Implementation complete
- ⚠️ Day 3: Add Gemini API key
- ⚠️ Day 4: Spike 1 (test changelog generator)
- ⚠️ Day 5: Spike 2 (test release script)

**Week 2:**
- Use for 1-2 real releases
- Gather feedback
- Iterate on prompts/formats

**Week 3+:**
- Consider build optimization
- Evaluate automation needs
- Document learnings

---

## Open Questions

1. **Build optimization:** Implement version detection or leave as-is?
2. **Changelog format:** Current format good enough or needs tweaking?
3. **Gemini prompts:** Need to tune for better output?
4. **Automation:** Worth adding GitHub Action or manual is fine?

---

## Summary

**Simple approach:**
1. Bot adds changelog files to PRs ← TEST THIS FIRST
2. Files accumulate on main
3. Manual release prep (you or LLM)
4. Builds happen (on every merge for now)

**Next immediate action:** Run Spike 1 to test changelog generator

Clean, simple, gets the job done. Automate more later if needed.
