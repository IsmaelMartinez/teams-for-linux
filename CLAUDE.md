# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

**Development:**
- `npm start` - Run application in development mode with trace warnings
- `npm run lint` - Run ESLint validation (mandatory before commits)
- `npm run test:e2e` - Run end-to-end tests with Playwright

**Building:**
- `npm run pack` - Development build without packaging
- `npm run dist:linux` - Build Linux packages (AppImage, deb, rpm, snap)
- `npm run dist` - Build all platforms using electron-builder

**Utility:**
- `npm run generate-release-info` - Generate release information file

## Project Architecture

Teams for Linux is an Electron-based desktop application that wraps the Microsoft Teams web app. The architecture follows a modular pattern with the main process coordinating various specialized modules.

### Core Structure

- **Entry Point:** `app/index.js` - Main Electron process (being refactored incrementally)
- **Startup:** `app/startup/` - Command line switches and initialization
- **Configuration:** `app/appConfiguration/` - Centralized configuration management
- **Main Window:** `app/mainAppWindow/` - Primary BrowserWindow and Teams web wrapper
- **Browser Tools:** `app/browser/tools/` - Client-side scripts injected into Teams interface

### Key Modules

- **IPC Communication:** Extensive IPC system for main-renderer communication (see `docs/ipc-api.md`)
- **Notifications:** System notification integration with custom sounds
- **Screen Sharing:** Desktop capture and stream selector functionality
- **Custom Backgrounds:** Custom background image management
- **Tray Integration:** System tray with status indicators
- **Cache Management:** Application cache handling
- **Authentication:** SSO login support
- **Audio Control:** Microphone auto-gain control disabling for professional audio setups

### State Management

Global state is managed through specific modules:
- User status tracking (`userStatus`, `idleTimeUserStatus`)
- Screen sharing state (`screenSharingActive`, `currentScreenShareSourceId`)
- Configuration managed via immutable AppConfiguration class

## Development Patterns

### Code Style Requirements
- **NO `var`** - Use `const` by default, `let` for reassignment
- **async/await** - Use instead of promise chains
- **Private fields** - Use JavaScript `#property` syntax for class private members
- **Arrow functions** - For concise callbacks

### Configuration Management
- All configuration handled through `AppConfiguration` class
- Treat config as immutable after startup
- Changes via AppConfiguration methods only

### IPC Communication
- Use `ipcMain.handle` for request-response patterns
- Use `ipcMain.on` for fire-and-forget notifications  
- Document all new IPC channels in `docs/ipc-api.md`

### Error Handling
- Robust error handling with try-catch in async functions
- Graceful degradation with clear user feedback
- Use `electron-log` for structured logging

## Testing and Quality

### Automated Testing

The project uses Playwright for end-to-end testing:
- **Framework**: Playwright with Electron support
- **Test Location**: `tests/e2e/`
- **Run Tests**: `npm run test:e2e`
- **Clean State**: Tests use temporary userData directories for isolation

**E2E Testing Patterns:**
- Each test creates a unique temp directory via `E2E_USER_DATA_DIR`
- Tests start with completely clean state (no cookies, cache, storage)
- Validates complete app launch flow and Microsoft login redirect
- See `docs-site/docs/development/research/automated-testing-strategy.md` for full strategy

### Quality Checks

When contributing:
- Run `npm run lint` before commits (ESLint with custom config)
- Run `npm run test:e2e` to verify E2E tests pass
- Ensure cross-platform compatibility (Linux primary, Windows/macOS supported)

## Documentation Deployment

The project documentation has been migrated to Docusaurus and is deployed to GitHub Pages via GitHub Actions.

- **Platform**: Docusaurus 3.9.1
- **URL**: https://ismaelmartinez.github.io/teams-for-linux/
- **Deployment Method**: GitHub Actions to GitHub Pages
- **Search**: Client-side local search using [@easyops-cn/docusaurus-search-local](https://github.com/easyops-cn/docusaurus-search-local)
- **Features**: Enhanced search, improved navigation, rich content support (including Mermaid diagrams), mobile-first design, and dark/light theme support

For detailed documentation development instructions, see [docs-site/README.md](docs-site/README.md).

## Critical Module Initialization Requirements

### TrayIconRenderer IPC Initialization (Issue #1902)

**CRITICAL: DO NOT REMOVE** - The `trayIconRenderer` module **MUST** be included in the list of modules that receive `ipcRenderer` during initialization in `app/browser/preload.js`.

```javascript
// REQUIRED: trayIconRenderer needs ipcRenderer for IPC communication
if (module.name === "settings" || module.name === "theme" || module.name === "trayIconRenderer") {
  moduleInstance.init(config, ipcRenderer);
}
```

**Why this is critical:**
- The trayIconRenderer module requires `ipcRenderer` to communicate with the main process for tray icon updates
- Without it, tray icon functionality breaks completely (badge counts, notifications, etc.)
- This fix has been accidentally removed multiple times in git history, causing recurring issues
- Most recently addressed in issue #1902

**When modifying preload.js:**
- Always verify `trayIconRenderer` is in the condition that passes `ipcRenderer` to `init()`
- Do NOT remove this module from the list, even if it seems redundant
- Test tray icon functionality thoroughly after any changes to module initialization
- Reference this documentation if unclear why this module needs special handling

## Important Notes

- The project is undergoing active refactoring to improve modularity
- New functionality should be placed in separate modules rather than `app/index.js`
- Browser scripts must be defensive as Teams DOM can change without notice
- Follow single responsibility principle for new modules
- Update module-specific README.md files when making changes