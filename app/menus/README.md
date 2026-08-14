# Menus Module

Manages application and system tray menus.

## Menu Types

- **Application Menu**: Press `Alt` to access while app is focused
- **System Tray**: Right-click tray icon for context menu

## Components

- **[index.js](index.js)**: Entry point, loads menu definitions
- **[appMenu.js](appMenu.js)**: Application menu structure (shared with tray)
- **[accountsMenu.js](accountsMenu.js)**: Accounts submenu for concurrent instances (ADR-027)
- **[profilesMenu.js](profilesMenu.js)**: Profiles submenu for the in-window switcher (ADR-020)
- **[tray.js](tray.js)**: System tray implementation and menu
