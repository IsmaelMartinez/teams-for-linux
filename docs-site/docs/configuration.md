# Configuration Options

This document details all available configuration options for the Teams for Linux application. These options can be set via command-line arguments or in a `config.json` file located in the application's configuration directory.

<!-- toc -->

## Table of Contents

- [Quick Start](#quick-start)
- [Configuration Locations](#configuration-locations)
- [Configuration Options Reference](#configuration-options-reference)
  - [Application Core](#application-core)
  - [Window & UI Behavior](#window--ui-behavior)
  - [Theming & Appearance](#theming--appearance)
  - [Tray Icon](#tray-icon)
  - [Notification System](#notification-system)
  - [Incoming Call Handling](#incoming-call-handling)
  - [Idle & Activity Detection](#idle--activity-detection)
  - [Authentication & SSO](#authentication--sso)
  - [Network & Proxy](#network--proxy)
  - [Screen Sharing](#screen-sharing)
  - [Media Settings](#media-settings)
  - [Virtual Backgrounds](#virtual-backgrounds)
  - [URL & Protocol Handling](#url--protocol-handling)
  - [Keyboard Shortcuts](#keyboard-shortcuts)
  - [MQTT Integration](#mqtt-integration)
  - [Microsoft Graph API](#microsoft-graph-api)
  - [Quick Chat](#quick-chat)
  - [Performance & Hardware](#performance--hardware)
  - [Wayland](#wayland)
  - [Cache & Storage](#cache--storage)
  - [Development & Debug](#development--debug)
  - [Advanced Platform Options](#advanced-platform-options)
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

### Application Core

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | `"https://teams.cloud.microsoft"` | Microsoft Teams URL |
| `appTitle` | `string` | `"Microsoft Teams"` | Text to be suffixed with page title |
| `partition` | `string` | `"persist:teams-4-linux"` | BrowserWindow webpreferences partition |

### Window & UI Behavior

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `frame` | `boolean` | `true` | Specify false to create a Frameless Window |
| `menubar` | `string` | `"auto"` | Menu bar behaviour. Choices: `auto`, `visible`, `hidden` |
| `minimized` | `boolean` | `false` | Start the application minimized |
| `closeAppOnCross` | `boolean` | `false` | Close the app when clicking the close (X) cross |
| `alwaysOnTop` | `boolean` | `true` | Keep the pop-out window always on top of other windows |
| `class` | `string` | `null` | Custom value for the WM_CLASS property |

### Theming & Appearance

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `customCSSName` | `string` | `""` | Custom CSS name. Options: "compactDark", "compactLight", "tweaks", "condensedDark", "condensedLight" |
| `customCSSLocation` | `string` | `""` | Custom CSS styles file location |
| `followSystemTheme` | `boolean` | `false` | Follow system theme |

### Tray Icon

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `trayIconEnabled` | `boolean` | `true` | Enable tray icon |
| `appIcon` | `string` | `""` | Teams app icon to show in the tray |
| `appIconType` | `string` | `"default"` | Type of tray icon. Choices: `default`, `light`, `dark` |
| `useMutationTitleLogic` | `boolean` | `true` | Use MutationObserver to update counter from title |
| `disableBadgeCount` | `boolean` | `false` | Disable the badge counter on the taskbar/dock icon |

### Notification System

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `disableNotifications` | `boolean` | `false` | Disable all notifications |
| `disableNotificationSound` | `boolean` | `false` | Disable chat/meeting start notification sound |
| `disableNotificationSoundIfNotAvailable` | `boolean` | `false` | Disables notification sound unless status is Available |
| `disableNotificationWindowFlash` | `boolean` | `false` | Disable window flashing when there is a notification |
| `notificationMethod` | `string` | `"web"` | Notification method. Choices: `web`, `electron`, `custom` |
| `customNotification` | `object` | `{ toastDuration: 5000 }` | Configuration for custom in-app toast notifications (used when `notificationMethod` is `custom`) |
| `defaultNotificationUrgency` | `string` | `"normal"` | Default urgency for new notifications. Choices: `low`, `normal`, `critical` |

### Incoming Call Handling

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableIncomingCallToast` | `boolean` | `false` | Enable incoming call toast |
| `incomingCallCommand` | `string` | `null` | Command or executable to run when an incoming call is detected |
| `incomingCallCommandArgs` | `array` | `[]` | Arguments to pass to the incoming call command |

> [!NOTE]
> See [Incoming Call Command](#incoming-call-command) for detailed usage examples.

### Idle & Activity Detection

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `awayOnSystemIdle` | `boolean` | `false` | Sets user status as away when system goes idle |
| `appIdleTimeout` | `number` | `300` | Duration in seconds before app considers system as idle |
| `appIdleTimeoutCheckInterval` | `number` | `10` | Poll interval in seconds to check if idle timeout is reached |
| `appActiveCheckInterval` | `number` | `2` | Poll interval in seconds to check if system is active from being idle |

### Authentication & SSO

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `authServerWhitelist` | `string` | `"*"` | Set auth-server-whitelist value |
| `customCACertsFingerprints` | `array` | `[]` | Array of custom CA Certs Fingerprints to allow SSL unrecognized signer or self signed certificate |

#### Basic Authentication

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ssoBasicAuthUser` | `string` | `""` | User to use for SSO basic auth |
| `ssoBasicAuthPasswordCommand` | `string` | `""` | Command to execute to retrieve password for SSO basic auth |

#### InTune SSO

InTune SSO uses a nested `auth.intune` configuration:

```json
{
  "auth": {
    "intune": {
      "enabled": false,
      "user": ""
    }
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `auth.intune.enabled` | `boolean` | `false` | Enable Single-Sign-On using Microsoft InTune |
| `auth.intune.user` | `string` | `""` | User (e-mail) to use for InTune SSO |

**Legacy Options (Deprecated):**

| Old Option | New Option | Notes |
|------------|------------|-------|
| `ssoInTuneEnabled` | `auth.intune.enabled` | Renamed + moved |
| `ssoInTuneAuthUser` | `auth.intune.user` | Renamed + moved |

#### Certificates

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `clientCertPath` | `string` | `""` | Custom Client Certs for corporate authentication (certificate must be in pkcs12 format) |
| `clientCertPassword` | `string` | `""` | Custom Client Certs password for corporate authentication |

### Network & Proxy

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `proxyServer` | `string` | `null` | Proxy Server with format address:port |

### Screen Sharing

Screen sharing settings are organized under the `screenSharing` configuration object:

```json
{
  "screenSharing": {
    "thumbnail": {
      "enabled": true,
      "alwaysOnTop": true
    },
    "lockInhibitionMethod": "Electron"
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `screenSharing.thumbnail.enabled` | `boolean` | `true` | Automatically show thumbnail window when screen sharing |
| `screenSharing.thumbnail.alwaysOnTop` | `boolean` | `true` | Keep thumbnail window always on top |
| `screenSharing.lockInhibitionMethod` | `string` | `"Electron"` | Screen lock inhibition method. Choices: `Electron`, `WakeLockSentinel` |

**Legacy Options (Deprecated):**

| Old Option | New Option | Notes |
|------------|------------|-------|
| `screenSharingThumbnail` | `screenSharing.thumbnail` | Moved to nested structure |
| `screenLockInhibitionMethod` | `screenSharing.lockInhibitionMethod` | Moved to nested structure |

### Media Settings

Media settings are organized under the `media` configuration object with subgroups for microphone, camera, and video settings.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `media.microphone.disableAutogain` | `boolean` | `false` | Disable microphone auto gain control - prevents Teams from automatically adjusting microphone volume levels. Useful for professional audio setups or when manual gain control is preferred |
| `media.camera.resolution.enabled` | `boolean` | `false` | Enable camera resolution control |
| `media.camera.resolution.mode` | `string` | `"remove"` | Resolution mode: `"remove"` removes Teams' constraints allowing native camera resolution, `"override"` sets specific width/height |
| `media.camera.resolution.width` | `number` | - | Target width when mode is `"override"` |
| `media.camera.resolution.height` | `number` | - | Target height when mode is `"override"` |
| `media.camera.autoAdjustAspectRatio.enabled` | `boolean` | `false` | Fixes camera video stretching when moving Teams between monitors with different orientations by reapplying proper aspect ratio constraints |
| `media.video.menuEnabled` | `boolean` | `false` | Enable menu entry for controlling video elements (PiP mode, video controls) |

**Example Media Configuration:**
```json
{
  "media": {
    "microphone": { "disableAutogain": false },
    "camera": {
      "resolution": { "enabled": false, "mode": "remove" },
      "autoAdjustAspectRatio": { "enabled": false }
    },
    "video": { "menuEnabled": false }
  }
}
```

**Legacy Options (Deprecated):**

| Old Option | New Option | Notes |
|------------|------------|-------|
| `disableAutogain` | `media.microphone.disableAutogain` | Moved to nested structure |
| `videoMenu` | `media.video.menuEnabled` | Renamed + moved to nested structure |

> [!NOTE]
> **Camera resolution overrides:** Using camera resolution override mode can cause laggy or stuttering camera video, resolution drops, or blocking on some systems. If you experience this, try disabling auto brightness adjustment (in your teams camera settings) to reduce or fix the issue. Adjusting GPU-related options (for example `disableGpu` under [Performance & Hardware](#performance--hardware) or [Electron CLI Flags](#electron-cli-flags)) also helps if you would like to retain auto brightness.


### Virtual Backgrounds

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `isCustomBackgroundEnabled` | `boolean` | `false` | Enable custom background feature |
| `customBGServiceBaseUrl` | `string` | `"http://localhost"` | Base URL of the server which provides custom background images |
| `customBGServiceConfigFetchInterval` | `number` | `0` | Poll interval in seconds to download background service config |

### URL & Protocol Handling

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `defaultURLHandler` | `string` | `""` | Default application to open HTTP URLs |
| `meetupJoinRegEx` | `string` | `^https://teams\\.(?:microsoft\\.com|live\\.com|cloud\\.microsoft)/(v2/\\?meetingjoin=|meet/|l/(?:app|call|channel|chat|entity|file|meet(?:ing|up-join)|message|task|team)/)` | Regex for Teams meetup-join and related links |
| `msTeamsProtocols` | `object` | `{ v1: "^msteams:\/l\/(?:meetup-join\|channel\|chat\|message)", v2: "^msteams:\/\/teams\.microsoft\.com\/l\/(?:meetup-join\|channel\|chat\|message)" }` | Regular expressions for Microsoft Teams protocol links |
| `onNewWindowOpenMeetupJoinUrlInApp` | `boolean` | `true` | Open meetupJoinRegEx URLs in the app instead of default browser |

### Keyboard Shortcuts

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `disableGlobalShortcuts` | `array` | `[]` | Array of global shortcuts to disable while app is in focus |
| `globalShortcuts` | `array` | `[]` | Global keyboard shortcuts that work system-wide (opt-in, disabled by default). See [Global Shortcuts](#global-shortcuts) |

### MQTT Integration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `mqtt.enabled` | `boolean` | `false` | Enable/disable MQTT integration (status publishing and command reception) |
| `mqtt.brokerUrl` | `string` | `""` | MQTT broker URL (e.g., `mqtt://192.168.1.100:1883` or `mqtts://broker:8883` for TLS) |
| `mqtt.username` | `string` | `""` | MQTT username for authentication (optional) |
| `mqtt.password` | `string` | `""` | MQTT password for authentication (optional) |
| `mqtt.clientId` | `string` | `"teams-for-linux"` | Unique MQTT client identifier |
| `mqtt.topicPrefix` | `string` | `"teams"` | Topic prefix for all MQTT messages |
| `mqtt.statusTopic` | `string` | `"status"` | Topic name for status messages (outbound, combined with topicPrefix) |
| `mqtt.commandTopic` | `string` | `""` | Topic name for receiving commands (inbound). Leave empty to disable (status-only mode). Set to `"command"` to enable bidirectional mode. |
| `mqtt.statusCheckInterval` | `number` | `10000` | Polling interval in milliseconds for status detection fallback |

**Example MQTT Configuration:**
```json
{
  "mqtt": {
    "enabled": true,
    "brokerUrl": "mqtt://192.168.1.100:1883",
    "username": "teams-user",
    "password": "secret",
    "clientId": "teams-for-linux",
    "topicPrefix": "home/office",
    "statusTopic": "teams/status",
    "commandTopic": "teams/command",
    "statusCheckInterval": 10000
  }
}
```

**Published Topics:**

When MQTT is enabled, the following topics are automatically published:

| Topic | Payload | Description |
|-------|---------|-------------|
| `\{topicPrefix\}/connected` | `"true"` or `"false"` | App connection state (uses MQTT Last Will) |
| `\{topicPrefix\}/status` | JSON object | User presence status (Available, Busy, DND, Away, BRB) |
| `\{topicPrefix\}/in-call` | `"true"` or `"false"` | Active call state (connected/disconnected) |
| `\{topicPrefix\}/camera` | `"true"` or `"false"` | Camera on/off state (Phase 2) |
| `\{topicPrefix\}/microphone` | `"true"` or `"false"` | Microphone on/off state (Phase 2) |

All topics use retained messages by default, ensuring subscribers receive the last known state immediately upon connecting.

**Connection State:** The `connected` topic uses MQTT Last Will and Testament (LWT). If the app crashes or loses network connectivity, the broker automatically publishes `"false"`, allowing home automation to detect and handle stale state.

> [!NOTE]
> By default, MQTT operates in **status-only mode** (publishes status to `\{topicPrefix\}/\{statusTopic\}` but doesn't receive commands). To enable **bidirectional mode**, set `commandTopic` to a topic name like `"command"`. Commands will then be received on `\{topicPrefix\}/\{commandTopic\}`. See the **[MQTT Integration Guide](mqtt-integration.md)** for complete documentation, command examples, home automation, and troubleshooting.

### Microsoft Graph API

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `graphApi.enabled` | `boolean` | `false` | Enable Microsoft Graph API integration for calendar and mail access |

```json title="Example Configuration"
{
  "graphApi": {
    "enabled": true
  }
}
```

> [!NOTE]
> This feature uses Teams' existing authentication to access Microsoft Graph API endpoints. No additional login required. Currently supports reading user profile, calendar events, and mail messages.

### Quick Chat

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `quickChat.enabled` | `boolean` | `false` | Enable Quick Chat feature for quick contact search and chat access |
| `quickChat.shortcut` | `string` | none | Keyboard shortcut to toggle the Quick Chat modal (e.g., `"CommandOrControl+Alt+Q"`) |

```json title="Example Configuration"
{
  "quickChat": {
    "enabled": true,
    "shortcut": "CommandOrControl+Alt+Q"
  },
  "graphApi": {
    "enabled": true
  }
}
```

> [!NOTE]
> Quick Chat requires Graph API to be enabled (`graphApi.enabled: true`) for contact search and inline messaging. The modal allows you to search for contacts, click to compose a message, and send it directly without leaving your current context. The keyboard shortcut uses Electron accelerator format. No shortcut is registered by default; you must provide one explicitly.

### Performance & Hardware

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `disableGpu` | `boolean` | `false` | Disable GPU and hardware acceleration |
| `electronCLIFlags` | `array` | `[]` | Electron CLI flags |

### Wayland

Wayland display server settings are organized under the `wayland` configuration object:

```json
{
  "wayland": {
    "xwaylandOptimizations": false
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `wayland.xwaylandOptimizations` | `boolean` | `false` | Enable XWayland-specific optimizations: keeps GPU enabled and skips fake media UI flag under XWayland. May fix camera issues but can break screen sharing on some systems |

### Cache & Storage

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cacheManagement` | `object` | `{ enabled: false, maxCacheSizeMB: 600, cacheCheckIntervalMs: 3600000 }` | Cache management configuration |
| `clearStorageData` | `boolean` | `null` | Flag to clear storage data |

> [!NOTE]
> See [Cache Management](#cache-management) for detailed configuration and usage examples.

### Development & Debug

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `webDebug` | `boolean` | `false` | Enable debug at start |
| `logConfig` | `object` | `{ transports: { console: { level: "info" }, file: { level: false } } }` | Electron-log configuration |
| `watchConfigFile` | `boolean` | `false` | Watch for changes in config file and reload the app |

### Advanced Platform Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `chromeUserAgent` | `string` | `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36` | Google Chrome User Agent |
| `emulateWinChromiumPlatform` | `boolean` | `false` | Use windows platform information in chromium (helpful if MFA app doesn't support Linux) |
| `spellCheckerLanguages` | `array` | `[]` | Array of languages to use with Electron's spell checker |
| `disableTimestampOnCopy` | `boolean` | `false` | Controls whether timestamps are included when copying messages |

:::note Wayland GPU Handling
When running under Wayland, GPU acceleration is **automatically disabled by default** to prevent blank window issues. To enable GPU acceleration on Wayland, you can explicitly override this behavior using either:

**Configuration file** (`config.json`):
```json
{
  "disableGpu": false
}
```

**Command-line argument**:
```bash
teams-for-linux --disableGpu=false
```

If you don't set this option at all (via config file or CLI), GPU will be disabled automatically on Wayland. This smart default ensures the app works out of the box while allowing power users to optimize performance.
:::

:::note XWayland Optimizations
When running under XWayland (Wayland session with `--ozone-platform=x11`), the app treats it the same as native Wayland by default. If you experience **camera issues** under XWayland (e.g., camera crash on second launch), you can enable XWayland-specific optimizations:

```json
{
  "wayland": {
    "xwaylandOptimizations": true
  }
}
```

When enabled, this flag:
- Keeps GPU acceleration enabled under XWayland (instead of auto-disabling)
- Skips the `--use-fake-ui-for-media-stream` Chromium flag under XWayland

> **Warning:** Enabling this may break screen sharing on XWayland for some systems. Only enable it if you are experiencing camera problems.

**Related issues:** [#2169](https://github.com/IsmaelMartinez/teams-for-linux/issues/2169), [#2217](https://github.com/IsmaelMartinez/teams-for-linux/issues/2217)
:::

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
  "auth": {
    "intune": {
      "enabled": true,
      "user": "user@company.com"
    },
    "certificate": {
      "path": "/path/to/cert.p12",
      "password": "password"
    }
  },
  "proxyServer": "proxy.company.com:8080"
}
```

#### Professional Audio Setup
```json
{
  "media": {
    "microphone": {
      "disableAutogain": true
    }
  }
}
```

> [!NOTE]
> The `media.microphone.disableAutogain` option prevents Teams from automatically adjusting your microphone volume. This is particularly useful for users with professional audio equipment, external mixers, or specific hardware configurations where manual gain control is preferred.

#### Video Menu Setup
```json
{
  "media": {
    "video": {
      "menuEnabled": true
    }
  }
}
```

> [!NOTE]
> The `media.video.menuEnabled` option enables a Video menu entry for controlling video elements such as Picture-in-Picture mode for shared screens and toggling video controls.

#### Custom Notifications Setup
```json
{
  "notificationMethod": "custom",
  "customNotification": {
    "toastDuration": 5000
  }
}
```

> [!NOTE]
> The `custom` notification method displays in-app toast notifications instead of OS-level notifications. This is useful when:
> - Your notification daemon is unreliable or not running
> - You experience application freezes with web/electron notifications
> - OS notifications don't work consistently on your desktop environment
>
> **Configuration options:**
> - `toastDuration`: Time in milliseconds before toast auto-dismisses (default: 5000ms)
>
> Toasts appear in the bottom-right corner and clicking them focuses the main Teams window.

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
  "screenSharing": {
    "thumbnail": {
      "enabled": true
    }
  },
  "customCSSName": "compactDark",
  "auth": {
    "intune": {
      "enabled": true
    }
  },
  "proxyServer": "proxy.company.com:8080"
}
```

**Related GitHub Issues:** [Issue #1773](https://github.com/IsmaelMartinez/teams-for-linux/issues/1773)

### Electron CLI Flags

The configuration file can include Electron CLI flags that will be added when the application starts.

```json
{
  "electronCLIFlags": [
    "disable-software-rasterizer"
  ]
}
```

> [!NOTE]
> For options that require a value, provide them as an array where the first element is the flag and the second is its value. If no value is needed, you can use a simple string.

> [!WARNING]
> The `ozone-platform` flag **cannot** be set via `electronCLIFlags` because it must be applied before the Electron process starts (before any JavaScript executes). To override the default X11 mode, pass `--ozone-platform=wayland` or `--ozone-platform=auto` as a command-line argument when launching the app, or edit the `Exec=` line in your `.desktop` file. See [Troubleshooting: Wayland / Display Issues](troubleshooting.md#wayland--display-issues) for details.

#### Custom Feature Flags (enable-features / disable-features)

Teams for Linux automatically sets Chromium feature flags for optimal functionality. These defaults are applied only if you don't provide your own flags.

**Default Settings:**
- `--disable-features=HardwareMediaKeyHandling` - Prevents conflicts with Teams media controls
- `--enable-features=WebRTCPipeWireCapturer` - Enables PipeWire screen sharing (Wayland only)

**Using Custom Feature Flags:**

If you need custom feature flags, provide them when launching the app. The application respects your flags and will not override them.

```bash
# Example: Adding your own features on Wayland
teams-for-linux --enable-features=MyCustomFeature,WebRTCPipeWireCapturer

# Example: Disabling features
teams-for-linux --disable-features=HardwareMediaKeyHandling,UnwantedFeature
```

> [!WARNING]
> When providing custom flags, **you must include the required features** for proper functionality:
> - **Always include:** `HardwareMediaKeyHandling` in `--disable-features`
> - **On Wayland:** Also include `WebRTCPipeWireCapturer` in `--enable-features`
>
> Missing required features will trigger a warning but won't prevent the app from starting.

**Complete example with custom and required features:**

```bash
# Wayland users with custom needs
teams-for-linux --enable-features=MyFeature,WebRTCPipeWireCapturer \
                --disable-features=HardwareMediaKeyHandling,OtherFeature
```

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

> [!NOTE]
> As of version 2.6.4, the Cache Manager is **disabled by default**. While it was designed to prevent daily logout issues caused by cache overflow (issue #1756), user feedback (issues #1868, #1840 and others) indicated it caused more problems than it solved for most users. You can enable it if you experience cache-related authentication issues.

The cache management feature automatically cleans cache files when they grow too large and cause token corruption:

```json
{
  "cacheManagement": {
    "enabled": false,
    "maxCacheSizeMB": 600,
    "cacheCheckIntervalMs": 3600000
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable/disable automatic cache management |
| `maxCacheSizeMB` | `number` | `600` | Maximum cache size in MB before cleanup |
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

### Global Shortcuts

:::note Opt-In Feature
Global shortcuts are **disabled by default**. Add shortcuts to your config to enable this feature.
:::

System-wide keyboard shortcuts that work even when Teams is not focused. When triggered, the shortcut is forwarded to Teams which handles it with its built-in shortcuts.

#### Configuration Example

```json
{
  "globalShortcuts": [
    "Control+Shift+M",
    "Control+Shift+O"
  ]
}
```

#### Common Teams Shortcuts

- `Ctrl+Shift+M` - Toggle mute/unmute
- `Ctrl+Shift+O` - Toggle video on/off
- `Ctrl+Shift+K` - Raise/lower hand
- `Ctrl+Shift+B` - Toggle background blur
- `Ctrl+Shift+E` - Start/stop screen sharing
- `Ctrl+Shift+D` - Toggle chat
- `Ctrl+Shift+C` - Toggle calendar

See [Microsoft Teams Keyboard Shortcuts](https://support.microsoft.com/en-us/office/keyboard-shortcuts-for-microsoft-teams-2e8e2a70-e8d8-4a19-949b-4c36dd5292d2) for the full list.

#### Important Notes

- **Use `Control` not `CommandOrControl`**: Teams uses Ctrl on all platforms, including macOS
- **QWERTY keyboard layout only**: Shortcuts are based on physical QWERTY key positions
- **macOS limitation**: Non-QWERTY layouts (Dvorak, AZERTY, Colemak, etc.) are not supported due to [Electron bug #19747](https://github.com/electron/electron/issues/19747)
- **Linux/Windows**: Works better but may have issues with layout changes during runtime

See [Electron Accelerators](https://www.electronjs.org/docs/latest/api/accelerator) for available key combinations.