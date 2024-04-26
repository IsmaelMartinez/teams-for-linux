# Config

This folder contains the configuration options available for the app.

## Available starting arguments

The application uses [yargs](https://www.npmjs.com/package/yargs) to allow command line arguments.

Here is the list of available arguments and its usage:

| Option                          | Usage                                                                                      | Default Value         |
|---------------------------------|--------------------------------------------------------------------------------------------|-----------------------|
| appActiveCheckInterval          | A numeric value in seconds as poll interval to check if the system is active from being idle | 2                     |
| appIcon                         | Teams app icon to show in the tray                                                       |                       |
| appIconType                     | Type of tray icon to be used default/light/dark                                           | default               |
| appIdleTimeout                  | A numeric value in seconds as duration before app considers the system as idle             | 300                   |
| appIdleTimeoutCheckInterval     | A numeric value in seconds as poll interval to check if the appIdleTimeout is reached      | 10                    |
| appLogLevels                    | Comma separated list of log levels (error,warn,info,debug)                                | error,warn            |
| appTitle                        | A text to be suffixed with page title                                                    | Microsoft Teams       |
| authServerWhitelist             | Set auth-server-whitelist value                                                           | string                |
| awayOnSystemIdle                | Sets the user status as away when system goes idle                                        | false               |
| chromeUserAgent                 | Google Chrome User Agent                                                                 | string                |
| customBGServiceBaseUrl          | Base URL of the server which provides custom background images                            | string                |
| customBGServiceIgnoreMSDefaults | A flag indicates whether to ignore Microsoft provided images or not                       | false               |
| customBGServiceConfigFetchInterval | A numeric value in seconds as poll interval to download background service config download | number                |
| customCACertsFingerprints       | Array of custom CA Certs Fingerprints to allow SSL unrecognized signer or self signed certificate | []             |
| customCSSName                   | custom CSS name for the packaged available css files                                      | string                |
| customCSSLocation               | custom CSS styles file location                                                           | string                |
| followSystemTheme               | Follow system theme                                                                      | false               |
| customUserDir                   | Custom User Directory so that you can have multiple profiles                              | string                |
| clearStorage                    | Whether to clear the storage before creating the window or not                            | false               |
| clientCertPath                  | Custom Client Certs for corporate authentication (certificate must be in pkcs12 format)   | string                |
| clientCertPassword              | Custom Client Certs password for corporate authentication (certificate must be in pkcs12 format) | string          |
| closeAppOnCross                 | Close the app when clicking the close (X) cross                                           | false               |
| defaultNotificationUrgency | Default urgency for new notifications (`low`/`normal`/`critical`). Only applicable when `notificationMethod` is `electron` | normal |
| defaultURLHandler               | Default application to be used to open the HTTP URLs                                      | string                |
| disableAutogain                 | A flag indicates whether to disable mic auto gain or not                                  | false               |
| disableGpu                      | A flag to disable GPU and hardware acceleration (can be useful if the window remains blank) | false               |
| disableMeetingNotifications     | Whether to disable meeting notifications or not                                           | false               |
| disableNotifications            | A flag to disable all notifications                                                      | false               |
| disableNotificationSound        | Disable chat/meeting start notification sound                                            | false               |
| disableNotificationSoundIfNotAvailable | Disables notification sound unless status is Available (e.g. while in a call, busy, etc.) | false         |
| disableNotificationWindowFlash  | A flag indicates whether to disable window flashing when there is a notification          | false               |
| electronCLIFlags | Electron CLI flags to be added when the app starts | [] |
| incomingCallCommand             | Command to execute on an incoming call.                                                   |                       |
| incomingCallCommandArgs         | Arguments for the incomming call command.                                                 |                       |
| isCustomBackgroundEnabled	   | A flag indicates whether to enable custom background images or not                       | true               |
| menubar                         | A value controls the menu bar behaviour                                                   | string                |
| minimized                       | Start the application minimized                                                          | false               |
| notificationMethod | Notification method to be used by the application (`web`/`electron`) | web |
| ntlmV2enabled                   | Set enable-ntlm-v2 value                                                                 | string                |
| onlineCheckMethod               | Type of network test for checking online status.                                          | string                |
| optInTeamsV2                    | Opt in to use Teams V2                                                                   | false               |
| partition                       | BrowserWindow webpreferences partition                                                    | string                |
| proxyServer                     | Proxy Server with format address:port                                                     | string                |
| screenLockInhibitionMethod      | Screen lock inhibition method to be used (`Electron`/`WakeLockSentinel`)                      | Electron                |
| spellCheckerLanguages           | Array of languages to use with Electron's spell checker                    | []                 |
| url                             | Microsoft Teams URL                                                                      | string                |
| useMutationTitleLogic         | Use MutationObserver to update counter from title                                          | true               |
| version                         | Show the version number                                                                  | false                 |
| webDebug                        | Enable web debugging                                                                     | false               |


As an example, to disable the persistence, you can run the following command:

```bash
teams-for-linux --partition nopersist
```

Alternatively, you can use a file called `config.json` with the configuration options. This file needs to be located in `~/.config/teams-for-linux/config.json`.
For Snap installations, the file is located in `~/snap/teams-for-linux/current/.config/teams-for-linux/config.json` and for Flatpak it is located in `~/.var/app/com.github.IsmaelMartinez.teams_for_linux/config/teams-for-linux/config.json`.

[yargs](https://www.npmjs.com/package/yargs) allows for extra modes of configuration. Refer to their documentation if you prefer to use a configuration file instead of arguments.

Example:

```json
{
    "closeAppOnCross": true
}
```

## Getting custom CA Certs fingerprints

Information about how to get the custom CA Certs fingerprints is now available under the [certificate README.md file](../certificate/README.md)

## Electron CLI flags

Now the `config.json` can have electron CLI flags which will be added when the application starts.

Example:

```json
{
    "electronCLIFlags": [
		["ozone-platform","wayland"]
		"disable-software-rasterizer"
	]
}
```

As you can see from the above example, switches with values must be of array where the first entry will be the switch and the second one will be the value. It can be a simple string otherwise.


## Custom backgrounds

We added a feature to load custom background images during a video call. This is available from version `1.0.84`.

### Things to remember:

1. Currently app does not feature adding or removing custom images. You have to rely on any locally/remotely hosted web servers to serve images.
2. 3 new command-line parameters `customBGServiceBaseUrl`, `customBGServiceIgnoreMSDefaults` and `customBGServiceConfigFetchInterval` are introduced. See above for details.
3. Custom images are always loaded with `<customBGServiceBaseUrl>/<image-path>`. So, you have to make sure the web server is running and `<customBGServiceBaseUrl>` responds to the request.
4. You can choose any web server of your choice but make sure `Access-Control-Allow-Origin` is set to `*` in response headers from web server.

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
2. It would look like this:
```js
[
	{
		"filetype": "jpg",
		"id": "Custom_bg01",
		"name": "Custom bg",
		"src": "/<path-to-image>",
		"thumb_src": "/<path-to-thumb-image>"
	}
]

```
As you can see from the above example, it's a JSON array so you can configure any number of images of your choice.

### About the entries
- `filetype`: Type of image (Ex: jpg)
- `id`: Id of the image. Give a unique name without spaces.
- `name`: Name of your image.
- `src`: Path to the image to be loaded when selected from the preview. Provide a picture with resolution 1920x1080 (Based on Microsoft CDN) though any resolution would work. This is to avoid unnecessary traffic by loading large size images.
- `thumb_src`: Path to the image to be shown on the preview screen. Provide a low resolution picture (280x158 based on Microsoft CDN) as it's shown on the preview page. The smaller the image the quicker the preview will be. 

Image paths are relative to `customBGServiceBaseUrl`. If your image is at `https://example.com/images/sample.jpg`, then `src` would be `/images/sample.jpg`.
