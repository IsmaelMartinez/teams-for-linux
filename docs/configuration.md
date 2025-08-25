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

## System-wide Configuration

Teams for Linux supports system-wide configuration files for enterprise and multi-user environments. The system-wide configuration file should be placed at:

```
/etc/teams-for-linux/config.json
```

### Configuration Precedence

The application loads configuration in the following order:

1. **System-wide config** (if present): `/etc/teams-for-linux/config.json`
2. **User config** (if present): User's config directory (e.g., `~/.config/teams-for-linux/config.json`)
3. **Default values**: Built-in application defaults

User configurations take precedence over system-wide configurations. This allows administrators to set organization-wide defaults while still allowing individual users to customize their settings.

### Example System-wide Config

System administrators can create `/etc/teams-for-linux/config.json` to set organization-wide defaults:

```json
{
  "closeAppOnCross": false,
  "disableNotifications": false,
  "screenSharingThumbnail": {
    "enabled": true
  },
  "customCSSName": "compactDark"
}
```

Users can then override specific settings in their personal config files while inheriting the system-wide defaults for other options.

**Related GitHub Issues:** [Issue #1773](https://github.com/IsmaelMartinez/teams-for-linux/issues/1773)

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

## Cache Management

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
|---|---|---|---|
| `enabled` | `boolean` | `true` | Enable/disable automatic cache management |
| `maxCacheSizeMB` | `number` | `300` | Maximum cache size in MB before cleanup |
| `cacheCheckIntervalMs` | `number` | `3600000` | How often to check cache size in milliseconds (1 hour) |

### What Gets Cleaned vs Preserved

**Cleaned:**
- Cache directories (main cache, GPU cache, code cache)
- Partition-specific cached data 
- Temporary WAL files that cause token corruption
- Non-essential IndexedDB and WebStorage data

**Preserved:**
- Authentication tokens and login credentials
- User preferences and settings
- Essential persistent storage

### Monitoring and Manual Cleanup

Enable debug logging to monitor cache activities:
```bash
teams-for-linux --logConfig='{"level":"debug"}'
```

For manual cache cleanup:
```bash
# Stop Teams for Linux first
pkill -f "teams-for-linux"

# Remove cache directories
rm -rf ~/.config/teams-for-linux/Cache/*
rm -rf ~/.config/teams-for-linux/Partitions/teams-4-linux/Cache/*
rm -rf ~/.config/teams-for-linux/Partitions/teams-4-linux/IndexedDB/*

# Remove problematic temporary files
rm -f ~/.config/teams-for-linux/DIPS-wal
rm -f ~/.config/teams-for-linux/SharedStorage-wal
rm -f ~/.config/teams-for-linux/Cookies-journal
```

## MQTT Integration

> [!TIP]
> The MQTT integration allows Teams for Linux to publish your Teams status to an MQTT broker for home automation systems like Home Assistant, openHAB, or custom IoT projects.

Teams for Linux can publish your Microsoft Teams status changes to an MQTT broker in real-time. This enables integration with smart home systems, status lights, notification systems, and other automation workflows.

### Configuration

```json
{
  "mqtt": {
    "enabled": true,
    "brokerUrl": "mqtt://your-mqtt-broker:1883",
    "username": "your-username",
    "password": "your-password",
    "clientId": "teams-for-linux",
    "topicPrefix": "teams",
    "statusTopic": "status"
  }
}
```

| Option | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `false` | Enable/disable MQTT status publishing |
| `brokerUrl` | `string` | `""` | MQTT broker URL (e.g., `mqtt://192.168.1.100:1883`, `mqtts://broker.hivemq.com:8883`) |
| `username` | `string` | `""` | MQTT broker username (optional) |
| `password` | `string` | `""` | MQTT broker password (optional) |
| `clientId` | `string` | `"teams-for-linux"` | Unique identifier for this MQTT client |
| `topicPrefix` | `string` | `"teams"` | MQTT topic prefix |
| `statusTopic` | `string` | `"status"` | MQTT topic name for status messages |

### Published Messages

Status updates are published to `{topicPrefix}/{statusTopic}` (e.g., `teams/status`) as JSON messages:

```json
{
  "status": "available",
  "statusCode": 1,
  "timestamp": "2025-08-25T15:30:45.123Z",
  "clientId": "teams-for-linux"
}
```

**Status Values:**
- `available` (code: 1) - Available/Online
- `busy` (code: 2) - Busy/In a call/In a meeting
- `do_not_disturb` (code: 3) - Do Not Disturb/Focusing
- `away` (code: 4) - Away/Inactive
- `be_right_back` (code: 5) - Be Right Back

### Home Assistant Integration Example

```yaml
# configuration.yaml
mqtt:
  sensor:
    - name: "Teams Status"
      state_topic: "teams/status"
      value_template: "{{ value_json.status }}"
      json_attributes_topic: "teams/status"
      json_attributes_template: "{{ value_json | tojson }}"
      icon: mdi:microsoft-teams

automation:
  - alias: "Teams Status Light"
    trigger:
      platform: mqtt
      topic: teams/status
    action:
      - service: light.turn_on
        target:
          entity_id: light.office_status
        data:
          color_name: >
            {% if trigger.payload_json.status == 'available' %}
              green
            {% elif trigger.payload_json.status == 'busy' %}
              red
            {% elif trigger.payload_json.status == 'away' %}
              yellow
            {% else %}
              blue
            {% endif %}
```

### Security Considerations

- Use strong authentication (username/password) for your MQTT broker
- Consider using MQTTS (MQTT over TLS) with `mqtts://` URLs for encrypted communication
- Configure your MQTT broker to restrict client permissions appropriately
- Keep your MQTT credentials secure and avoid committing them to version control

### Troubleshooting

**Connection Issues:**
- Verify MQTT broker URL and port are correct
- Check username/password if authentication is required
- Ensure firewall allows connections to MQTT broker port

**No Status Updates:**
- Verify Teams status is changing (check Teams interface)
- Enable debug logging: `teams-for-linux --logConfig='{"level":"debug"}'`
- Check MQTT broker logs for connection and publishing activity

**Testing MQTT Connection:**
```bash
# Subscribe to status messages (requires mosquitto-clients)
mosquitto_sub -h your-broker-ip -p 1883 -u username -P password -t "teams/status" -v

# Test publishing (for verification)
mosquitto_pub -h your-broker-ip -p 1883 -u username -P password -t "teams/status" -m '{"status":"test","statusCode":0}'
```

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
| `disableTimestampOnCopy` | `boolean` | `false` | Controls whether timestamps are included when copying messages in chats. |
| `class` | `string` | `null` | A custom value for the WM_CLASS property. |
| `cacheManagement` | `object` | `{ enabled: true, maxCacheSizeMB: 300, cacheCheckIntervalMs: 3600000 }` | Cache management configuration to prevent daily logout issues. |
| `clearStorageData` | `boolean` | `null` | Flag to clear storage data. Expects an object of the type https://www.electronjs.org/docs/latest/api/session#sesclearstoragedataoptions. |
| `clientCertPath` | `string` | `""` | Custom Client Certs for corporate authentication (certificate must be in pkcs12 format). |
| `clientCertPassword` | `string` | `""` | Custom Client Certs password for corporate authentication (certificate must be in pkcs12 format). |
| `closeAppOnCross` | `boolean` | `false` | Close the app when clicking the close (X) cross. |
| `defaultNotificationUrgency` | `string` | `"normal"` | Default urgency for new notifications (low/normal/critical). Choices: `low`, `normal`, `critical`. |
| `defaultURLHandler` | `string` | `""` | Default application to be used to open the HTTP URLs. |
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
| `mqtt` | `object` | `{ enabled: false, brokerUrl: "", username: "", password: "", clientId: "teams-for-linux", topicPrefix: "teams", statusTopic: "status" }` | MQTT integration configuration for publishing Teams status updates to an MQTT broker. See MQTT Integration section for details. |
| `notificationMethod` | `string` | `"web"` | Notification method to be used by the application (web/electron). Choices: `web`, `electron`. |
| `onNewWindowOpenMeetupJoinUrlInApp` | `boolean` | `true` | Open meetupJoinRegEx URLs in the app instead of the default browser. |
| `partition` | `string` | `"persist:teams-4-linux"` | BrowserWindow webpreferences partition. |
| `proxyServer` | `string` | `null` | Proxy Server with format address:port. |
| `screenSharingThumbnail` | `object` | `{ enabled: true, alwaysOnTop: true }` | Automatically show a thumbnail window when screen sharing is active. |
| `screenLockInhibitionMethod` | `string` | `"Electron"` | Screen lock inhibition method to be used (Electron/WakeLockSentinel). Choices: `Electron`, `WakeLockSentinel`. |
| `spellCheckerLanguages` | `array` | `[]` | Array of languages to use with Electron's spell checker (experimental). |
| `ssoBasicAuthUser` | `string` | `""` | User to use for SSO basic auth. |
| `ssoBasicAuthPasswordCommand` | `string` | `""` | Command to execute to retrieve password for SSO basic auth. |
| `ssoInTuneEnabled` | `boolean` | `false` | Enable Single-Sign-On using Microsoft InTune. |
| `ssoInTuneAuthUser` | `string` | `""` | User (e-mail) to use for InTune SSO. |
| `trayIconEnabled` | `boolean` | `true` | Enable tray icon. |
| `msTeamsProtocols` | `object` | `{ v1: "^msteams:\/l\/(?:meetup-join|channel|chat|message)", v2: "^msteams:\/\/teams\.microsoft\.com\/l\/(?:meetup-join|channel|chat|message)" }` | Regular expressions for Microsoft Teams protocol links (v1 and v2). |
| `url` | `string` | `"https://teams.microsoft.com/v2"` | Microsoft Teams URL. |
| `useMutationTitleLogic` | `boolean` | `true` | Use MutationObserver to update counter from title. |
| `watchConfigFile` | `boolean` | `false` | Watch for changes in the config file and reload the app. |
| `webDebug` | `boolean` | `false` | Enable debug at start. |
| `videoMenu` | `boolean` | `false` | Enable menu entry for controlling video elements. |
