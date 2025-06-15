# Release Info Integration

This document explains how release information is automatically generated and bundled with the Teams for Linux application using electron-builder.

## Overview

The release info integration automatically:

1. Validates version consistency across `package.json`, `package-lock.json`, and `com.github.IsmaelMartinez.teams_for_linux.appdata.xml`
2. Extracts release notes from the `com.github.IsmaelMartinez.teams_for_linux.appdata.xml` file
3. Generates a `release-info.json` file conforming to [electron-builder's ReleaseInfo interface](https://www.electron.build/app-builder-lib.interface.releaseinfo)
4. Makes release info available for Linux publishing to GitHub

## How It Works

### Build Process Integration

1. **Pre-build**: The `prebuild` npm script runs `generate-release-info` before any build
2. **After Pack**: The `afterPack` hook in electron-builder generates fresh release info for Linux builds
3. **Publishing**: The `release-info.json` file is used by electron-builder when publishing Linux releases to GitHub

### Generated Files

- **`release-info.json`** (project root): Used for Linux publishing process

## Usage

### NPM Scripts

```bash
# Generate release info manually
npm run generate-release-info

# Build with automatic release info generation
npm run pack
npm run dist
```

## File Structure

```
project/
├── package.json                           # Contains version and build config
├── package-lock.json                      # Version consistency check
├── com.github.IsmaelMartinez.teams_for_linux.appdata.xml  # Source of release notes
├── release-info.json                      # Generated release info (dev)
├── scripts/
│   ├── generateReleaseInfo.js             # Release info generator
│   └── afterpack.js                       # Build
```

## Configuration

### electron-builder Configuration (package.json)

```json
{
  "build": {
    "extraResources": [
      {
        "from": "release-info.json",
        "to": "release-info.json"
      }
    ],
    "afterPack": "scripts/afterpack.js"
  }
}
```

### NPM Scripts (package.json)

```json
{
  "scripts": {
    "generate-release-info": "node scripts/generateReleaseInfo.js",
    "prebuild": "npm run generate-release-info"
  }
}
```

## Release Info Schema

The generated `release-info.json` follows electron-builder's ReleaseInfo interface:

```json
{
  "releaseName": "2.0.16",
  "releaseNotes": "• Added feature A\n• Fixed bug B\n• Improved performance C",
  "releaseDate": "2025-06-05"
}
```

### Properties

- **`releaseName`**: Current version from `package.json`
- **`releaseNotes`**: Release notes extracted from `com.github.IsmaelMartinez.teams_for_linux.appdata.xml` `<description>` section
- **`releaseDate`**: Release date from `com.github.IsmaelMartinez.teams_for_linux.appdata.xml` `date` attribute

## Adding Release Notes

To add release notes for a new version:

1. Update the version in `package.json`
2. Run `npm install` to update `package-lock.json`
3. Add a new `<release>` entry in `com.github.IsmaelMartinez.teams_for_linux.appdata.xml`:

```xml
<release version="2.0.17" date="2025-06-15">
  <description>
    <ul>
      <li>New feature description</li>
      <li>Bug fix description</li>
      <li>Performance improvement</li>
    </ul>
  </description>
</release>
```

4. The release info will be automatically generated during the next build

## Error Handling

The system performs validation and provides helpful error messages:

- **Version Mismatch**: If `package.json` and `package-lock.json` versions don't match
- **Missing Release Entry**: If no release entry exists for the current version in `com.github.IsmaelMartinez.teams_for_linux.appdata.xml`
- **Empty Release Notes**: If the release entry has no description
- **Missing Files**: If any required file is not found

## Examples

### Manual Generation

```bash
cd /path/to/teams-for-linux
npm run generate-release-info
```

Output:
```
✅ Version consistency check passed!
   package.json: 2.0.16
   package-lock.json: 2.0.16
   com.github.IsmaelMartinez.teams_for_linux.appdata.xml: 2.0.16 (with release notes)

📋 Generated Release Info (electron-builder ReleaseInfo interface):

{
  "releaseName": "2.0.16",
  "releaseNotes": "• Added a reimplementation of the call events to revive the incoming call scripts\n• Added an incoming call toast just like the one from the discontinued Linux Teams App from Microsoft",
  "releaseDate": "2025-06-05"
}

💾 Release info saved to: /path/to/teams-for-linux/release-info.json
```

### Build Integration

```bash
npm run pack  # Automatically runs prebuild and afterPack hooks
```

The release info will be automatically generated and bundled with the application.
