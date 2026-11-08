# Browser Module

Handles browser-side code injection and communication with the Teams web interface.

## Structure

- **[preload.js](preload.js)**: Preload script for the Teams window; loads the tools below once on the trusted `DOMContentLoaded` and exposes the narrow `electronAPI` to the page (see [ADR-035](../../docs-site/docs/development/adr/035-renderer-trust-boundary.md))
- **[notifications/](notifications/)**: Activity monitoring and unread count management
- **[tools/](tools/)**: Client-side scripts injected into Teams interface

## Key Features

- Notification count tracking and tray icon updates
- Custom CSS injection
- Browser API patching for enhanced functionality
- Activity monitoring for status updates
- Microphone auto-gain control disabling
- Screen sharing stream management
- Keyboard shortcuts and zoom controls
