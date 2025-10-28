# Documentation Window Module

## Overview

The Documentation Window module provides in-app access to the Teams for Linux documentation hosted at https://ismaelmartinez.github.io/teams-for-linux/.

## Features

- Opens documentation in a separate window with an iframe
- Singleton pattern - only one documentation window can be open at a time
- Accessible via the Help menu
- Secure iframe implementation with proper sandboxing
- Loading indicator while documentation loads
- Cross-platform compatible

## Usage

The documentation window is automatically initialized when the Menus class is instantiated. Users can access it via:

1. **Menu**: Help > Teams for Linux Documentation

## Implementation Details

### Files

- `index.js` - Main module that manages the BrowserWindow
- `documentation.html` - HTML page containing the iframe with the documentation site
- `README.md` - This file

### Security

The documentation window uses:
- `nodeIntegration: false` - Prevents Node.js integration
- `contextIsolation: true` - Isolates context from the main app
- `sandbox: true` - Runs in a sandboxed environment
- `webSecurity: true` - Enables web security features
- Content Security Policy in the HTML to restrict resource loading

### Window Management

- Single instance pattern: If the window is already open, it will be focused instead of creating a new instance
- Auto-hides menu bar for cleaner interface
- Minimum window size: 800x600
- Default window size: 1200x800

## Integration

The module is integrated into the application through the Menus class in `app/menus/index.js`:

```javascript
const DocumentationWindow = require('../documentationWindow');

class Menus {
  constructor(window, configGroup, iconPath) {
    // ...
    this.documentationWindow = new DocumentationWindow();
    // ...
  }

  showDocumentation() {
    this.documentationWindow.show();
  }
}
```

## Future Enhancements

Potential improvements could include:
- Offline documentation caching
- Deep linking to specific documentation pages
- Theme synchronization with the main app
- Documentation search integration
