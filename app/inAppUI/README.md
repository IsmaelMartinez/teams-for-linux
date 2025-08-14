# In-App UI Module

This module manages additional UI windows that enhance the Teams for Linux experience, including call popout windows and general in-app UI components.

## Components

### Call Popout Window
- **Purpose**: Creates a floating thumbnail window for active calls and screen sharing
- **Features**: 
  - Resizable and movable window
  - Always-on-top option
  - Automatic cleanup when sharing stops
  - Size constraints for optimal display

### In-App UI Window
- **Purpose**: General-purpose UI window for application features
- **Features**: Configurable dimensions and behavior

## Key Functions

### `createCallPopOutWindow(config)`
Creates a call popout window with the specified configuration.

**Parameters:**
- `config` - Application configuration object

**Window Properties:**
- Default size: 320x180 pixels
- Minimum size: 200x120 pixels
- Always on top: Based on config setting
- Partition: `persist:teams-for-linux-session`

### `closeCallPopOutWindow()`
Safely closes the call popout window and cleans up resources.

### `createInAppUIWindow(config)`
Creates a general in-app UI window.

**Parameters:**
- `config` - Application configuration object

## IPC Communication

### Handled Events
- `close-call-pop-out-window` - Closes the call popout window
- `resize-call-pop-out-window` - Resizes the call popout window with constraints
- `close-in-app-ui-window` - Closes the in-app UI window

### Provided APIs (via preload)
- `createCallPopOutWindow()` - Creates a call popout window
- `closeWindow()` - Closes the current window

## Integration

The module integrates with:
- **Screen Sharing**: Automatically creates popout window when sharing starts
- **Call Management**: Provides thumbnail view during calls
- **Configuration**: Respects user preferences for window behavior

## Files

- `index.js` - Main module logic and window creation
- `callPopOut.html` - Call popout window template
- `callPopOutPreload.js` - Preload script for call popout window
- `inAppUI.html` - General in-app UI template
- `inAppUI.css` - Styling for in-app UI components
- `preload.js` - Preload script for in-app UI window

## Configuration

The module respects the following configuration options:
- `alwaysOnTop` - Whether popout windows should stay on top
- `enableInAppUI` - Whether to enable general in-app UI features