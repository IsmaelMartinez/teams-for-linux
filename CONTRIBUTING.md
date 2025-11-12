# Contributing to Teams for Linux

Thank you for considering contributing! This guide will help you get started with development.

> [!TIP]
> New to Electron? This project is a great starting point for learning!

> [!NOTE]
> **This is a quick reference guide.** For comprehensive developer documentation including architecture, code standards, testing strategy, and detailed guidelines, see the [**Full Contributing Guide**](https://ismaelmartinez.github.io/teams-for-linux/development/contributing).

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

# Run E2E tests
npm run test:e2e
```

For detailed setup, building, testing, and code standards, see the [**Full Contributing Guide**](https://ismaelmartinez.github.io/teams-for-linux/development/contributing).

## Additional Resources

- **[Building Guide](https://ismaelmartinez.github.io/teams-for-linux/development/contributing#building)** - Local, Docker, and Snap builds
- **[Testing Guide](https://ismaelmartinez.github.io/teams-for-linux/development/contributing#testing)** - E2E tests with Playwright
- **[Code Standards](https://ismaelmartinez.github.io/teams-for-linux/development/contributing#code-standards)** - Style guidelines and patterns
- **[Pull Request Guidelines](https://ismaelmartinez.github.io/teams-for-linux/development/contributing#pull-request-guidelines)** - PR requirements and checklist
- **[Release Process](https://ismaelmartinez.github.io/teams-for-linux/development/contributing#release-process)** - Version management and release notes
- **[Documentation](https://ismaelmartinez.github.io/teams-for-linux/)** - Full project documentation
