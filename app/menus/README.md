# Menus Module

Manages application and system tray menus.

## Menu Types

- **Application Menu**: Press `Alt` to access while app is focused
- **System Tray**: Right-click tray icon for context menu

## Components

- **[index.js](index.js)**: Entry point, loads menu definitions
- **[appMenu.js](appMenu.js)**: Application menu structure (shared with tray)
- **[tray.js](tray.js)**: System tray implementation and menu
- **[themeIcon.js](themeIcon.js)**: Copies a chosen app icon into the user icon theme (Linux only)

## App Icon

**Choose App Icon…** stores the picked PNG as `tray.icon` and applies it to the window, tray and macOS dock. On Linux, outside Snap and Flatpak, it also writes the image at every hicolor size to `$XDG_DATA_HOME/icons/hicolor/<size>x<size>/apps/<name>.png`, touches the theme directory and sends `org.kde.KIconLoader.iconChanged`, so the taskbar and launcher follow on the next start (some desktops after a new login). `<name>` is the `Icon=` of the desktop entry the shell matches this window to: a profile launcher by `StartupWMClass` (see the multiple instances guide), otherwise `teams-for-linux.desktop`, otherwise the entry whose `Exec` runs this binary. The written paths are recorded in `$XDG_DATA_HOME/teams-for-linux/theme-icon.json`; **Reset to default** removes exactly those files and nothing else. A hand-placed icon under the same name is overwritten by a choice and left alone by a reset.
