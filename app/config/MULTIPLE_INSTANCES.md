# Running Multiple Instances (Profiles) of Teams for Linux

You can run multiple isolated instances of the app — useful for switching
between personal and work Teams accounts. Each profile can have its own icon,
session, and window behavior.

## Example

```bash
./teams-for-linux --appIcon=/path/to/work-icon.png --class=teams-work --user-data-dir=~/.config/teams-profile-work

./teams-for-linux --appIcon=/path/to/personal-icon.png --class=teams-personal --user-data-dir=~/.config/teams-profile-personal
```

## --appIcon

Use --appIcon to set a custom tray and window icon:

```bash
--appIcon=/path/to/icon.png
```

This changes the visual icon used in the title bar and system tray/dock.

## --class

Use --class to
[set a the internal name used by electron](https://www.electronjs.org/docs/latest/api/app#appsetnamename)

```bash
--class=teams-work
```

This is important when:

- Running multiple instances side-by-side
- Using multiple .desktop launchers (e.g., “Teams – Work”, “Teams – Personal”)
- Ensuring the correct icon is shown in GNOME/KDE docks or the taskbar
- Applying custom window manager rules (i3, sway, awesome, etc.)

## Creating Desktop Shortcuts

To simplify launching, create .desktop files like:

```bash
[Desktop Entry]
Name=Teams (Work)
Exec=/path/to/teams-for-linux --appIcon=/path/to/work-icon.png --class=teams-work --user-data-dir=~/.config/teams-profile-work
Icon=/path/to/work-icon.png
StartupWMClass=teams-work
Type=Application
Terminal=false
Comment=Unofficial Microsoft Teams client for Linux using Electron. It uses the Web App and wraps it as a standalone application using Electron.
MimeType=x-scheme-handler/msteams;
Categories=Chat;Network;Office;
```

> **Note** that the values of `--class` and `StartupWMClass` are the same, which
> makes the task bar icons work properly.

Repeat for other profiles with unique paths, icons, and class names.
