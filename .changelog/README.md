# Changelog Entries

This directory stores pending changelog entries for the next release.

## How It Works

### Automatic (via AI)
When you merge a PR to `main`, a GitHub Action automatically:
1. Uses Gemini AI to generate a one-line summary
2. Creates a file: `.changelog/pr-XXXX.txt`
3. Commits it to main

### Manual (if needed)
If you want to add or edit a changelog entry manually:

```bash
# Add new entry
npm run changelog:add "Your changelog description"

# Or use the script directly
./scripts/add-changelog.sh "Your changelog description"
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
