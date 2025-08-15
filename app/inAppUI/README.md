# In-App UI Module

This module manages additional UI windows that enhance the Teams for Linux experience.

## Components

### In-App UI Window
- **Purpose**: General-purpose UI window for application features
- **Features**: Configurable dimensions and behavior

## Key Functions

### `createInAppUIWindow(config)`
Creates a general in-app UI window.

**Parameters:**
- `config` - Application configuration object

## IPC Communication

### Handled Events
- `close-in-app-ui-window` - Closes the in-app UI window

### Provided APIs (via preload)
- `closeWindow()` - Closes the current window

## Integration

The module provides general UI window functionality for the application.

## Files

- `index.js` - Main module logic and window creation
- `inAppUI.html` - General in-app UI template
- `inAppUI.css` - Styling for in-app UI components
- `preload.js` - Preload script for in-app UI window

## Configuration

The module respects the following configuration options:
- `enableInAppUI` - Whether to enable general in-app UI features