# AI Changelog Generation - Validation Spikes

**Goal:** Test critical assumptions before full implementation
**Duration:** 1-2 hours total
**Outcome:** Go/No-Go decision on AI changelog approach

---

## Critical Unknowns (What Could Go Wrong)

1. **Gemini quality:** Does it actually generate useful one-liners?
2. **GitHub permissions:** Can workflow commit back to main?
3. **API reliability:** Will free tier work for our volume?
4. **Format compatibility:** Do AI summaries fit appdata.xml needs?

---

## Spike 1: Test Gemini Summary Quality (30 min)

**Question:** Does Gemini generate good changelog entries from real PRs?

**Test locally (no GitHub Actions needed):**

```bash
# Get Gemini API key from https://aistudio.google.com/ (free)
export GEMINI_API_KEY="your-key-here"

# Test with curl
curl -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=$GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "contents": [{
      "parts": [{
        "text": "Summarize this PR in ONE concise line for a changelog (max 80 chars):\n\nTitle: Add MQTT integration for Teams status publishing\n\nDescription: This PR implements MQTT publishing of Teams status. Users can now configure an MQTT broker and the app will publish status changes (Available, Busy, In a meeting, etc.) for home automation integrations.\n\nCloses #1791"
      }]
    }],
    "generationConfig": {
      "temperature": 0.3,
      "maxOutputTokens": 50
    }
  }'
```

**Success criteria:**
- ✅ Returns one-line summary
- ✅ Starts with action verb (Add/Fix/Update)
- ✅ Under 80 characters
- ✅ User-focused (not technical jargon)

**Test cases:**
1. Feature PR (like MQTT integration)
2. Bug fix PR
3. Documentation PR
4. Refactoring PR (internal changes)

**Expected time:** 15-30 minutes
**Risk if skipped:** Build entire system, get low-quality summaries

---

## Spike 2: Test GitHub Actions Write Permissions (15 min)

**Question:** Can our workflow commit changelog files back to main?

**Create minimal test workflow:**

```yaml
# .github/workflows/test-commit-permissions.yml
name: Test Commit Permissions

on:
  workflow_dispatch:  # Manual trigger for testing

jobs:
  test-commit:
    runs-on: ubuntu-latest
    permissions:
      contents: write  # Need this!

    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Create test file
        run: |
          mkdir -p .changelog-test
          echo "Test commit from Actions" > .changelog-test/test.txt

      - name: Commit and push
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add .changelog-test/
          git commit -m "test: verify Actions can commit to main"
          git push
```

**Test:**
1. Create this workflow file
2. Push to a test branch
3. Manually trigger from GitHub Actions UI
4. Check if commit appears on branch

**Success criteria:**
- ✅ Workflow runs without errors
- ✅ File appears in repository
- ✅ Commit is by github-actions[bot]

**Expected time:** 15 minutes
**Risk if skipped:** Build everything, discover we can't commit back (showstopper!)

---

## Spike 3: Test PR Merge Trigger (15 min)

**Question:** Does the workflow trigger correctly when PR merges to main?

**Create minimal test workflow:**

```yaml
# .github/workflows/test-pr-merge-trigger.yml
name: Test PR Merge Detection

on:
  pull_request:
    types: [closed]
    branches: [main]

jobs:
  test-trigger:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest

    steps:
      - name: Verify PR data is available
        run: |
          echo "PR Number: ${{ github.event.pull_request.number }}"
          echo "PR Title: ${{ github.event.pull_request.title }}"
          echo "PR Body: ${{ github.event.pull_request.body }}"
          echo "✅ Trigger works! PR data is accessible."
```

**Test:**
1. Create a test PR to main
2. Merge it
3. Check Actions tab for workflow run

**Success criteria:**
- ✅ Workflow runs only on merge (not on close without merge)
- ✅ PR title and body are accessible
- ✅ Triggers within 30 seconds of merge

**Expected time:** 15 minutes
**Risk if skipped:** Workflow might not trigger reliably or lack PR data

---

## Spike 4: Test Full Integration (30 min)

**Question:** Does the end-to-end flow work?

**Combine all pieces in one test:**

```yaml
# .github/workflows/test-changelog-integration.yml
name: Test Full Changelog Flow

on:
  pull_request:
    types: [closed]
    branches: [main]

jobs:
  generate-changelog:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4

      - name: Generate summary with Gemini
        run: |
          RESPONSE=$(curl -s -X POST \
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${{ secrets.GEMINI_API_KEY }}" \
            -H 'Content-Type: application/json' \
            -d '{
              "contents": [{
                "parts": [{
                  "text": "Summarize in ONE line (max 80 chars): ${{ github.event.pull_request.title }}\n\n${{ github.event.pull_request.body }}"
                }]
              }]
            }' | jq -r '.candidates[0].content.parts[0].text')

          echo "Generated: $RESPONSE"
          echo "$RESPONSE" > .changelog/pr-${{ github.event.pull_request.number }}.txt

      - name: Commit changelog
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add .changelog/
          git commit -m "chore: add changelog for PR #${{ github.event.pull_request.number }}"
          git push
```

**Test:**
1. Add Gemini API key to GitHub Secrets
2. Create and merge a test PR
3. Check if `.changelog/pr-XXX.txt` appears on main

**Success criteria:**
- ✅ Gemini generates summary
- ✅ File is created with good content
- ✅ Commit appears on main branch
- ✅ Takes < 30 seconds total

**Expected time:** 30 minutes
**Risk if skipped:** Individual pieces work but integration fails

---

## Spike 5: Test appdata.xml Consumption (20 min)

**Question:** Can we reliably generate appdata.xml from changelog files?

**Test script:**

```javascript
// scripts/test-appdata-generation.js
const fs = require('fs');
const path = require('path');

// Create fake changelog files
const testChangelogs = [
  'Add MQTT integration for Teams status publishing',
  'Fix notification behavior in system tray',
  'Update Electron to version 38.7.1'
];

fs.mkdirSync('.changelog-test', { recursive: true });
testChangelogs.forEach((text, i) => {
  fs.writeFileSync(`.changelog-test/${i}.txt`, text);
});

// Read them back
const files = fs.readdirSync('.changelog-test');
const entries = files.map(f =>
  fs.readFileSync(path.join('.changelog-test', f), 'utf8').trim()
);

// Generate XML
const xmlEntries = entries.map(e => `\t\t\t\t\t<li>${e}</li>`).join('\n');

const xmlBlock = `
\t\t<release version="2.7.0" date="2025-11-12">
\t\t\t<description>
\t\t\t\t<ul>
${xmlEntries}
\t\t\t\t</ul>
\t\t\t</description>
\t\t</release>
`;

console.log('Generated appdata.xml entry:');
console.log(xmlBlock);

// Verify format
const hasProperIndentation = xmlBlock.includes('\t\t\t\t\t<li>');
const hasAllEntries = entries.every(e => xmlBlock.includes(e));

console.log('\n✅ Tests:');
console.log(`  Proper indentation: ${hasProperIndentation ? 'PASS' : 'FAIL'}`);
console.log(`  All entries present: ${hasAllEntries ? 'PASS' : 'FAIL'}`);

// Cleanup
fs.rmSync('.changelog-test', { recursive: true });
```

**Test:**
```bash
node scripts/test-appdata-generation.js
```

**Success criteria:**
- ✅ Reads all changelog files
- ✅ Generates valid XML format
- ✅ Proper indentation/escaping
- ✅ All entries present

**Expected time:** 20 minutes
**Risk if skipped:** Format issues in appdata.xml, manual fixes needed

---

## Spike Summary & Decision Matrix

| Spike | Time | Blocker if Fails? | Must Do? |
|-------|------|-------------------|----------|
| 1. Gemini Quality | 30 min | ⚠️ Medium | ✅ YES |
| 2. Commit Permissions | 15 min | 🚫 **HIGH** | ✅ **YES** |
| 3. PR Merge Trigger | 15 min | 🚫 **HIGH** | ✅ **YES** |
| 4. Full Integration | 30 min | ⚠️ Medium | Optional |
| 5. appdata.xml | 20 min | ⚠️ Medium | ✅ YES |

**Critical path (must pass):**
1. Spike 2 (Permissions) - 15 min
2. Spike 1 (Quality) - 30 min
3. Spike 5 (XML format) - 20 min

**Total critical time:** ~65 minutes

**Go/No-Go decision points:**

| Spike Result | Decision |
|--------------|----------|
| All pass | ✅ Proceed with full implementation |
| Spike 1 fails (bad quality) | ⚠️ Try Claude/manual approach instead |
| Spike 2 fails (permissions) | 🚫 **STOP** - Need different approach (e.g., bot via app) |
| Spike 5 fails (XML) | ⚠️ Fixable - adjust format/escaping |

---

## Recommended Spike Order

**Phase 1: Quick validation (30 min)**
```bash
# Can do right now, no setup needed:
1. Spike 1 (Gemini quality) - Test with curl locally
   → If bad quality, stop here and reconsider

# Next (if Spike 1 passes):
2. Spike 2 (Permissions) - 15 min test workflow
   → If fails, BLOCKER - need to use GitHub App instead
```

**Phase 2: Integration validation (35 min)**
```bash
# If Phase 1 passes:
3. Spike 5 (appdata.xml) - Test script generation
4. Spike 3 (PR trigger) - Test in real PR
```

**Phase 3: Full test (optional)**
```bash
5. Spike 4 (End-to-end) - Validate everything together
```

---

## What to Test With

**Real PR examples from your repo:**
- Feature: #1926 (MQTT integration)
- Fix: #1921 (notification behavior)
- Update: Recent Electron upgrade

**Test prompts:**
1. Simple: Just PR title
2. Detailed: Title + first paragraph of description
3. Complex: Long PR with multiple changes

---

## Exit Criteria

**Proceed to implementation if:**
- ✅ Gemini generates acceptable summaries (70%+ quality)
- ✅ GitHub Actions can commit to main
- ✅ XML generation works correctly
- ✅ PR merge trigger is reliable

**Stop and reconsider if:**
- ❌ Gemini quality < 50% (use manual approach)
- ❌ Can't commit to main (need GitHub App)
- ❌ Free tier rate limits hit (switch to Claude/Ollama)

---

## Next Steps

**Option A: I run the spikes for you**
- I create the test workflows
- Test on your repo
- Report results in ~1 hour
- You make go/no-go decision

**Option B: You run the spikes**
- I provide the test scripts
- You run them manually
- Faster feedback, more control

**Which would you prefer?**
