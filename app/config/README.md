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
| customBGServiceBaseUrl             | Base URL of the server which provides custom background images                                                                          | http://localhost                                                                                                       |
| customBGServiceConfigFetchInterval | A numeric value in seconds as poll interval to download background service config download                                              | 0                                                                                                                      |
| customCACertsFingerprints          | Array of custom CA Certs Fingerprints to allow SSL unrecognized signer or self signed certificate                                       | []                                                                                                                     |
| customCSSName                      | custom CSS name for the packaged available css files                                                                                    |                                                                                                                        |
| customCSSLocation                  | custom CSS styles file location                                                                                                         |                                                                                                                        |
| customUserDir (deprecated)         | Deprecated: Use `--user-data-dir` env variable instead.                                                                                 | null                                                                                                                   |
| clearStorage (deprecated)          | Deprecated: Use `clearStorageData` instead.                                                                                             | false                                      |
| clearStorageData                   | Flag to clear storage data. Expects an object of the type https://www.electronjs.org/docs/latest/api/session#sesclearstoragedataoptions | null   |
| clientCertPath | Custom Client Certs for corporate authentication (certificate must be in pkcs12 format) | string |
| clientCertPassword | Custom Client Certs password for corporate authentication (certificate must be in pkcs12 format) | string |
| closeAppOnCross | Close the app when clicking the close (X) cross |false |
| defaultNotificationUrgency | Default urgency for new notifications (`low`/`normal`/`critical`). Only applicable when `notificationMethod` is `electron` | normal |
| defaultURLHandler | Default application to be used to open the HTTP URLs (string) | |
| disableAutogain | Disable mic auto gain or not | false |
| disableGpu | Disable GPU and hardware acceleration (can be useful if the window remains blank) | false |
| disableMeetingNotifications | Disable meeting notifications | false |
| disableNotifications | Disable all notifications | false |
| disableNotificationSound | Disable chat/meeting start notification sound | false |
| disableNotificationSoundIfNotAvailable | Disables notification sound unless status is Available (e.g. while in a call, busy, etc.) | false |
| disableNotificationWindowFlash | Disable window flashing when there is a notification | false |
| disableGlobalShortcuts | Array of global shortcuts to disable while the app is in focus. See https://www.electronjs.org/docs/latest/api/accelerator for available accelerators to use | [] |
| electronCLIFlags | Electron CLI flags to be added when the app starts | [] |
| emulateWinChromiumPlatform| Use windows platform information in chromium. This is helpful if MFA app does not support Linux.| false |
| followSystemTheme | Boolean to determine if to follow system theme | false |
| frame | Specify false to create a Frameless Window. Default is true | false |
| incomingCallCommand | Command to execute on an incoming call. (string) | |
| incomingCallCommandArgs | Arguments for the incomming call command. | [] |
| isCustomBackgroundEnabled | A boolean flag to enable/disable custom background images | false |
| logConfig | A string value to set the log manager to use (`Falsy`, `console`, or a valid electron-log configuration) | **console.info** via (electron-log) |
| meetupJoinRegEx | Meetup-join and channel regular expession | /^https:\/\/teams\.(microsoft\|live)\.com\/.*(?:meetup-join\|channel\|chat)/g | |
menubar | A value controls the menu bar behaviour | *auto*, visible, hidden |
| minimized | Boolean to start the application minimized | false |
| notificationMethod | Notification method to be used by the application (`web`/`electron`) | *web*, electron |
| ntlmV2enabled | Set enable-ntlm-v2 value | 'true' |
| partition | BrowserWindow webpreferences partition | persist:teams-4-linux |
| proxyServer | Proxy Server with format address:port (string) | null |
| sandbox | Sandbox for the renderer process (disabling this will break functionality) | false |
| screenLockInhibitionMethod | Screen lock inhibition method to be used (`Electron`/`WakeLockSentinel`) | *Electron\*, WakeLockSentinel |
| spellCheckerLanguages | Array of languages to use with Electron's spell checker | [] |
| ssoBasicAuthUser | Login that will be sent for basic_auth SSO login. (string) | |
| ssoBasicAuthPasswordCommand | Command to execute, grab stdout and use it as a password for basic_auth SSO login. | |
| ssoInTuneEnabled | Enable InTune Single-Sign-On | false |
| ssoInTuneAuthUser | User (e-mail) to be used for InTune SSO login. | |
| trayIconEnabled | Enable tray icon | true | | url | Microsoft Teams URL (string) | https://teams.microsoft.com/ |
| useMutationTitleLogic | Use MutationObserver to update counter from title | true |
| version | Show the version number | false |
| watchConfigFile | Watch for changes in the config file and restarts the app | false |
| webDebug | Enable web debugging | false |

As an example, to disable the persistence, you can run the following command:

```bash
teams-for-linux --partition nopersist
```

Alternatively, you can use a file called `config.json` with the configuration
options. This file needs to be located in
`~/.config/teams-for-linux/config.json`. For Snap installations, the file is
located in `~/snap/teams-for-linux/current/.config/teams-for-linux/config.json`
and for Flatpak it is located in
`~/.var/app/com.github.IsmaelMartinez.teams_for_linux/config/teams-for-linux/config.json`.

[yargs](https://www.npmjs.com/package/yargs) allows for extra modes of
configuration. Refer to their documentation if you prefer to use a configuration
file instead of arguments.

Example:

```json
{
  "closeAppOnCross": true
}
```

## Getting custom CA Certs fingerprints

Information about how to get the custom CA Certs fingerprints is now available
under the [certificate README.md file](../certificate/README.md)

## Electron CLI flags

Now the `config.json` can have electron CLI flags which will be added when the
application starts.

Example:

```json
{
  "electronCLIFlags": [
    ["ozone-platform", "wayland"],
    "disable-software-rasterizer"
  ]
}
```

As you can see from the above example, switches with values must be of array
where the first entry will be the switch and the second one will be the value.
It can be a simple string otherwise.

## Custom backgrounds

We added a feature to load custom background images during a video call.

You can find an example of this feature in the
[../customBackground/example/README.md](../customBackground/example/README.md)
file.

### Things to remember

1. Currently app does not feature adding or removing custom images. You have to
   rely on any locally/remotely hosted web servers to serve images.
1. 2 config options, `customBGServiceBaseUrl` and
   `customBGServiceConfigFetchInterval` are introduced. See above for details.
1. Custom images are always loaded with `<customBGServiceBaseUrl>/<image-path>`.
   So, you have to make sure the web server is running and
   `<customBGServiceBaseUrl>` responds to the request.
1. You can choose any web server of your choice but make sure
   `Access-Control-Allow-Origin` is set to `*` in response headers from web
   server.
1. This will replace Microsoft's default images.
1. To use you must activate the flag `--isCustomBackgroundEnabled=true`.

For apache2, `/etc/apache2/apache2.conf` may need to have an entry like this.

```xml
<Directory /var/www/>
 Header set Access-Control-Allow-Origin "*"
 Options Indexes FollowSymLinks
 AllowOverride None
 Require all granted
</Directory>
```

### Configuring list of images

1. List of images are to be stored in `<customBGServiceBaseUrl>/config.json`.
1. It would look like this:

```json
{
  "videoBackgroundImages": [
    {
      "filetype": "png",
      "id": "Custom_bg01",
      "name": "Custom bg",
      "src": "/evergreen-assets/backgroundimages/<path-to-image>",
      "thumb_src": "/evergreen-assets/backgroundimages/<path-to-thumb-image>"
    }
  ]
}
```

As you can see from the above example, it's a JSON array so you can configure
any number of images of your choice.

### About the entries

- `filetype`: Type of image (Ex: jpg)
- `id`: Id of the image. Give a unique name without spaces.
- `name`: Name of your image.
- `src`: Path to the image to be loaded when selected from the preview. Provide
  a picture with resolution 1920x1080 (Based on Microsoft CDN) though any
  resolution would work. This is to avoid unnecessary traffic by loading large
  size images.
- `thumb_src`: Path to the image to be shown on the preview screen. Provide a
  low resolution picture (280x158 based on Microsoft CDN) as it's shown on the
  preview page. The smaller the image the quicker the preview will be.

Image paths are relative to `customBGServiceBaseUrl`. If your
`customBGServiceBaseUrl` is `https://example.com` and your image is at
`https://example.com/images/sample.jpg`, then `src` would be
`/images/sample.jpg` and in Teams V2 `src` would be
`/evergreen-assets/backgroundimages/images/sample.jpg`.

## LogConfig option

In version 1.9.0 we added the ability to log to the console (default), or use
electron-log as your log manager or to not log at all.

This is managed by the `logConfig` option, that has the following options:

| Option                       | Usage                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Falsy                        | Any [Falsy](https://developer.mozilla.org/en-US/docs/Glossary/Falsy) value as described would result in no logs recorded |
| console                      | Log to the console using the `console` object                                                                            |
| {} JSONObject (\*) - default | A valid [electron-log](https://www.npmjs.com/package/electron-log) configuration object.                                 |

(\*) The JSONObject must be a valid `electron-log` configuration object. You can
see the available options in the
[electron-log documentation](https://www.npmjs.com/package/electron-log).

### Examples of `electron-log` config options

You have some simple options to use the `electron-log` as your log manager.
Like:

**Current configuration**

- Making console level as `info` and disabling the log to file. :

```json
{
  "logConfig": {
    "transports": {
      "console": {
        "level": "info"
      },
      "file": {
        "level": false
      }
    }
  }
}
```

- Use the default `electron-log` values:

```json
{ "logConfig": {} }
```

Or more complex:

- Changing the console log format and rotating the file logs:

```json
{
  "logConfig": {
    "transports": {
      "file": {
        "maxSize": 100000,
        "format": "{processType} [{h}:{i}:{s}.{ms}] {text}",
        "level": "debug"
      },
      "console": {
        "format": "[{h}:{i}:{s}.{ms}] {text}",
        "level": "info"
      }
    }
  }
}
```

### Limitations

I haven't explore all the options available in the `electron-log` configuration,
so I can't guarantee all the options would work. (specially those options that
require a function to be passed)
