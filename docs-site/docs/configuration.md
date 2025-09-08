# Configuration Options

This document details all available configuration options for the Teams for Linux application. These options can be set via command-line arguments or in a `config.json` file located in the application's configuration directory.

<!-- toc -->

## Table of Contents

- [Quick Start](#quick-start)
- [Configuration Locations](#configuration-locations)
- [Configuration Options Reference](#configuration-options-reference)
  - [Core Application Settings](#core-application-settings)
  - [Authentication & Security](#authentication--security)
  - [Notifications & UI](#notifications--ui)
  - [Screen Sharing & Media](#screen-sharing--media)
  - [System Integration](#system-integration)
  - [Advanced Options](#advanced-options)
- [Usage Examples & Guides](#usage-examples--guides)
  - [Basic Setup Examples](#basic-setup-examples)
  - [System-wide Configuration](#system-wide-configuration)
  - [Electron CLI Flags](#electron-cli-flags)
  - [Incoming Call Command](#incoming-call-command)
  - [Cache Management](#cache-management)
  - [Tray Icon Behavior by Desktop Environment](#tray-icon-behavior-by-desktop-environment)

## Quick Start

### Command Line Example
```bash
teams-for-linux --partition nopersist
```

### Basic Config File
Create a `config.json` file with your desired settings:

```json
{
  "closeAppOnCross": true,
  "disableNotifications": false,
  "customCSSName": "compactDark"
}
```

## Configuration Locations

Place your `config.json` file in the appropriate location based on your installation type:

- **Vanilla**: `~/.config/teams-for-linux/config.json`
- **Snap**: `~/snap/teams-for-linux/current/.config/teams-for-linux/config.json`
- **Flatpak**: `~/.var/app/com.github.IsmaelMartinez.teams_for_linux/config/teams-for-linux/config.json`

> [!NOTE]
> [yargs](https://www.npmjs.com/package/yargs) supports multiple configuration methods—refer to their documentation if you prefer using a configuration file over command-line arguments.

## Configuration Options Reference

### Core Application Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | `"https://teams.microsoft.com/v2"` | Microsoft Teams URL |
| `appTitle` | `string` | `"Microsoft Teams"` | Text to be suffixed with page title |
| `partition` | `string` | `"persist:teams-4-linux"` | BrowserWindow webpreferences partition |
| `closeAppOnCross` | `boolean` | `false` | Close the app when clicking the close (X) cross |
| `minimized` | `boolean` | `false` | Start the application minimized |
| `frame` | `boolean` | `true` | Specify false to create a Frameless Window |
| `menubar` | `string` | `"auto"` | Menu bar behaviour. Choices: `auto`, `visible`, `hidden` |
| `webDebug` | `boolean` | `false` | Enable debug at start |

### Authentication & Security

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `authServerWhitelist` | `string` | `"*"` | Set auth-server-whitelist value |
| `clientCertPath` | `string` | `""` | Custom Client Certs for corporate authentication (certificate must be in pkcs12 format) |
| `clientCertPassword` | `string` | `""` | Custom Client Certs password for corporate authentication |
| `customCACertsFingerprints` | `array` | `[]` | Array of custom CA Certs Fingerprints to allow SSL unrecognized signer or self signed certificate |
| `ssoBasicAuthUser` | `string` | `""` | User to use for SSO basic auth |
| `ssoBasicAuthPasswordCommand` | `string` | `""` | Command to execute to retrieve password for SSO basic auth |
| `ssoInTuneEnabled` | `boolean` | `false` | Enable Single-Sign-On using Microsoft InTune |
| `ssoInTuneAuthUser` | `string` | `""` | User (e-mail) to use for InTune SSO |
| `proxyServer` | `string` | `null` | Proxy Server with format address:port |

### Notifications & UI

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `disableNotifications` | `boolean` | `false` | Disable all notifications |
| `disableNotificationSound` | `boolean` | `false` | Disable chat/meeting start notification sound |
| `disableNotificationSoundIfNotAvailable` | `boolean` | `false` | Disables notification sound unless status is Available |
| `disableNotificationWindowFlash` | `boolean` | `false` | Disable window flashing when there is a notification |
| `notificationMethod` | `string` | `"web"` | Notification method. Choices: `web`, `electron` |
| `defaultNotificationUrgency` | `string` | `"normal"` | Default urgency for new notifications. Choices: `low`, `normal`, `critical` |
| `enableIncomingCallToast` | `boolean` | `false` | Enable incoming call toast |
| `customCSSName` | `string` | `""` | Custom CSS name. Options: "compactDark", "compactLight", "tweaks", "condensedDark", "condensedLight" |
| `customCSSLocation` | `string` | `""` | Custom CSS styles file location |
| `followSystemTheme` | `boolean` | `false` | Follow system theme |

### Screen Sharing & Media

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `screenSharingThumbnail` | `object` | `{ enabled: true, alwaysOnTop: true }` | Automatically show thumbnail window when screen sharing |
| `screenLockInhibitionMethod` | `string` | `"Electron"` | Screen lock inhibition method. Choices: `Electron`, `WakeLockSentinel` |
| `videoMenu` | `boolean` | `false` | Enable menu entry for controlling video elements |
| `isCustomBackgroundEnabled` | `boolean` | `false` | Enable custom background feature |
| `customBGServiceBaseUrl` | `string` | `"http://localhost"` | Base URL of the server which provides custom background images |
| `customBGServiceConfigFetchInterval` | `number` | `0` | Poll interval in seconds to download background service config |

### System Integration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `trayIconEnabled` | `boolean` | `true` | Enable tray icon |
| `appIcon` | `string` | `""` | Teams app icon to show in the tray |
| `appIconType` | `string` | `"default"` | Type of tray icon. Choices: `default`, `light`, `dark` |
| `useMutationTitleLogic` | `boolean` | `true` | Use MutationObserver to update counter from title |
| `awayOnSystemIdle` | `boolean` | `false` | Sets user status as away when system goes idle |
| `appIdleTimeout` | `number` | `300` | Duration in seconds before app considers system as idle |
| `appIdleTimeoutCheckInterval` | `number` | `10` | Poll interval in seconds to check if idle timeout is reached |
| `appActiveCheckInterval` | `number` | `2` | Poll interval in seconds to check if system is active from being idle |
| `disableGlobalShortcuts` | `array` | `[]` | Array of global shortcuts to disable while app is in focus |

### Advanced Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `electronCLIFlags` | `array` | `[]` | Electron CLI flags |
| `chromeUserAgent` | `string` | `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36` | Google Chrome User Agent |
| `emulateWinChromiumPlatform` | `boolean` | `false` | Use windows platform information in chromium (helpful if MFA app doesn't support Linux) |
| `disableGpu` | `boolean` | `false` | Disable GPU and hardware acceleration |
| `clearStorageData` | `boolean` | `null` | Flag to clear storage data |
| `watchConfigFile` | `boolean` | `false` | Watch for changes in config file and reload the app |
| `class` | `string` | `null` | Custom value for the WM_CLASS property |
| `defaultURLHandler` | `string` | `""` | Default application to open HTTP URLs |
| `spellCheckerLanguages` | `array` | `[]` | Array of languages to use with Electron's spell checker |
| `logConfig` | `object` | `{ transports: { console: { level: "info" }, file: { level: false } } }` | Electron-log configuration |
| `meetupJoinRegEx` | `string` | `^https://teams.(microsoft\|live).com/.*(?:meetup-join\|channel\|chat)` | Meetup-join and channel regular expression |
| `msTeamsProtocols` | `object` | `{ v1: "^msteams:\/l\/(?:meetup-join\|channel\|chat\|message)", v2: "^msteams:\/\/teams\.microsoft\.com\/l\/(?:meetup-join\|channel\|chat\|message)" }` | Regular expressions for Microsoft Teams protocol links |
| `onNewWindowOpenMeetupJoinUrlInApp` | `boolean` | `true` | Open meetupJoinRegEx URLs in the app instead of default browser |
| `disableTimestampOnCopy` | `boolean` | `false` | Controls whether timestamps are included when copying messages |
| `cacheManagement` | `object` | `{ enabled: true, maxCacheSizeMB: 300, cacheCheckIntervalMs: 3600000 }` | Cache management configuration |

## Usage Examples & Guides

### Basic Setup Examples

#### Minimal Configuration
```json
{
  "closeAppOnCross": true
}
```

#### Dark Theme with Notifications Disabled
```json
{
  "customCSSName": "compactDark",
  "disableNotifications": true,
  "followSystemTheme": true
}
```

#### Enterprise Setup
```json
{
  "ssoInTuneEnabled": true,
  "ssoInTuneAuthUser": "user@company.com",
  "clientCertPath": "/path/to/cert.p12",
  "clientCertPassword": "password",
  "proxyServer": "proxy.company.com:8080"
}
```

### System-wide Configuration

Teams for Linux supports system-wide configuration files for enterprise and multi-user environments.

#### Configuration Precedence
1. **System-wide config**: `/etc/teams-for-linux/config.json`
2. **User config**: User's config directory (e.g., `~/.config/teams-for-linux/config.json`)
3. **Default values**: Built-in application defaults

> [!NOTE]
> User configurations take precedence over system-wide configurations. This allows administrators to set organization-wide defaults while still allowing individual users to customize their settings.

#### Example System-wide Config

Create `/etc/teams-for-linux/config.json` to set organization-wide defaults:

```json
{
  "closeAppOnCross": false,
  "disableNotifications": false,
  "screenSharingThumbnail": {
    "enabled": true
  },
  "customCSSName": "compactDark",
  "ssoInTuneEnabled": true,
  "proxyServer": "proxy.company.com:8080"
}
```

**Related GitHub Issues:** [Issue #1773](https://github.com/IsmaelMartinez/teams-for-linux/issues/1773)

### Electron CLI Flags

The configuration file can include Electron CLI flags that will be added when the application starts.

```json
{
  "electronCLIFlags": [
    ["ozone-platform", "wayland"],
    "disable-software-rasterizer"
  ]
}
```

> [!NOTE]
> For options that require a value, provide them as an array where the first element is the flag and the second is its value. If no value is needed, you can use a simple string.

### Incoming Call Command

To use the incoming call command feature, a command or executable needs to be configured.

```json
{
  "incomingCallCommand": "/home/user/incomingCallScript.sh",
  "incomingCallCommandArgs": ["-f", "1234"]
}
```

This will execute the following on an incoming call:

```bash
/home/user/incomingCallScript.sh -f 1234 NAME_OF_CALLER SUBTEXT IMAGE_OF_CALLER
```

> [!NOTE]
> - Only the property `incomingCallCommand` is necessary, `incomingCallCommandArgs` is completely optional
> - This feature has no connection to the incoming call toast feature. These two features can be used separately

### Cache Management

> [!IMPORTANT]
> The Cache Manager is **enabled by default** and prevents daily issues caused by cache overflow (issue #1756).

The cache management feature automatically cleans cache files when they grow too large and cause token corruption:

```json
{
  "cacheManagement": {
    "enabled": true,
    "maxCacheSizeMB": 300,
    "cacheCheckIntervalMs": 3600000
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable automatic cache management |
| `maxCacheSizeMB` | `number` | `300` | Maximum cache size in MB before cleanup |
| `cacheCheckIntervalMs` | `number` | `3600000` | How often to check cache size in milliseconds (1 hour) |

#### What Gets Cleaned vs Preserved

<details>
<summary>Click to expand cleanup details</summary>

**Cleaned:**
- Cache directories (main Cache, GPUCache, Code Cache)
- Partition-specific cached data for your configured partition (e.g. `Partitions/teams-4-linux/{Cache,GPUCache,Code Cache}`)
- Temporary WAL/journal files that are known to cause token corruption

**Preserved:**
- IndexedDB and WebStorage for the Teams partition (these contain authentication tokens and session state)
- Authentication tokens and login credentials
- User preferences and settings
- Other essential persistent storage

</details>

#### Manual Cache Cleanup

Enable debug logging to monitor cache activities:

```bash
teams-for-linux --logConfig='{"level":"debug"}'
```

**Option 1: Safe cleanup (won't sign you out)**

This mirrors what the app's automatic cleaner does:

```bash
# Stop Teams for Linux first
pkill -f "teams-for-linux"

# Remove top-level caches
rm -rf ~/.config/teams-for-linux/Cache/*
rm -rf ~/.config/teams-for-linux/GPUCache/*
rm -rf ~/.config/teams-for-linux/"Code Cache"/*

# Remove partition-specific caches (default partition name is teams-4-linux)
rm -rf ~/.config/teams-for-linux/Partitions/teams-4-linux/Cache/*
rm -rf ~/.config/teams-for-linux/Partitions/teams-4-linux/GPUCache/*
rm -rf ~/.config/teams-for-linux/Partitions/teams-4-linux/"Code Cache"/*

# Remove problematic temporary files
rm -f ~/.config/teams-for-linux/DIPS-wal
rm -f ~/.config/teams-for-linux/SharedStorage-wal
rm -f ~/.config/teams-for-linux/Cookies-journal
```

**Option 2: Full reset for Teams origin (will sign you out)**

Use the in-app menu to clear storage for just the Teams website origin:

- Open the app menu → Debug → Reset Teams Cache

> [!WARNING]
> You'll be logged out and will need to sign in again. Use this only if you suspect corrupted site data or repeated auth failures.

### Tray Icon Behavior by Desktop Environment

The tray icon functionality varies depending on your Linux desktop environment:

#### Visual Badge Support
- **Unity (Ubuntu 12.04-18.04)**: ✅ Shows visual launcher badges with unread count
- **KDE Plasma**: ✅ Shows taskbar badge overlays with unread count
- **GNOME**: ✅ Limited support via extensions
- **Cinnamon/MATE**: ❌ No visual badges - **unread count shown in tooltip only**
- **XFCE**: ❌ Limited badge support
- **macOS**: ✅ Dock badges (full support)
- **Windows**: ✅ Taskbar overlay badges (full support)

#### Cinnamon Users

If you're using Linux Mint Cinnamon or other Cinnamon-based distributions:

- **Hover over the tray icon** to see unread count in tooltip: "Teams for Linux (5)"
- **Click the tray icon** to show/focus the Teams window
- **Window flashing** indicates new notifications
- **Right-click** for context menu options

> [!NOTE]
> A visual icon overlay solution for Cinnamon is planned to draw notification counts directly on the tray icon image.