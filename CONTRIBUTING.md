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

### Updating Documentation

Project documentation is located in the `/docs` folder and automatically deployed to **[GitHub Pages](https://ismaelmartinez.github.io/teams-for-linux/)**.

**To update documentation:**
1. Edit markdown files in `/docs` folder
2. Push changes to main branch
3. GitHub Pages automatically rebuilds within 1-5 minutes

**Documentation Structure:**
- `docs/README.md` - Homepage with navigation
- `docs/configuration.md` - Complete configuration guide  
- `docs/knowledge-base.md` - Troubleshooting and FAQ
- `docs/screen-sharing.md` - Screen sharing implementation
- Additional guides for specific features

**Note:** When adding new features, update relevant documentation and add links to `docs/README.md` navigation.

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

See [`docs/RELEASE_INFO.md`](docs/RELEASE_INFO.md) for technical details on release automation.
