# Config

This folder contains the configuration options available for the app. You can
see this options by running the app with the `--help` flag.

```bash
teams-for-linux --help
```

## Available starting arguments

The application uses [yargs](https://www.npmjs.com/package/yargs) to allow
command line arguments.

Here is the list of available arguments and its usage:

| Option                             | Usage                                                                                                                                   | Default Value                                                                                                          |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| appActiveCheckInterval             | A numeric value in seconds as poll interval to check if the system is active from being idle                                            | 2                                                                                                                      |
| appIcon                            | Teams app icon to show in the tray                                                                                                      |                                                                                                                        |
| appIconType                        | Type of tray icon to be used default/light/dark                                                                                         | _default_, light, dark                                                                                                 |
| appIdleTimeout                     | A numeric value in seconds as duration before app considers the system as idle                                                          | 300                                                                                                                    |
| appIdleTimeoutCheckInterval        | A numeric value in seconds as poll interval to check if the appIdleTimeout is reached                                                   | 10                                                                                                                     |
| appTitle                           | A text to appear as the tray tooltip                                                                                                    | Microsoft Teams                                                                                                        |
| authServerWhitelist                | Set auth-server-whitelist value (string)                                                                                                | \*                                                                                                                     |
| awayOnSystemIdle                   | Boolean to set the user status as away when system goes idle                                                                            | false                                                                                                                  |
| chromeUserAgent                    | Google Chrome User Agent                                                                                                                | Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36 |
| class                              | A custom value for the WM_CLASS property                                                                                                |                                                                                                                        |
| contextIsolation                   | Use context isolation in the renderer process (disabling this will break some functionality)                                            | false                                                                                                                  |
| customBGServiceBaseUrl             | Base URL of the server which provides custom background images                                                                          | <http://localhost>                                                                                                       |
| customBGServiceConfigFetchInterval | A numeric value in seconds as poll interval to download background service config download                                              | 0                                                                                                                      |
| customCACertsFingerprints          | Array of custom CA Certs Fingerprints to allow SSL unrecognized signer or self signed certificate                                       | []                                                                                                                     |
| customCSSName                      | custom CSS name for the packaged available css files                                                                                    |                                                                                                                        |
| customCSSLocation                  | custom CSS styles file location                                                                                                         |                                                                                                                        |
| clearStorageData                   | Flag to clear storage data. Expects an object of the type <https://www.electronjs.org/docs/latest/api/session#sesclearstoragedataoptions> | null   |
| clientCertPath | Custom Client Certs for corporate authentication (certificate must be in pkcs12 format) | string |
| clientCertPassword | Custom Client Certs password for corporate authentication (certificate must be in pkcs12 format) | string |
| closeAppOnCross | Close the app when clicking the close (X) cross |false |
| defaultNotificationUrgency | Default urgency for new notifications (`low`/`normal`/`critical`). Only applicable when `notificationMethod` is `electron` | normal |
| defaultURLHandler | Default application to be used to open the HTTP URLs (string) | |
| disableAutogain | Disable mic auto gain or not | false |
| disableGpu | Disable GPU and hardware acceleration (can be useful if the window remains blank) | false |
| disableNotifications | Disable all notifications | false |
| disableNotificationSound | Disable chat/meeting start notification sound | false |
| disableNotificationSoundIfNotAvailable | Disables notification sound unless status is Available (e.g. while in a call, busy, etc.) | false |
| disableNotificationWindowFlash | Disable window flashing when there is a notification | false |
| disableGlobalShortcuts | Array of global shortcuts to disable while the app is in focus. See <https://www.electronjs.org/docs/latest/api/accelerator> for available accelerators to use | [] |
| electronCLIFlags | Electron CLI flags to be added when the app starts | [] |
| emulateWinChromiumPlatform| Use windows platform information in chromium. This is helpful if MFA app does not support Linux.| false |
| followSystemTheme | Boolean to determine if to follow system theme | false |
| frame | Specify false to create a Frameless Window. Default is true | false |
| isCustomBackgroundEnabled | A boolean flag to enable/disable custom background images | false |
| logConfig | A string value to set the log manager to use (`Falsy`, `console`, or a valid electron-log configuration) | **console.info** via (electron-log) |
| meetupJoinRegEx | Meetup-join and channel regular expession | /^https:\/\/teams\.(microsoft\|live)\.com\/.*(?:meetup-join\|channel\|chat)/g | |
menubar | A value controls the menu bar behaviour | _auto_, visible, hidden |
| minimized | Boolean to start the application minimized | false |
| notificationMethod | Notification method to be used by the application (`web`/`electron`) | _web_, electron |
| onNewWindowOpenMeetupJoinUrlInApp | Open meetupJoinRegEx URLs in the app instead of the default browser | true |
| partition | BrowserWindow webpreferences partition | persist:teams-4-linux |
| proxyServer | Proxy Server with format address:port (string) | null |
| sandbox | Sandbox for the renderer process (disabling this will break functionality) | false |
| screenLockInhibitionMethod | Screen lock inhibition method to be used (`Electron`/`WakeLockSentinel`) | *Electron\*, WakeLockSentinel |
| spellCheckerLanguages | Array of languages to use with Electron's spell checker | [] |
| ssoBasicAuthUser | Login that will be sent for basic_auth SSO login. (string) | |
| ssoBasicAuthPasswordCommand | Command to execute, grab stdout and use it as a password for basic_auth SSO login. | |
| ssoInTuneEnabled | Enable InTune Single-Sign-On | false |
| ssoInTuneAuthUser | User (e-mail) to be used for InTune SSO login. | |
| trayIconEnabled | Enable tray icon | true | | url | Microsoft Teams URL (string) | <https://teams.microsoft.com/v2> |
| useMutationTitleLogic | Use MutationObserver to update counter from title | true |
| version | Show the version number | false |
| watchConfigFile | Watch for changes in the config file and restarts the app | false |
| webDebug | Enable web debugging | false |

## Example usage

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

## Electron CLI flags

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

# Additional Documentation

The Teams for Linux project includes several extra features that enhance its
functionality. For detailed instructions on each feature, please refer to the
corresponding documentation:

- **Multiple Teams Instances:**  
  If you want to run multiple instances of Teams for Linux simultaneously, refer
  to the [Multiple Instances README](MULTIPLE_INSTANCES.md).

- **Custom Backgrounds:**  
  To set up custom background images during video calls, please review the
  [Custom Backgrounds README](../customBackground/README.md).

- **LogConfig:**  
  For details on configuring logging behavior—including options to log to the
  console or use electron-log—see the [LogConfig README](LOG_CONFIG.md).

- **Custom CA Certs:**  
  To retrieve custom CA certificates fingerprints, please see the
  [Certificate README](../certificate/README.md).
