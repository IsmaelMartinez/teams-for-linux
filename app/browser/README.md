# Browser Module

Handles browser-side code injection and communication with the Teams web interface.

## Structure

- **[index.js](index.js)**: Entry point for browser integration
- **[notifications/](notifications/)**: Activity monitoring and unread count management
- **[tools/](tools/)**: Client-side scripts injected into Teams interface
- **[preload.js](preload.js)**: Preload script for secure IPC communication. Reads an optional `--tfl-window-role=<role>` from `webPreferences.additionalArguments` (default `main`, [ADR-032](../../docs-site/docs/development/adr/032-secondary-window-for-calls.md)): outside the main window it skips the tools that must run once per app (`MAIN_WINDOW_ONLY_MODULES`: tray and dock badges, MQTT status, meeting-start detector) and the title observer, keeps the `window.Notification` override but makes it suppress everything, and starts `ActivityManager` with `forwardIncomingCalls: false` so only the main window reports incoming calls

## Key Features

- Notification count tracking and tray icon updates
- Custom CSS injection
- Browser API patching for enhanced functionality
- Activity monitoring for status updates
- Microphone auto-gain control disabling
- Screen sharing stream management
- Keyboard shortcuts and zoom controls
