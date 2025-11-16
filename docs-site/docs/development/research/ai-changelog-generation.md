# AI-Powered Changelog Generation

**Status:** Research
**Date:** 2025-11-12
**Goal:** Use existing AI bots (Gemini/Claude) to auto-generate one-line changelog entries from PRs

---

## The Problem

Currently, when preparing a release:
1. Merge multiple PRs to main (no release yet)
2. Manually write changelog entries in `appdata.xml`
3. Update version, push → triggers build

**Pain point:** Remembering and summarizing all changes after the fact.

---

## The Solution

Auto-generate one-line summaries when PR is merged, store in `.changelog/` files, consume when releasing.

### Workflow

```
PR #123 opened
  ↓
PR merged to main
  ↓
AI bot (Gemini/Claude) analyzes the PR
  ↓
Bot generates one-liner: "Add MQTT integration for status publishing"
  ↓
Bot creates: .changelog/pr-123.txt
  ↓
Bot commits to main
  ↓
(Repeat for more PRs...)
  ↓
When ready to release:
  npm run release:prepare
  ↓
Script reads all .changelog/*.txt files
  ↓
Generates appdata.xml entry
  ↓
Deletes changelog files (consumed)
  ↓
Version bump + push → build triggers
```

---

## AI Options

### Option 1: Google Gemini (Official GitHub Actions)

**Free tier:** Generous quotas via Google AI Studio
**Model:** gemini-2.0-flash-exp
**Cost:** Free for typical usage

**Setup:**
```yaml
# .github/workflows/changelog-generator.yml
name: Auto-generate Changelog Entry

on:
  pull_request:
    types: [closed]
    branches: [main]

jobs:
  generate-changelog:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Generate summary with Gemini
        uses: google-github-actions/run-gemini-cli@v1
        id: gemini
        with:
          gemini_api_key: ${{ secrets.GEMINI_API_KEY }}
          prompt: |
            Summarize this PR in ONE concise line suitable for a changelog:

            Title: ${{ github.event.pull_request.title }}
            Description: ${{ github.event.pull_request.body }}

            Guidelines:
            - Start with action verb (Add/Fix/Update/Remove)
            - Focus on user-facing impact
            - Max 80 characters
            - Professional tone

            Example: "Add MQTT integration for Teams status publishing"

      - name: Save to changelog file
        run: |
          mkdir -p .changelog
          echo "${{ steps.gemini.outputs.response }}" > .changelog/pr-${{ github.event.pull_request.number }}.txt

      - name: Commit changelog file
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add .changelog/
          git commit -m "chore: add changelog entry for PR #${{ github.event.pull_request.number }}"
          git push
```

**Pros:**
- ✅ Free for reasonable use
- ✅ Official Google support
- ✅ High-quality summaries
- ✅ Fast (< 5 seconds)

**Cons:**
- ⚠️ Requires API key
- ⚠️ External dependency

---

### Option 2: Claude AI (Official Action)

**Cost:** ~$0.001 per summary (Haiku model)
**Model:** claude-3-haiku-20240307

**Setup:**
```yaml
- name: Generate summary with Claude
  uses: anthropics/claude-code-action@v1
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    model: claude-3-haiku-20240307
    prompt: |
      Summarize this PR in one line for a changelog:

      ${{ github.event.pull_request.title }}
      ${{ github.event.pull_request.body }}

      Requirements: Start with verb, max 80 chars, user-focused.
```

**Pros:**
- ✅ Excellent quality
- ✅ Official Anthropic action
- ✅ Very cheap

**Cons:**
- ⚠️ Not free (though pennies per use)

---

### Option 3: Piggyback on Existing Review Bot

**If you already have Gemini doing PR reviews:**

```yaml
# Add to existing review workflow
- name: Extract summary from review
  run: |
    # Gemini review already analyzed the PR
    # Just ask for one-liner at the end
    SUMMARY=$(gemini-cli "Summarize this PR in max 10 words")
    echo "$SUMMARY" > .changelog/pr-${{ github.event.pull_request.number }}.txt
```

**Pros:**
- ✅ Reuses existing infrastructure
- ✅ No extra API calls
- ✅ Already authenticated

**Cons:**
- ⚠️ Depends on existing bot setup

---

## Alternative: Manual with Template

**For those who prefer control:**

```yaml
# .github/workflows/changelog-prompt.yml
name: Changelog Reminder

on:
  pull_request:
    types: [opened]

jobs:
  remind:
    runs-on: ubuntu-latest
    steps:
      - name: Comment on PR
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '📝 **Changelog Reminder**\n\nPlease add a one-line summary:\n```bash\necho "Your summary here" > .changelog/pr-${{ github.event.pull_request.number }}.txt\ngit add .changelog/ && git commit -m "chore: add changelog"\n```'
            })
```

Developer adds the file manually (30 seconds).

---

## Recommended Approach

**Phase 1: Start Manual**
- Add reminder bot (comments on PRs)
- Developers create `.changelog/*.txt` manually
- Build muscle memory

**Phase 2: Add AI Assistance**
- Integrate Gemini (free) for auto-generation
- AI creates the file, developer can edit if needed
- Falls back to manual if AI fails

**Phase 3: Fully Automated**
- AI generates on merge
- Maintainer reviews all entries when preparing release
- Can still override manually

---

## Integration with Release Process

### Current Flow
```bash
# Preparing release v2.7.0
1. Edit package.json version
2. npm install
3. Edit appdata.xml (list all changes)
4. git commit && git push
5. Build triggers
```

### With AI-Generated Changelogs
```bash
# After merging PRs, .changelog/ has:
# - pr-123.txt: "Add MQTT integration for status publishing"
# - pr-124.txt: "Fix notification behavior in system tray"
# - pr-125.txt: "Add GPU debug window for diagnostics"

# Preparing release v2.7.0
1. npm run release:prepare
   # Reads .changelog/*.txt
   # Auto-generates appdata.xml entry
   # Prompts for version: 2.7.0
   # Updates package.json
   # Runs npm install
   # Deletes .changelog/*.txt

2. Review generated changelog
3. git commit && git push
4. Build triggers
```

**Time saved:** 5-8 minutes per release

---

## File Structure

```
teams-for-linux/
├── .changelog/                    # Auto-generated entries
│   ├── pr-123.txt                # "Add MQTT integration..."
│   ├── pr-124.txt                # "Fix notification behavior..."
│   └── pr-125.txt                # "Add GPU debug window..."
│
├── .github/
│   └── workflows/
│       └── changelog-generator.yml  # AI bot
│
└── scripts/
    └── release-prepare.js         # Consumes .changelog/
```

---

## Cost Analysis

| Option | Setup Time | Per-PR Cost | Per-Release Cost |
|--------|-----------|-------------|------------------|
| Manual | 0 min | 1 min | 5-10 min |
| Gemini (free) | 30 min | $0 | $0 |
| Claude | 30 min | $0.001 | $0.02 |
| Ollama | 1 hour | $0 | $0 |

**Recommendation:** Gemini (free, fast, high quality)

---

## Getting Started

### Step 1: Get Gemini API Key
1. Visit [Google AI Studio](https://aistudio.google.com/)
2. Create API key (free tier)
3. Add to GitHub Secrets as `GEMINI_API_KEY`

### Step 2: Add Workflow
Copy the Gemini workflow above to `.github/workflows/changelog-generator.yml`

### Step 3: Create Release Script
```bash
npm install --save-dev glob
# Create scripts/release-prepare.js (consumes .changelog/)
```

### Step 4: Test
1. Create test PR
2. Merge it
3. Check if `.changelog/pr-XXX.txt` was created
4. Run `npm run release:prepare` to test consumption

---

## Next Steps

1. **Choose AI option** (Gemini recommended)
2. **Test on a few PRs** (manual first, then AI)
3. **Refine prompts** (tune the output format)
4. **Document for contributors** (update CONTRIBUTING.md)
5. **Iterate** (improve based on real usage)

---

## Questions?

- **What if AI generates bad summary?** Developer can edit `.changelog/*.txt` before merging
- **What if PR has no user-facing changes?** Skip changelog file (or mark as "Internal")
- **What about security/breaking changes?** Prefix with "BREAKING:" or "Security:"
- **Can I still do it manually?** Yes, always! AI is optional assistance

---

## Related Documents

- [Release Info Documentation](../release-info.md) - Current release process
- Research documents in this directory for automation details
