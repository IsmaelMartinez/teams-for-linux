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

**Choose App Icon…** stores the picked PNG as `tray.icon` and applies it to the window, tray and macOS dock.

After a choice, on Linux outside Snap and Flatpak, a prompt asks whether to also use it for the taskbar and launcher; the answer is reflected in the **Also use it for the taskbar and launcher** checkbox, which can be changed at any time. When on, the app writes the current icon at every hicolor size to `$XDG_DATA_HOME/icons/hicolor/<size>x<size>/apps/<name>.png`, touches the theme directory and sends `org.kde.KIconLoader.iconChanged`, so the taskbar and launcher follow on the next start (some desktops after a new login). Unticking removes the files again. `<name>` is the `Icon=` of the desktop entry the shell matches this window to: a profile launcher by `StartupWMClass` matching `window.class` (see the multiple instances guide), otherwise `teams-for-linux.desktop`, otherwise the entry whose `Exec` runs this binary. Sizes are written to temp names and renamed only once all succeed, so a failed replacement keeps the previous set. The written paths are recorded per icon name in `$XDG_DATA_HOME/teams-for-linux/theme-icon.json`; removal deletes exactly those files, so hand-placed icons and other profiles' icons are left alone. The files live outside the package and survive an uninstall; untick before removing the app to clean them up.

**Reset to default** removes the theme files along with the custom icon.
