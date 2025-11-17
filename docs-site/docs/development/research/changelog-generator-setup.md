# Changelog Generator Setup Guide

**Date:** 2025-11-12
**Status:** Ready to Test

---

## Overview

The changelog generator automatically creates `.changelog/pr-XXX.txt` files for each PR using Google's Gemini AI. This guide covers setup, testing, and potential future extraction as a standalone bot.

---

## Prerequisites

- GitHub repository with Actions enabled
- Google account (free tier is sufficient)

---

## Setup Steps

### 1. Get Gemini API Key

**Where to get it:**
- https://aistudio.google.com/

**Steps:**
1. Go to https://aistudio.google.com/
2. Sign in with your Google account
3. Click **"Get API key"** in the left sidebar
4. Click **"Create API key"**
5. Select **"Create API key in new project"** (or use existing project)
6. Copy the generated API key (it looks like: `AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`)

**Important:** Keep this key secure! Treat it like a password.

**Free tier limits:**
- 1,500 requests per day
- 10 requests per minute
- More than enough for changelog generation (1-2 requests per PR)

### 2. Add to GitHub Secrets

**Where to add it:**
- `https://github.com/YOUR-USERNAME/YOUR-REPO/settings/secrets/actions`

**Steps:**
1. Go to your GitHub repository
2. Click **Settings** (top right)
3. In left sidebar: **Secrets and variables** → **Actions**
4. Click **New repository secret**
5. Fill in:
   - **Name:** `GEMINI_API_KEY`
   - **Secret:** Paste your API key from step 1
6. Click **Add secret**

**Verification:**
- You should see `GEMINI_API_KEY` in the list
- The value is hidden (shows as `***`)

### 3. Verify Workflow Exists

Check that `.github/workflows/changelog-generator.yml` exists in your repository.

**Key settings in workflow:**
```yaml
name: Generate Changelog Entry
on:
  pull_request:
    types: [opened, synchronize]
permissions:
  contents: write
  pull-requests: write
```

---

## Testing the Setup

### Test 1: Create New PR

**Steps:**
1. Create a new branch with a small change
2. Open a PR
3. Check the **Actions** tab
4. Look for "Generate Changelog Entry" workflow
5. Wait for it to complete

**Expected results:**
- Workflow runs successfully (green checkmark)
- New file `.changelog/pr-XXX.txt` appears in the PR
- Bot comments on PR with generated entry

**Example comment:**
```
📝 Changelog entry generated:

Add MQTT integration for Teams status publishing - by @username (#123)

File created: .changelog/pr-123.txt
```

### Test 2: Update Existing PR

**Steps:**
1. Push a new commit to the PR
2. Workflow should run again
3. Should see comment: "Changelog already exists"

**Expected results:**
- Workflow runs but skips generation
- Existing `.changelog/pr-XXX.txt` is not modified

### Test 3: Manual Regeneration

**Steps:**
1. Delete `.changelog/pr-XXX.txt` from the PR branch
2. Push the deletion
3. Workflow should run and regenerate the file

**Expected results:**
- Workflow detects file is missing
- Calls Gemini API to regenerate summary
- Creates new `.changelog/pr-XXX.txt`

---

## Troubleshooting

### Workflow Fails: "GEMINI_API_KEY not found"

**Cause:** API key not added to GitHub Secrets

**Fix:**
1. Follow "Add to GitHub Secrets" steps above
2. Verify secret name is exactly `GEMINI_API_KEY` (case-sensitive)
3. Re-run the workflow (Actions tab → Re-run jobs)

### Workflow Fails: "429 Too Many Requests"

**Cause:** Exceeded free tier rate limit (10 requests/minute or 1,500/day)

**Fix:**
- Wait a few minutes and re-run
- If hitting daily limit, upgrade to paid tier or wait until next day

### Workflow Fails: "400 Bad Request"

**Cause:** Invalid API key or API key restrictions

**Fix:**
1. Go to https://aistudio.google.com/
2. Check API key is active
3. Check API key restrictions (should allow Gemini API)
4. Generate new key if needed
5. Update GitHub Secret

### Generated Summary is Poor Quality

**Cause:** PR title/description is vague or too technical

**Fix:**
- Edit `.changelog/pr-XXX.txt` manually
- Improve PR title to be more descriptive
- Add better PR description

### File Not Committed to PR

**Cause:** Workflow permissions issue

**Fix:**
1. Check workflow has `contents: write` permission
2. Check repository Settings → Actions → General
3. Verify "Workflow permissions" is set to "Read and write"

---

## API Key Rotation

**When to rotate:**
- If key is accidentally exposed
- Every 90 days (security best practice)
- If switching projects

**How to rotate:**
1. Generate new key at https://aistudio.google.com/
2. Update GitHub Secret `GEMINI_API_KEY` with new value
3. Delete old key from Google AI Studio
4. Test with a new PR

---

## Future: Extract as Standalone Bot

If you want to extract this as a reusable bot for other repos:

### Option 1: GitHub App

**Pros:**
- Install across multiple repos
- Better permission management
- Can use GitHub App authentication

**Cons:**
- More setup complexity
- Need to host somewhere (or use GitHub Actions)

**Implementation:**
- Convert workflow to GitHub App
- Use Octokit for API calls
- Deploy to Cloud Run, Vercel, or similar

### Option 2: Reusable Workflow

**Pros:**
- Easy to share across repos
- No external hosting needed
- Centralized updates

**Cons:**
- Each repo needs to add workflow file
- Each repo needs own GEMINI_API_KEY

**Implementation:**
- Create `.github/workflows/changelog-generator.yml` in a template repo
- Other repos reference it via `uses: username/repo/.github/workflows/changelog-generator.yml@main`

### Option 3: GitHub Action (Composite)

**Pros:**
- Reusable action
- Can be published to GitHub Marketplace
- Easy to version

**Cons:**
- Need to maintain action.yml
- Each repo still needs GEMINI_API_KEY

**Implementation:**
- Create `action.yml` in separate repo
- Other repos use: `uses: username/changelog-generator@v1`

**Recommended approach for extraction:**
- Start with **Option 2: Reusable Workflow** (simplest)
- If widely adopted, move to **Option 3: GitHub Action**
- Only use **Option 1: GitHub App** if you need cross-org functionality

---

## Cost Considerations

### Free Tier (Current)

**Gemini API free tier:**
- 1,500 requests/day
- 10 requests/minute
- Free forever

**Sufficient for:**
- Small to medium repos (< 100 PRs/day)
- Most open source projects

### Paid Tier

**When to upgrade:**
- High-velocity repo (> 1,000 PRs/day)
- Need higher rate limits

**Pricing:**
- Pay-as-you-go: $0.00025 per request
- Example: 10,000 requests/month = $2.50/month

---

## Security Notes

**API Key Security:**
- Never commit API key to repository
- Never print API key in workflow logs
- Use GitHub Secrets for storage
- Rotate regularly (90 days recommended)

**Workflow Security:**
- Use `actions/github-script@v7` (no shell injection)
- All user input via `context.payload` (safe)
- No `${{ }}` interpolation in bash commands
- Read security analysis: `docs-site/docs/development/research/security-fixes-and-improvements.md`

**Rate Limiting:**
- Workflow has idempotency check (skip if file exists)
- Prevents accidental API spam
- Respects Gemini rate limits

---

## Monitoring

### Check Workflow Runs

**Location:** `https://github.com/YOUR-USERNAME/YOUR-REPO/actions/workflows/changelog-generator.yml`

**What to monitor:**
- Success rate (should be > 95%)
- Run duration (typically < 30 seconds)
- API call frequency

### Check API Usage

**Location:** https://aistudio.google.com/

**Metrics to monitor:**
- Daily request count
- Rate limit hits
- Error rate

### Alerts to Set

**Consider setting up alerts for:**
- Workflow failure rate > 10%
- API daily usage > 1,000 requests
- Multiple 429 errors (rate limit exceeded)

---

## Quick Reference

**Get API key:**
```
https://aistudio.google.com/ → Get API key → Create API key in new project
```

**Add to GitHub:**
```
GitHub Repo → Settings → Secrets and variables → Actions → New repository secret
Name: GEMINI_API_KEY
Value: AIzaSy...
```

**Test workflow:**
```
1. Create PR
2. Check Actions tab
3. Verify .changelog/pr-XXX.txt created
```

**Regenerate entry:**
```bash
# From PR branch
rm .changelog/pr-XXX.txt
git add .
git commit -m "Regenerate changelog"
git push
```

**Manual entry:**
```bash
npm run changelog:add "Your description"
```

---

## Related Documentation

- Workflow implementation: `.github/workflows/changelog-generator.yml`
- Release process: `docs-site/docs/development/manual-release-process.md`
- Security analysis: `docs-site/docs/development/research/security-fixes-and-improvements.md`
- Implementation plan: `docs-site/docs/development/research/simple-changelog-plan.md`

---

## Support

**Gemini API issues:**
- https://ai.google.dev/gemini-api/docs

**GitHub Actions issues:**
- https://docs.github.com/en/actions

**Project-specific questions:**
- Open an issue in the repository
