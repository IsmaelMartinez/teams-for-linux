# Changelog Entries

This directory stores pending changelog entries for the next release.

## Setup (One-Time)

### Configure Gemini API Key

The automatic changelog generation uses Google's Gemini AI. You need to add the API key to GitHub Secrets:

**Steps:**
1. Go to https://aistudio.google.com/
2. Click "Get API key" (free tier available)
3. Create a new API key or use existing one
4. Copy the key
5. In your GitHub repo: **Settings** → **Secrets and variables** → **Actions**
6. Click **New repository secret**
7. Name: `GEMINI_API_KEY`
8. Value: Paste your API key
9. Click **Add secret**

**Note:** The free tier includes 1,500 requests per day, which is more than enough for changelog generation.

## How It Works

### Automatic (via AI)
When you open or update a PR, a GitHub Action automatically:
1. Uses Gemini AI to generate a one-line summary
2. Creates a file: `.changelog/pr-XXXX.txt`
3. Commits it to the PR branch
4. Comments on the PR with the generated entry

### Manual (if needed)
If you want to add or edit a changelog entry manually:

```bash
# Just create a .txt file in .changelog/ directory
echo "Your changelog description - by @username (#PR)" > .changelog/manual-$(date +%s).txt
```

## Release Process

When ready to release:

```bash
npm run release:prepare
```

This script will:
1. Read all `.changelog/*.txt` files
2. Generate `appdata.xml` release entry
3. Prompt for version bump (patch/minor/major)
4. Update `package.json`, `package-lock.json`, `appdata.xml`
5. Delete consumed changelog files
6. Show you what to commit

Then just:
```bash
git add .
git commit -m "chore: release vX.Y.Z"
git push origin main
```

The version change triggers the build workflow automatically.

## File Format

Each file contains one line:
```
Add MQTT integration for Teams status publishing - by @username (#1234)
```

Simple plain text, nothing fancy.

## Editing Entries

AI-generated entries are good but not perfect. Feel free to edit any `.changelog/*.txt` file before running `release:prepare`.
