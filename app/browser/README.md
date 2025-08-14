# Browser Module

Handles browser-side code injection and communication with the Teams web interface.

## Structure

- **[index.js](index.js)**: Entry point for browser integration
- **[notifications/](notifications/)**: Activity monitoring and unread count management
- **[tools/](tools/)**: Client-side scripts injected into Teams interface
- **[preload.js](preload.js)**: Preload script for secure IPC communication

## Key Features

- Notification count tracking and tray icon updates
- Custom CSS injection
- Browser API patching for enhanced functionality
- Activity monitoring for status updates
