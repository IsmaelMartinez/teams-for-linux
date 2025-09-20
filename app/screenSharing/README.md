# Stream Selector Module

The Stream Selector module provides the native screen/window selection interface for screen sharing in Teams for Linux. It creates a modal dialog that allows users to choose which screen or application window to share during Teams meetings.

## Overview

This module bridges the gap between Teams' web-based screen sharing requests and the native desktop capture capabilities provided by Electron's `desktopCapturer` API. It ensures a smooth user experience while maintaining security through proper permission handling.

## Architecture

```mermaid
flowchart TD
    subgraph "Main Process"
        A[setDisplayMediaRequestHandler] --> B[StreamSelector.show()]
        B --> C[BrowserWindow Creation]
        C --> D[Load Selection UI]
        D --> E[desktopCapturer.getSources()]
        E --> F[Display Sources to User]
    end
    
    subgraph "Stream Selector Window"
        F --> G[User Interface]
        G --> H[Source Thumbnails]
        H --> I[User Selection]
        I --> J[IPC: source-selected]
    end
    
    subgraph "Callback Flow"
        J --> K[Callback Resolution]
        K --> L[Window Cleanup]
        L --> M[Return to Teams]
    end
    
    style G fill:#e3f2fd
    style I fill:#c8e6c9
    style L fill:#ffcdd2
```

## Key Components

### Files Structure

- **[index.js](index.js)** - Main StreamSelector class and window management
- **[browser.js](browser.js)** - Renderer process logic for UI interactions  
- **[preload.js](preload.js)** - Context bridge for secure IPC communication
- **[index.html](index.html)** - User interface template with source grid
- **[index.css](index.css)** - Styling for the selection interface

### StreamSelector Class

The main class provides a simple interface for displaying the source selection dialog:

```javascript
const streamSelector = new StreamSelector(parentWindow);

// Show source selector and get user choice
streamSelector.show((selectedSource) => {
  if (selectedSource) {
    console.log('User selected:', selectedSource.name);
    // Use selectedSource.id for screen capture
  } else {
    console.log('User cancelled selection');
  }
});
```

### Window Lifecycle

```mermaid
sequenceDiagram
    participant M as Main Process
    participant S as StreamSelector
    participant W as Selector Window
    participant U as User
    
    M->>S: show(callback)
    S->>S: Create BrowserWindow
    S->>W: Load index.html
    W->>W: Get desktop sources
    W->>U: Display source grid
    
    alt User selects source
        U->>W: Click on source
        W->>S: IPC: source-selected
        S->>S: Execute callback(source)
    else User cancels
        U->>W: Close window/Cancel
        W->>S: IPC: source-selected (null)
        S->>S: Execute callback(null)
    end
    
    S->>W: Close window
    W->>W: Cleanup resources
```

## Implementation Details

### Security Features

⚠️ **Note**: As of v2.6+, security configuration has been modified for Teams DOM access:
- **Context Isolation**: **Disabled** to enable Teams DOM access functionality
- **Node Integration**: **Enabled** for browser tools functionality
- **Preload Script**: Direct window object exposure (no contextBridge)
- **Sandboxing**: **Disabled** to enable system API access

### Desktop Source Detection

The module uses Electron's `desktopCapturer.getSources()` to enumerate available sources:

```javascript
// Get all available screens and windows
const sources = await desktopCapturer.getSources({
  types: ['window', 'screen'],
  thumbnailSize: { width: 300, height: 200 }
});
```

Source types include:
- **Screen**: Full desktop/monitor capture
- **Window**: Individual application window capture

### User Interface Features

- **Live Thumbnails**: Preview of each available source
- **Source Information**: Display name and type for each option
- **Responsive Grid**: Adapts to different numbers of sources
- **Keyboard Navigation**: Arrow keys and Enter/Escape support
- **Click Selection**: Mouse interaction for source selection

### IPC Communication Pattern

```mermaid
flowchart LR
    subgraph "Renderer Process"
        A[User Interaction] --> B[Preload Script]
        B --> C[contextBridge API]
    end
    
    subgraph "Main Process"
        C --> D[IPC Handler]
        D --> E[StreamSelector Class]
        E --> F[Callback Execution]
    end
    
    style C fill:#e8f5e8
    style E fill:#e3f2fd
```

## Integration with Screen Sharing

The StreamSelector integrates with the broader screen sharing system through:

1. **Trigger**: `setDisplayMediaRequestHandler` in main window manager
2. **Selection**: StreamSelector handles user choice
3. **Result**: Selected source passed to screen sharing pipeline
4. **Cleanup**: Window closes and resources are freed

### Relationship to Other Modules

- **Main App Window**: Registers the display media request handler
- **Screen Sharing Logic**: Consumes the selected source for capture
- **Popup Window**: Created after source selection for thumbnail display
- **IPC System**: Facilitates secure communication between processes

## Configuration

No direct configuration options, but behavior is influenced by:

- **Screen sharing settings**: Whether thumbnails are enabled
- **System permissions**: Desktop capture access
- **Display settings**: Available screens and resolution

## Error Handling

### Common Scenarios

- **No sources available**: Shows appropriate message to user
- **Permission denied**: Handles desktop capture permission errors  
- **Window creation failure**: Graceful fallback to callback with null
- **User cancellation**: Properly cleans up and reports null selection

## Platform Differences

### Linux
- **X11**: Direct screen capture support
- **Wayland**: Uses PipeWire portal for desktop capture

### macOS  
- **Screen Recording Permission**: Required for desktop capture
- **Retina Displays**: High-DPI thumbnail generation

### Windows
- **DWM Integration**: Desktop Window Manager compatibility
- **Multi-monitor**: Proper handling of multiple displays

---

For more information about the complete screen sharing implementation, see [Screen Sharing Documentation](../../docs-site/docs/screen-sharing.md).