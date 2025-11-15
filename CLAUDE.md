# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> [!NOTE]
> **For comprehensive documentation**, see the [Teams for Linux Documentation Site](https://ismaelmartinez.github.io/teams-for-linux/). This file contains essential quick reference information and critical warnings specific to Claude Code workflows.

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

**Key file locations:**
- **Entry Point:** `app/index.js` - Main Electron process (currently being refactored - avoid adding new code here)
- **Configuration:** `app/appConfiguration/` - Centralized configuration management
- **Main Window:** `app/mainAppWindow/` - Manages the primary BrowserWindow and Teams web wrapper
- **Browser Tools:** `app/browser/tools/` - Client-side scripts injected into Teams interface

**For detailed architecture information**, see:
- [Architecture Overview](https://ismaelmartinez.github.io/teams-for-linux/development/contributing#architecture-overview)
- [IPC API Documentation](https://ismaelmartinez.github.io/teams-for-linux/development/ipc-api)
- Module-specific README.md files in `app/` subdirectories

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
- Document all new IPC channels in `docs-site/docs/development/ipc-api.md`

### Error Handling
- Robust error handling with try-catch in async functions
- Graceful degradation with clear user feedback
- Use `electron-log` for structured logging

**For complete development patterns and guidelines**, see the [Contributing Guide](https://ismaelmartinez.github.io/teams-for-linux/development/contributing).

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

**For full testing strategy**, see [Automated Testing Strategy](https://ismaelmartinez.github.io/teams-for-linux/development/research/automated-testing-strategy).

### Quality Checks

When contributing:
- Run `npm run lint` before commits (ESLint with custom config)
- Run `npm run test:e2e` to verify E2E tests pass
- Ensure cross-platform compatibility (Linux primary, Windows/macOS supported)

## Documentation

### Documentation Site

The project documentation is built with Docusaurus and deployed to GitHub Pages:
- **URL**: https://ismaelmartinez.github.io/teams-for-linux/
- **Platform**: Docusaurus 3.9.1
- **Local Development**: `cd docs-site && npm run start`
- **Deployment**: Automated via GitHub Actions

**For documentation development**, see [docs-site/README.md](docs-site/README.md).

### Markdown Standards

**All markdown files in this project** should follow the project's markdown standards:
- See [Markdown Standards](https://ismaelmartinez.github.io/teams-for-linux/development/contributing#markdown-standards) for comprehensive guidelines
- Applies to documentation, README files, task lists, PRDs, and all markdown content

### Documentation Updates

When making code changes, update relevant documentation in the same PR:
- Module README.md files when changing functionality
- IPC API documentation for new channels in `docs-site/docs/development/ipc-api.md`
- Configuration documentation for new options in `docs-site/docs/configuration.md`
- Architecture Decision Records (ADRs) for significant technical decisions in `docs-site/docs/development/adr/`

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

## AI Workflow Instructions

For AI agent workflows (PRD generation, task list generation, task execution):
- See `.github/instructions/*.instructions.md` for detailed workflow instructions
- Follow the task execution protocol for systematic implementation
- Always run tests and linting before commits
- Update documentation alongside code changes

## Important Notes

- The project is undergoing active refactoring to improve modularity
- New functionality should be placed in separate modules rather than `app/index.js`
- Browser scripts must be defensive as Teams DOM can change without notice
- Follow single responsibility principle for new modules
- Update module-specific README.md files when making changes
- Cross-platform compatibility is essential (Linux primary, Windows/macOS supported)

## Additional Resources

- **Full Contributing Guide**: https://ismaelmartinez.github.io/teams-for-linux/development/contributing
- **Configuration Reference**: https://ismaelmartinez.github.io/teams-for-linux/configuration
- **Troubleshooting Guide**: https://ismaelmartinez.github.io/teams-for-linux/troubleshooting
- **IPC API Documentation**: https://ismaelmartinez.github.io/teams-for-linux/development/ipc-api
