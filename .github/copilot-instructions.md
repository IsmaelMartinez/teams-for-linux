# GitHub Copilot Instructions for Teams for Linux

## Project Overview

Teams for Linux is an Electron-based desktop application that wraps the Microsoft Teams web app, providing a native desktop experience for Linux users. The app enhances the web version with features like custom CSS, custom backgrounds, system notifications, and deep integration with the desktop environment.

## Project Vision & Refactoring Goals

The project is currently undergoing a strategic effort to improve its architecture, maintainability, and developer experience. Key goals include:

- **Increased Modularity:** Refactoring the monolithic `app/index.js` into smaller, single-responsibility modules (e.g., for IPC handling, command-line parsing, notification management).
- **Modernization:** Adopting modern JavaScript features (`async/await`, `const`/`let`) and simplifying patterns (e.g., class private fields).
- **Robustness:** Implementing comprehensive error handling, structured logging, and centralized state management.
- **Testability:** Introducing a formal testing framework to build a suite of unit and integration tests.
- **Clarity:** Enhancing documentation across all levels of the project.

When contributing, please align your changes with these goals.

## Architecture & Key Components

### Main Application Structure

- **Entry Point**: `app/index.js` - Main Electron process. **Note:** This file is being actively refactored. New functionalities should be placed in separate, dedicated modules rather than being added here directly.
- **Configuration**: `app/appConfiguration/` - Centralized configuration management. See `docs/configuration.md` for a detailed breakdown of all options.
- **Main Window**: `app/mainAppWindow/` - Manages the main `BrowserWindow` and the Teams web app wrapper.
- **Browser Tools**: `app/browser/tools/` - Client-side scripts injected into the Teams web interface.

### Key Documentation

- **Architecture Diagrams**: See `docs/architecture/` for visual overviews of the system.
- **Configuration Details**: See `docs/configuration.md`.
- **IPC API**: See `docs/ipc-api.md` for a list of all IPC channels.
- **Module-specific READMEs**: Each subdirectory in `app/` should have a `README.md` explaining its purpose and interactions.

## Development Patterns

### Configuration Management

- All configuration is managed through the `AppConfiguration` class.
- **Guiding Principle:** Treat the configuration object as immutable after startup. Changes should be managed via methods within `AppConfiguration` to ensure consistency.
- For class properties, prefer standard JavaScript private fields (`#property`) over `WeakMap` for simplicity and readability.

### State Management

- Avoid using global variables.
- For state shared between modules (e.g., `userStatus`, `aboutBlankRequestCount`), create or use a dedicated state management module to provide controlled access and modification methods.

### Event Communication (IPC)

- **Current State:** IPC is handled via `ipcMain.on` and `ipcMain.handle` calls, primarily in `app/index.js`.
- **Future Direction:** We are moving towards a centralized event bus or IPC abstraction layer to improve structure and maintainability. New IPC channels should be well-documented in `docs/ipc-api.md`.

### Modern JavaScript Practices

- **`var` is disallowed.** Use `const` by default and `let` only when a variable must be reassigned.
- Use `async/await` for all asynchronous operations instead of promise chains (`.then()`).
- Use arrow functions for concise callbacks.

### Error Handling & Logging

- Implement a robust error handling strategy using `try-catch` blocks in `async` functions.
- Aim for graceful degradation and provide clear user feedback for errors.
- Use `electron-log` for structured logging. Ensure log levels are used consistently and avoid logging sensitive information.

## Documentation

- **A Core Responsibility:** Documentation is not an afterthought; it is a core part of the development process.
- **Update as You Go:** When you make a code change, update the relevant documentation in the same pull request.
- **Module READMEs:** Ensure the `README.md` in the module you are working on is up-to-date.
- **Code Comments:** Add comments sparingly. Focus on the *why* behind complex, non-obvious, or unusual code, not the *what*. Use JSDoc for public APIs.
- **Central Docs:** For changes affecting configuration, IPC, or overall architecture, update the corresponding documents in the `/docs` directory.

## Build & Development

### Key Commands

```bash
npm start              # Development mode with trace warnings
npm run lint          # ESLint validation
npm run dist:linux    # Build Linux packages (AppImage, deb, rpm, snap)
npm run pack          # Development build without packaging
```

### Build Configuration

- **electron-builder** config in `package.json` under the `"build"` section.
- Release process is automated via GitHub Actions (`.github/workflows/build.yml`).

## Testing & Quality

- **Linting**: ESLint with custom config (`eslint.config.mjs`) is mandatory.
- **Security**: Snyk and CodeQL for vulnerability scanning.
- **CI/CD**: GitHub Actions for build validation and releases.
- **Unit & Integration Testing**: The project currently lacks sufficient test coverage. A key goal is to introduce a testing framework (e.g., Jest) and build out a comprehensive test suite. Contributions in this area are highly encouraged.

## Common Patterns

- **Single Instance**: The app uses `app.requestSingleInstanceLock()` to ensure only one instance is running.
- **Command Line Switches**: The app processes various command-line switches. Logic for this is being centralized from `app/index.js` into a dedicated module.
- **Defensive Coding:** Browser scripts should be written defensively, as the Teams web app DOM can change without notice.

## External Dependencies

- **Core**: Electron, electron-builder
- **System**: @homebridge/dbus-native (Linux desktop integration)
- **Storage**: electron-store (persistent configuration)
- **Audio**: node-sound (optional, for notification sounds)

When working on this codebase, always consider cross-platform compatibility and the fact that the Teams web interface can change independently of this application.
