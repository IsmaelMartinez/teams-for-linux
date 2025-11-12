# Contributing to Teams for Linux

Thank you for considering contributing! This guide will help you get started with development.

> [!TIP]
> New to Electron? This project is a great starting point for learning!

## Quick Start

1. **Fork** the repository
2. **Clone** your fork and create a feature branch
3. **Make changes** (entry point: `app/index.js`)
4. **Test** your changes with `npm start`
5. **Submit** a pull request to `main` branch

Each `app/` subfolder contains a README explaining its purpose.

## Testing Pull Requests

You can test PR changes without building from source by downloading pre-built artifacts from GitHub Actions.

### How to Download PR Artifacts

1. **Navigate to the PR** on GitHub
2. **Click the "Checks" tab** at the top of the PR
3. **Select a completed workflow run** (look for green checkmarks)
4. **Scroll down to "Artifacts" section** at the bottom of the workflow page
5. **Download the artifact** for your platform:
   - `teams-for-linux-linux-x64` - Linux x64 (deb, rpm, tar.gz, AppImage)
   - `teams-for-linux-linux-arm64` - Linux ARM64 (Raspberry Pi 4/5, ARM servers)
   - `teams-for-linux-linux-armv7l` - Linux ARMv7l (older Raspberry Pi)
   - `teams-for-linux-macos-x64` - macOS Intel (DMG)
   - `teams-for-linux-windows-x64` - Windows (EXE)

**Note:** You need to be logged into GitHub to download artifacts. Artifacts are retained for 30 days.

### Installing from Artifacts

**Linux (deb):**
```bash
# Extract the downloaded zip
unzip teams-for-linux-linux-x64.zip
# Install the deb package
sudo dpkg -i teams-for-linux_*.deb
```

**Linux (AppImage):**
```bash
# Extract and make executable
unzip teams-for-linux-linux-x64.zip
chmod +x teams-for-linux-*.AppImage
# Run directly
./teams-for-linux-*.AppImage
```

**macOS:**
```bash
# Extract and open the DMG
unzip teams-for-linux-macos-x64.zip
open teams-for-linux-*.dmg
```

**Windows:**
```bash
# Extract and run the installer
# (Windows will extract the zip automatically)
# Double-click the .exe to install
```

## Development Setup

**Prerequisites:** Node.js and npm ([installation guide](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm))

```bash
# Clone and setup
git clone https://github.com/your-username/teams-for-linux.git
cd teams-for-linux
npm install

# Run from source
npm start

# Lint code (required before commits)
npm run lint
```

## Building

### Local Linux Build
```bash
npm run dist:linux    # Creates deb, rpm, snap, AppImage, tar.gz
npm run pack          # Development build without packaging
```

### Docker/Podman Build
```bash
podman run -it --rm --volume .:/var/mnt:z -w /var/mnt/ node:20 /bin/bash -c \
  "apt update && apt install -y rpm && npm ci && npm run dist:linux"
```

### Snap-specific Build
```bash
npm run dist:linux:snap
cd dist && sudo snap install teams-for-linux_*.snap --dangerous
```

## Documentation

Project documentation has been migrated to Docusaurus and is deployed to GitHub Pages via GitHub Actions at https://ismaelmartinez.github.io/teams-for-linux/.

### Contributing to Documentation

Documentation contributions involve:
1. **Edit Markdown/MDX files** in the `docs-site/docs/` directory
2. **Build locally to preview changes**:
   ```bash
   cd docs-site
   npm install
   npm run start
   ```
3. **Update navigation** in `docs-site/sidebars.ts` if adding new pages
4. **Submit pull requests** which trigger automated builds and deployments

See the [Documentation Contributing Guide](https://ismaelmartinez.github.io/teams-for-linux/development/contributing) for detailed instructions.

## Release Process


1. **Update version** in `package.json`:
   - Patches: `1.0.0` → `1.0.1` 
   - Features: `1.0.0` → `1.1.0`
   - Major: Reserved

2. **Update dependencies**: `npm install`

3. **Add release notes** in `com.github.IsmaelMartinez.teams_for_linux.appdata.xml`:
   ```xml
   <release version="2.0.17" date="2025-06-15">
     <description>
       <ul>
         <li>New feature description</li>
         <li>Bug fix description</li>
       </ul>
     </description>
   </release>
   ```

4. **Commit and push** your changes, then open a pull request.

See the [Release Automation Guide](https://ismaelmartinez.github.io/teams-for-linux/release-info) for technical details on release automation.
