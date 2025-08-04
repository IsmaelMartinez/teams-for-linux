# Configuration Options

This document details all available configuration options for the Teams for Linux application. These options can be set via command-line arguments or in a `config.json` file located in the application's configuration directory (e.g., `~/.config/teams-for-linux/config.json` on Linux).

## Example Usage

As an example, to disable persistence, you can run the following command:

```bash
teams-for-linux --partition nopersist
```

Alternatively, you can use a `config.json` file with your configuration options.
Place this file in the appropriate location based on your installation type:

- Vanilla: `~/.config/teams-for-linux/config.json`
- Snap: `~/snap/teams-for-linux/current/.config/teams-for-linux/config.json`
- Flatpak:
  `~/.var/app/com.github.IsmaelMartinez.teams_for_linux/config/teams-for-linux/config.json`

[yargs](https://www.npmjs.com/package/yargs) supports multiple configuration
methods—refer to their documentation if you prefer using a configuration file
over command-line arguments.

Example `config.json`:

```json
{
  "closeAppOnCross": true
}
```

## Electron CLI Flags

The configuration file can include Electron CLI flags that will be added when
the application starts.

Example:

```json
{
  "electronCLIFlags": [
    ["ozone-platform", "wayland"],
    "disable-software-rasterizer"
  ]
}
```

> Note: For options that require a value, provide them as an array where the
> first element is the flag and the second is its value. If no value is needed,
> you can use a simple string.

## Incoming Call Command

To use the incoming call command feature a command or executable needs to be configured.

Example:

```json
{
  "incomingCallCommand": "/home/user/incomingCallScript.sh",
  "incomingCallCommandArgs": ["-f", "1234"]
}
```
This will execute the following on an incoming call.

`/home/user/incomingCallScript.sh -f 1234 NAME_OF_CALLER SUBTEXT IMAGE_OF_CALLER`

> Note: Only the property incomingCallCommand is necessary, 
> incomingCallCommandArgs is completely optional.
> Note: This feature has no connection to the incoming call toast feature. 
> These two features can be use separately.

## Cache Management Configuration

The cache management feature helps prevent daily logout issues caused by cache overflow. It can be configured in your `config.json`:

```json
{
  "cacheManagement": {
    "enabled": false,
    "maxCacheSizeMB": 300,
    "cacheCheckIntervalMs": 3600000
  }
}
```

**Options:**
- `enabled` (boolean): Enable/disable automatic cache management (default: false)
- `maxCacheSizeMB` (number): Maximum cache size in MB before cleanup (default: 300)
- `cacheCheckIntervalMs` (number): How often to check cache size in milliseconds (default: 3600000 = 1 hour)

The cache manager automatically detects your partition configuration and cleans the appropriate directories while preserving authentication data.

## General Options

| Option Name | Type | Default Value | Description |
|---|---|---|---|
| `appActiveCheckInterval` | `number` | `2` | A numeric value in seconds as poll interval to check if the system is active from being idle. |
| `appIcon` | `string` | `""` | Teams app icon to show in the tray. |
| `appIconType` | `string` | `"default"` | Type of tray icon to be used. Choices: `default`, `light`, `dark`. |
| `appIdleTimeout` | `number` | `300` | A numeric value in seconds as duration before app considers the system as idle. |
| `appIdleTimeoutCheckInterval` | `number` | `10` | A numeric value in seconds as poll interval to check if the `appIdleTimeout` is reached. |
| `appTitle` | `string` | `"Microsoft Teams"` | A text to be suffixed with page title. |
| `authServerWhitelist` | `string` | `"*"` | Set auth-server-whitelist value. |
| `awayOnSystemIdle` | `boolean` | `false` | Sets the user status as away when system goes idle. |
| `chromeUserAgent` | `string` | `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36` | Google Chrome User Agent. |
| `customBGServiceBaseUrl` | `string` | `"http://localhost"` | Base URL of the server which provides custom background images. |
| `customBGServiceConfigFetchInterval` | `number` | `0` | A numeric value in seconds as poll interval to download background service config download. |
| `customCACertsFingerprints` | `array` | `[]` | Array of custom CA Certs Fingerprints to allow SSL unrecognized signer or self signed certificate. |
| `customCSSName` | `string` | `""` | Custom CSS name for the packaged available css files. Currently those are: "compactDark", "compactLight", "tweaks", "condensedDark" and "condensedLight". |
| `customCSSLocation` | `string` | `""` | Custom CSS styles file location. |
| `contextIsolation` | `boolean` | `false` | Use contextIsolation on the main BrowserWindow (WIP - Disabling this will break most functionality). |
| `disableTimestampOnCopy` | `boolean` | `false` | Controls whether timestamps are included when copying messages in chats. |
| `class` | `string` | `null` | A custom value for the WM_CLASS property. |
| `cacheManagement` | `object` | `{ enabled: false, maxCacheSizeMB: 300, cacheCheckIntervalMs: 3600000 }` | Cache management configuration to prevent daily logout issues. |
| `clearStorageData` | `boolean` | `null` | Flag to clear storage data. Expects an object of the type https://www.electronjs.org/docs/latest/api/session#sesclearstoragedataoptions. |
| `clientCertPath` | `string` | `""` | Custom Client Certs for corporate authentication (certificate must be in pkcs12 format). |
| `clientCertPassword` | `string` | `""` | Custom Client Certs password for corporate authentication (certificate must be in pkcs12 format). |
| `closeAppOnCross` | `boolean` | `false` | Close the app when clicking the close (X) cross. |
| `defaultNotificationUrgency` | `string` | `"normal"` | Default urgency for new notifications (low/normal/critical). Choices: `low`, `normal`, `critical`. |
| `defaultURLHandler` | `string` | `""` | Default application to be used to open the HTTP URLs. |
| `disableAutogain` | `boolean` | `false` | A flag indicates whether to disable mic auto gain or not. |
| `disableGpu` | `boolean` | `false` | A flag to disable GPU and hardware acceleration (can be useful if the window remains blank). |
| `disableNotifications` | `boolean` | `false` | A flag to disable all notifications. |
| `disableNotificationSound` | `boolean` | `false` | Disable chat/meeting start notification sound. |
| `disableNotificationSoundIfNotAvailable` | `boolean` | `false` | Disables notification sound unless status is Available (e.g. while in a call, busy, etc.). |
| `disableNotificationWindowFlash` | `boolean` | `false` | A flag indicates whether to disable window flashing when there is a notification. |
| `disableGlobalShortcuts` | `array` | `[]` | Array of global shortcuts to disable while the app is in focus. See https://www.electronjs.org/docs/latest/api/accelerator for available accelerators to use. |
| `electronCLIFlags` | `array` | `[]` | Electron CLI flags. |
| `emulateWinChromiumPlatform` | `boolean` | `false` | Use windows platform information in chromium. This is helpful if MFA app does not support Linux. |
| `enableIncomingCallToast` | `boolean` | `false` | Enable incoming call toast. |
| `followSystemTheme` | `boolean` | `false` | Follow system theme. |
| `frame` | `boolean` | `true` | Specify false to create a Frameless Window. Default is true. |
| `incomingCallCommand` | `string` | `null` | Command to execute on an incoming call. (caution: "~" in path is not supported). |
| `incomingCallCommandArgs` | `array` | `[]` | Arguments for the incoming call command. |
| `isCustomBackgroundEnabled` | `boolean` | `false` | A flag indicates whether to enable custom background or not. |
| `logConfig` | `object` | `{ transports: { console: { level: "info" }, file: { level: false } } }` | Electron-log configuration. See logger.js for configurable values. To disable it provide a Falsy value. |
| `meetupJoinRegEx` | `string` | `^https://teams.(microsoft|live).com/.*(?:meetup-join|channel|chat)` | Meetup-join and channel regular expression. |
| `menubar` | `string` | `"auto"` | A value controls the menu bar behaviour. Choices: `auto`, `visible`, `hidden`. |
| `minimized` | `boolean` | `false` | Start the application minimized. |
| `notificationMethod` | `string` | `"web"` | Notification method to be used by the application (web/electron). Choices: `web`, `electron`. |
| `onNewWindowOpenMeetupJoinUrlInApp` | `boolean` | `true` | Open meetupJoinRegEx URLs in the app instead of the default browser. |
| `partition` | `string` | `"persist:teams-4-linux"` | BrowserWindow webpreferences partition. |
| `proxyServer` | `string` | `null` | Proxy Server with format address:port. |
| `sandbox` | `boolean` | `false` | Sandbox for the BrowserWindow (WIP - disabling this might break some functionality). |
| `screenLockInhibitionMethod` | `string` | `"Electron"` | Screen lock inhibition method to be used (Electron/WakeLockSentinel). Choices: `Electron`, `WakeLockSentinel`. |
| `spellCheckerLanguages` | `array` | `[]` | Array of languages to use with Electron's spell checker (experimental). |
| `ssoBasicAuthUser` | `string` | `""` | User to use for SSO basic auth. |
| `ssoBasicAuthPasswordCommand` | `string` | `""` | Command to execute to retrieve password for SSO basic auth. |
| `ssoInTuneEnabled` | `boolean` | `false` | Enable Single-Sign-On using Microsoft InTune. |
| `ssoInTuneAuthUser` | `string` | `""` | User (e-mail) to use for InTune SSO. |
| `trayIconEnabled` | `boolean` | `true` | Enable tray icon. |
| `msTeamsProtocols` | `object` | `{ v1: "^msteams:\/l\/(?:meetup-join|channel|chat)", v2: "^msteams:\/\/teams\.microsoft\.com\/l\/(?:meetup-join|channel|chat)" }` | Regular expressions for Microsoft Teams protocol links (v1 and v2). |
| `url` | `string` | `"https://teams.microsoft.com/v2"` | Microsoft Teams URL. |
| `useMutationTitleLogic` | `boolean` | `true` | Use MutationObserver to update counter from title. |
| `watchConfigFile` | `boolean` | `false` | Watch for changes in the config file and reload the app. |
| `webDebug` | `boolean` | `false` | Enable debug at start. |
| `videoMenu` | `boolean` | `false` | Enable menu entry for controlling video elements. |
