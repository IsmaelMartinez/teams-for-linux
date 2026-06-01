# Quick Reference

This quick reference is a condensed cheat-sheet for the most common commands, the configuration file location, key options, and troubleshooting entry points for Teams for Linux. Each item links to the fuller documentation page for detail.

## Common Commands

Development and build commands, run from the repository root:

| Command | What it does |
|---------|--------------|
| `npm start` | Run the app in development mode (with `--trace-warnings`) |
| `npm run lint` | Run ESLint validation (required before commits) |
| `npm run test:e2e` | Run the Playwright end-to-end tests |
| `npm run pack` | Development build without packaging (`electron-builder --dir`) |
| `npm run dist:linux` | Build Linux packages (AppImage, deb, rpm, snap) |
| `npm run dist` | Build all configured platforms |
| `npm run generate-ipc-docs` | Regenerate the IPC API docs after changing an IPC channel |
| `npm run generate-release-info` | Regenerate the release information file |

See [Contributing](development/contributing.md) for the full development workflow.

## Configuration File Location

User configuration lives in a `config.json` whose path depends on how the app was installed:

| Install type | Path |
|--------------|------|
| Vanilla (deb / rpm / AppImage) | `~/.config/teams-for-linux/config.json` |
| Snap | `~/snap/teams-for-linux/current/.config/teams-for-linux/config.json` |
| Flatpak | `~/.var/app/com.github.IsmaelMartinez.teams_for_linux/config/teams-for-linux/config.json` |

A system-wide file at `/etc/teams-for-linux/config.json` is also read, with the user file taking precedence. See [Configuration Options](configuration.md) for the complete list of options, types, and defaults.

## Frequently Used Options

Common options and what they control. Names link to the full reference for current types and defaults:

| Option | Purpose |
|--------|---------|
| `disableGpu` | Turn GPU/hardware acceleration off. On Wayland the app already disables the GPU by default, so set this to `false` to force it back on; the main lever for blank-window and rendering issues |
| `notificationMethod` | Choose how notifications are delivered: `web`, `electron`, or `custom` |
| `closeAppOnCross` | Quit the app on window close instead of minimising to tray |
| `trayIconEnabled` | Show or hide the system tray icon |
| `emulateWinChromiumPlatform` | Present a Windows Chromium user agent (workaround for Teams gating features by platform) |
| `proxyServer` | Route traffic through a proxy in `address:port` form |

For every option, including the ones not listed here, see [Configuration Options](configuration.md).

## Troubleshooting Quick Links

Jump straight to the most common fixes in the [Troubleshooting Guide](troubleshooting.md):

| Symptom | Section |
|---------|---------|
| Blank or black window on Wayland | [Wayland / Display Issues](troubleshooting.md#wayland--display-issues) |
| Screen sharing not working | [Screen Sharing](screen-sharing.md) |
| Notifications missing or disappearing | [Notifications](troubleshooting.md#notifications) |
| Microsoft login or SSO problems | [Intune / SSO](intune-sso.md) |
| Custom background not applying | [Custom Backgrounds](custom-backgrounds.md) |
