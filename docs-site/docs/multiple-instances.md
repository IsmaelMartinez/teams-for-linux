# Multiple Instances (Profiles)

Run separate isolated instances of Teams for Linux — perfect for work and personal accounts. Each profile maintains its own icon, session data, and window behavior.

## Quick Start Examples

### Work Profile
```bash
./teams-for-linux \
  --appIcon=/path/to/work-icon.png \
  --class=teams-work \
  --user-data-dir=/home/user/.config/teams-profile-work
```

### Personal Profile
```bash
./teams-for-linux \
  --appIcon=/path/to/personal-icon.png \
  --class=teams-personal \
  --user-data-dir=/home/user/.config/teams-profile-personal
```

:::tip
Replace the `user-data-dir` with the full path where you want to store the profile data.
:::

## Command Line Options

### `--appIcon`

Set a custom tray and window icon for each profile:

```bash
--appIcon=/path/to/icon.png
```

This changes the visual icon used in the title bar and system tray/dock, making it easy to distinguish between different profiles.

### `--class`

Set the internal application name used by Electron:

```bash
--class=teams-work
```

This affects:
- Window manager identification
- Task switcher appearance
- Application grouping in dock/taskbar
- System-level application recognition

### `--user-data-dir`

Specify a custom directory for storing profile data:

```bash
--user-data-dir=/home/user/.config/teams-profile-work
```

Each profile stores separately:
- Login sessions and authentication tokens
- Configuration settings
- Cache data
- Custom backgrounds
- Notification preferences

## Configuration Per Profile

Each profile can have its own `config.json` file in its respective user data directory:

```
/home/user/.config/teams-profile-work/config.json
/home/user/.config/teams-profile-personal/config.json
```

### Example Work Profile Config
```json
{
  "appTitle": "Teams - Work",
  "appIconType": "dark",
  "disableNotificationSound": false,
  "customCSSName": "compactDark",
  "closeAppOnCross": false
}
```

### Example Personal Profile Config
```json
{
  "appTitle": "Teams - Personal",
  "appIconType": "light",
  "disableNotificationSound": true,
  "customCSSName": "compactLight",
  "closeAppOnCross": true
}
```

## Desktop Integration

### Creating Desktop Shortcuts

#### Work Profile Desktop Entry
```ini
[Desktop Entry]
Name=Teams for Linux (Work)
Comment=Microsoft Teams for Linux - Work Profile
Exec=/path/to/teams-for-linux --class=teams-work --user-data-dir=%h/.config/teams-profile-work --appIcon=%h/.local/share/icons/teams-work.png
Icon=teams-work
Terminal=false
Type=Application
Categories=Network;InstantMessaging;
StartupWMClass=teams-work
```

#### Personal Profile Desktop Entry
```ini
[Desktop Entry]
Name=Teams for Linux (Personal)
Comment=Microsoft Teams for Linux - Personal Profile
Exec=/path/to/teams-for-linux --class=teams-personal --user-data-dir=%h/.config/teams-profile-personal --appIcon=%h/.local/share/icons/teams-personal.png
Icon=teams-personal
Terminal=false
Type=Application
Categories=Network;InstantMessaging;
StartupWMClass=teams-personal
```

### Shell Scripts for Easy Launch

#### `teams-work.sh`
```bash
#!/bin/bash
/path/to/teams-for-linux \
  --class=teams-work \
  --user-data-dir="$HOME/.config/teams-profile-work" \
  --appIcon="$HOME/.local/share/icons/teams-work.png" \
  "$@"
```

#### `teams-personal.sh`
```bash
#!/bin/bash
/path/to/teams-for-linux \
  --class=teams-personal \
  --user-data-dir="$HOME/.config/teams-profile-personal" \
  --appIcon="$HOME/.local/share/icons/teams-personal.png" \
  "$@"
```

## Advanced Use Cases

### Organization-Specific Profiles

For users managing multiple organizations:

```bash
# Organization A
./teams-for-linux \
  --class=teams-org-a \
  --user-data-dir="$HOME/.config/teams-org-a" \
  --appTitle="Teams - Org A"

# Organization B  
./teams-for-linux \
  --class=teams-org-b \
  --user-data-dir="$HOME/.config/teams-org-b" \
  --appTitle="Teams - Org B"
```

### Development vs Production

For developers working with different Teams environments:

```bash
# Production environment
./teams-for-linux \
  --class=teams-prod \
  --user-data-dir="$HOME/.config/teams-production" \
  --url="https://teams.cloud.microsoft"

# Development/Test environment
./teams-for-linux \
  --class=teams-dev \
  --user-data-dir="$HOME/.config/teams-development" \
  --url="https://teams-dev.company.com"
```

## Best Practices

### Directory Organization
```
$HOME/.config/
├── teams-profile-work/
│   ├── config.json
│   ├── Cache/
│   └── Partitions/
├── teams-profile-personal/
│   ├── config.json
│   ├── Cache/
│   └── Partitions/
└── teams-for-linux/           # Default profile
    ├── config.json
    └── ...
```

### Icon Management
- Use distinct icons for each profile (different colors, badges, etc.)
- Store icons in `$HOME/.local/share/icons/` for persistence
- Use SVG format when possible for better scaling
- Consider using the same base icon with different overlays

### Naming Conventions
- Use descriptive class names: `teams-work`, `teams-personal`, `teams-client-name`
- Include purpose in directory names: `teams-profile-work`, `teams-profile-personal`
- Use consistent naming across desktop files, scripts, and directories

## Troubleshooting

### Profiles Not Isolated
- **Check user-data-dir**: Ensure each profile uses a different directory
- **Verify class names**: Different `--class` values help window managers distinguish instances
- **Clear conflicting cache**: Remove cache if profiles seem to share data

### Icons Not Showing
- **Check file paths**: Ensure icon files exist and are readable
- **Restart window manager**: Some changes require restarting the desktop environment
- **Icon cache**: Clear icon cache with `gtk-update-icon-cache` if needed

### Configuration Not Applied
- **Verify config location**: Ensure `config.json` is in the correct profile directory
- **JSON syntax**: Validate JSON syntax using `jq` or online validators
- **File permissions**: Ensure config files are readable by the application

## Related Documentation

- [Configuration Options](configuration.md) - All available configuration options
- [Troubleshooting](troubleshooting.md) - General troubleshooting guide