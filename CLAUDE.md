# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> [!NOTE]
> **For comprehensive documentation**, see the markdown files in `docs-site/docs/` directory. These files are the source for the [Teams for Linux Documentation Site](https://ismaelmartinez.github.io/teams-for-linux/). This file contains essential quick reference information and critical warnings specific to Claude Code workflows.
>
> **Important for AI agents**: Always read documentation from the local markdown files in `docs-site/docs/` rather than fetching from the web. The URLs are provided for human reference only.

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
- `npm run generate-ipc-docs` - Generate IPC API documentation from code comments

**Release:**
- `npm run release:prepare` - Prepare release (bundle changelogs, update versions)
- `npm run release:prepare -- --dry-run` - Preview release without making changes
- `npm run generate-release-notes` - Generate categorized release notes with doc links

## Project Architecture

Teams for Linux is an Electron-based desktop application that wraps the Microsoft Teams web app. The architecture follows a modular pattern with the main process coordinating various specialized modules.

**Key file locations:**
- **Entry Point:** `app/index.js` - Main Electron process (being refactored incrementally)
- **Startup:** `app/startup/` - Command line switches and initialization
- **Configuration:** `app/appConfiguration/` - Centralized configuration management
- **Main Window:** `app/mainAppWindow/` - Primary BrowserWindow and Teams web wrapper
- **Browser Tools:** `app/browser/tools/` - Client-side scripts injected into Teams interface

**For detailed architecture information**, see:
- Architecture Overview: `docs-site/docs/development/contributing.md` (Architecture Overview section)
- IPC API Documentation: `docs-site/docs/development/ipc-api.md`
- Module-specific README.md files in `app/` subdirectories

**Web references (for humans):**
- https://ismaelmartinez.github.io/teams-for-linux/development/contributing#architecture-overview
- https://ismaelmartinez.github.io/teams-for-linux/development/ipc-api

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
- Add a descriptive comment above each IPC channel registration
- Run `npm run generate-ipc-docs` after adding/modifying IPC channels
- All IPC channels must be added to the allowlist in `app/security/ipcValidator.js`

### Error Handling
- Robust error handling with try-catch in async functions
- Graceful degradation with clear user feedback
- Use `electron-log` for structured logging

### Logging Guidelines

**CRITICAL: PII Protection**

Never log Personally Identifiable Information (PII) in production code:

```javascript
// WRONG - logs PII
console.info(`Connecting to broker: ${brokerUrl}`);
console.debug(`User email: ${email}`);
console.error(`Auth failed for: ${username}`);

// CORRECT - no PII
console.info('[MQTT] Connecting to broker');
console.debug('[AUTH] Processing user authentication');
console.error('[AUTH] Authentication failed', { errorCode: err.code });
```

**Sensitive data that must NEVER be logged:**
- MQTT broker URLs, usernames, passwords, topics
- Email addresses, usernames, account IDs
- Authentication tokens, API keys, credentials
- Custom service URLs (customBackground, etc.)
- Certificate fingerprints and issuer details
- SSO/Intune account information
- URL query parameters (may contain tokens)

**Logging levels - use appropriately:**
- `console.error` - Errors requiring attention
- `console.warn` - Warnings about potential issues
- `console.info` - Key state changes (startup, connection established)
- `console.debug` - Development debugging only (use sparingly)

**When adding new logs:**
1. Ask: "Is this log necessary in production?"
2. Ask: "Could this log expose sensitive information?"
3. Prefer fewer, more meaningful logs over verbose debugging
4. Use structured data without PII: `{ status: 'connected', retryCount: 3 }`

**Debugging with PII (branch PRs only):**

If you need to log sensitive data for debugging during development:
1. Only add such logs in feature branch PRs
2. Mark them clearly: `// DEBUG-ONLY: Remove before merge`
3. Remove ALL debug logs with PII before the PR is merged
4. Never merge PII-containing logs to main branch

**For detailed logging research**, see `docs-site/docs/development/research/pii-log-removal-research.md`.

**For complete development patterns and guidelines**, see `docs-site/docs/development/contributing.md` ([web version](https://ismaelmartinez.github.io/teams-for-linux/development/contributing)).

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

**For full testing strategy**, see `docs-site/docs/development/research/automated-testing-strategy.md` ([web version](https://ismaelmartinez.github.io/teams-for-linux/development/research/automated-testing-strategy)).

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
- See `docs-site/docs/development/contributing.md` (Markdown Standards section) for comprehensive guidelines ([web version](https://ismaelmartinez.github.io/teams-for-linux/development/contributing#markdown-standards))
- Applies to documentation, README files, task lists, PRDs, and all markdown content

### Documentation Updates

When making code changes, update relevant documentation in the same PR:
- Module README.md files when changing functionality
- **IPC channels**: Add descriptive comments above registrations and run `npm run generate-ipc-docs`
- Configuration documentation for new options in `docs-site/docs/configuration.md`
- Architecture Decision Records (ADRs) for significant technical decisions in `docs-site/docs/development/adr/`

**Important for IPC changes:**
When adding or modifying IPC channels, you must:
1. Add a descriptive comment above the `ipcMain.handle()` or `ipcMain.on()` registration
2. Add the channel to the allowlist in `app/security/ipcValidator.js`
3. Run `npm run generate-ipc-docs` to update the auto-generated documentation
4. The auto-generated docs in `docs-site/docs/development/ipc-api-generated.md` should be committed with your changes

## Runtime Gotchas

### mainAppWindow Is a Module Wrapper

`mainAppWindow` (from `app/mainAppWindow/`) is NOT an Electron BrowserWindow. Call `mainAppWindow.getWindow()` to get the actual BrowserWindow before using methods like `isDestroyed()`, `show()`, `focus()`.

### commandChangeReportingService Event Filtering

When subscribing to `commandChangeReportingService.observeChanges()`, ALWAYS filter events to `["CommandStart", "ScenarioMarked"]` types with targets `["internal-command-handler", "use-command-reporting-callbacks"]`. Without this filter, navigation events (switching chats, opening calendar) will be misidentified as notifications. Do NOT create additional subscribers to this service — use `activityHub.js` as the single subscription point.

### Custom Notification System Architecture

Notification routing flows: `activityHub.js` (event detection) → `activityManager.js` (IPC routing) → `CustomNotificationManager` (toast display). The `window.Notification` override in `preload.js` handles browser-API notifications. Do NOT add separate observers/subscribers to Teams internal services — route everything through `activityHub.js` to avoid duplicate notifications.

## Critical Module Initialization Requirements

### Modules Requiring IPC Initialization (Issue #1902)

**CRITICAL: DO NOT REMOVE** - The `trayIconRenderer` and `mqttStatusMonitor` modules **MUST** be included in the list of modules that receive `ipcRenderer` during initialization in `app/browser/preload.js`.

```javascript
// REQUIRED: These modules need ipcRenderer for IPC communication
const modulesRequiringIpc = ["settings", "theme", "trayIconRenderer", "mqttStatusMonitor"];
if (modulesRequiringIpc.includes(module.name)) {
  moduleInstance.init(config, ipcRenderer);
}
```

**Why this is critical:**
- The `trayIconRenderer` module requires `ipcRenderer` to communicate with the main process for tray icon updates
- The `mqttStatusMonitor` module requires `ipcRenderer` to send Teams status changes to the main process for MQTT publishing
- Without these, tray icon functionality (badge counts, notifications) and MQTT status publishing break completely
- This fix has been accidentally removed multiple times in git history, causing recurring issues
- Most recently addressed in issue #1902

**When modifying preload.js:**
- Always verify `trayIconRenderer` and `mqttStatusMonitor` are in the condition that passes `ipcRenderer` to `init()`
- Do NOT remove these modules from the list, even if they seem redundant
- Test tray icon functionality and MQTT status publishing thoroughly after any changes to module initialization
- Reference this documentation if unclear why these modules need special handling

## AI Workflow Instructions

For AI agent workflows (PRD generation, task list generation, task execution):
- See `.github/instructions/*.instructions.md` for detailed workflow instructions
- Follow the task execution protocol for systematic implementation
- Always run tests and linting before commits
- Update documentation alongside code changes

### Responding to PR Review Comments

When a PR has review comments, address them proactively:

1. Fetch PR comments using `gh api repos/IsmaelMartinez/teams-for-linux/pulls/{PR_NUMBER}/comments`
2. For each actionable review comment (not automated bots like changelog, build artifacts, SonarQube):
   - Make the requested code changes
   - Commit and push the changes
3. Reply to the review by adding a PR comment summarizing all changes made, referencing the discussion IDs
4. Use `gh pr comment {PR_NUMBER} --body "..."` to post the summary

### Development Roadmap

**IMPORTANT:** The project maintains a development roadmap at `docs-site/docs/development/plan/roadmap.md`.

**Before starting work:**
- Check the roadmap to understand current priorities and feature status
- Verify the feature you're implementing aligns with the roadmap

**After implementing a feature (PR merged):**
- Update the roadmap to reflect the completed work
- Move completed features to appropriate sections or remove if fully done
- Update status indicators (Ready → Implemented, etc.)
- Add any new insights or follow-up work discovered during implementation

**Roadmap sections:**
- **Ready for Implementation** - Features with completed research, ready to build
- **User Feedback Received** - MVP shipped, user feedback identifies gaps to address
- **Requires Validation First** - Features needing spikes/validation before implementation
- **Stalled** - Work started but blocked (e.g., awaiting user validation)
- **Awaiting User Feedback** - Shipped features, waiting for requests before expanding
- **Not Planned / Not Feasible** - Rejected or infeasible features with rationale

## Important Notes

- The project is undergoing active refactoring to improve modularity
- New functionality should be placed in separate modules rather than `app/index.js`
- Browser scripts must be defensive as Teams DOM can change without notice
- Follow single responsibility principle for new modules
- Update module-specific README.md files when making changes
- Cross-platform compatibility is essential (Linux primary, Windows/macOS supported)

## Additional Resources

**Local documentation files (read these):**
- **Development Roadmap**: `docs-site/docs/development/plan/roadmap.md` - Future development priorities and feature status
- **Quick Reference Guide**: `docs-site/docs/quick-reference.md` - Fast access to commands, configs, and troubleshooting
- **Module Index**: `docs-site/docs/development/module-index.md` - Complete catalog of all application modules
- **ADR Index**: `docs-site/docs/development/adr/README.md` - Architecture decision records and rationale
- **Research Index**: `docs-site/docs/development/research/README.md` - Feature research and investigations
- **Full Contributing Guide**: `docs-site/docs/development/contributing.md`
- **Release Process**: `docs-site/docs/development/manual-release-process.md` - Release workflow with dry-run and categorized notes
- **Configuration Reference**: `docs-site/docs/configuration.md`
- **Troubleshooting Guide**: `docs-site/docs/troubleshooting.md`
- **IPC API Documentation**: `docs-site/docs/development/ipc-api.md`

**Web versions (for human reference):**
- https://ismaelmartinez.github.io/teams-for-linux/development/plan/roadmap
- https://ismaelmartinez.github.io/teams-for-linux/quick-reference
- https://ismaelmartinez.github.io/teams-for-linux/development/module-index
- https://ismaelmartinez.github.io/teams-for-linux/development/adr/
- https://ismaelmartinez.github.io/teams-for-linux/development/research/
- https://ismaelmartinez.github.io/teams-for-linux/development/contributing
- https://ismaelmartinez.github.io/teams-for-linux/configuration
- https://ismaelmartinez.github.io/teams-for-linux/troubleshooting
- https://ismaelmartinez.github.io/teams-for-linux/development/ipc-api
