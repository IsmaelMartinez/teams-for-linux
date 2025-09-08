# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

**Development:**
- `npm start` - Run application in development mode with trace warnings
- `npm run lint` - Run ESLint validation (mandatory before commits)

**Building:**
- `npm run pack` - Development build without packaging
- `npm run dist:linux` - Build Linux packages (AppImage, deb, rpm, snap)
- `npm run dist` - Build all platforms using electron-builder

**Utility:**
- `npm run generate-release-info` - Generate release information file

## Project Architecture

Teams for Linux is an Electron-based desktop application that wraps the Microsoft Teams web app. The architecture follows a modular pattern with the main process coordinating various specialized modules.

### Core Structure

- **Entry Point:** `app/index.js` - Main Electron process (currently being refactored into smaller modules)
- **Configuration:** `app/appConfiguration/` - Centralized configuration management using AppConfiguration class
- **Main Window:** `app/mainAppWindow/` - Manages the primary BrowserWindow and Teams web wrapper
- **Browser Tools:** `app/browser/tools/` - Client-side scripts injected into Teams interface

### Key Modules

- **IPC Communication:** Extensive IPC system for main-renderer communication (see `docs/ipc-api.md`)
- **Notifications:** System notification integration with custom sounds
- **Screen Sharing:** Desktop capture and stream selector functionality
- **Custom Backgrounds:** Custom background image management
- **Tray Integration:** System tray with status indicators
- **Cache Management:** Application cache handling
- **Authentication:** SSO login support

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

The project currently lacks comprehensive test coverage. When contributing:
- Run `npm run lint` before commits (ESLint with custom config)
- Consider adding tests using a framework like Jest
- Ensure cross-platform compatibility (Linux primary, Windows/macOS supported)

## Documentation Deployment

The project documentation is currently undergoing a major enhancement and migration to Docusaurus. Once complete, it will be deployed to GitHub Pages via GitHub Actions.

- **Future Platform**: Docusaurus
- **Deployment Method**: GitHub Actions to GitHub Pages
- **Benefits**: Enhanced search, improved navigation, rich content support (including Mermaid diagrams), and a mobile-first design.

## Important Notes

- The project is undergoing active refactoring to improve modularity
- New functionality should be placed in separate modules rather than `app/index.js`
- Browser scripts must be defensive as Teams DOM can change without notice
- Follow single responsibility principle for new modules
- Update module-specific README.md files when making changes