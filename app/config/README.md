# Config

This folder contains the configuration options available for the app.

## Available starting arguments

The application uses [yargs](https://www.npmjs.com/package/yargs) to allow command line arguments.

Here is the list of available arguments and its usage:

| Option | Usage | Default Value |
|:-:|:-:|:-:|
| help  | show the available commands | false |
| version | show the version number | false |
| onlineOfflineReload | Reload page when going from offline to online | true |
| rightClickWithSpellcheck | Enable/Disable the right click menu with spellchecker | true |
| enableDesktopNotificationsHack | Enable electron-desktop-notifications extension hack | false |
| closeAppOnCross | Close the app when clicking the close (X) cross | false |
| partition | [BrowserWindow](https://electronjs.org/docs/api/browser-window) webpreferences partition | persist:teams-4-linux |
| webDebug | Start with the browser developer tools open  |  false |
| minimized | Start the application minimized | false |
| url | url to open | [https://teams.microsoft.com/](https://teams.microsoft.com/) |
| proxyServer | Proxy Server with format address:port | None |
| useElectronDl | Use Electron dl to automatically download files to the download folder | false |
| config | config file location | ~/.config/teams-for-linux/config.json |
| chromeUserAgent | user agent string for chrome | Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3831.6 Safari/537.36 |
| ntlmV2enabled | set enable-ntlm-v2 value | true |
| authServerWhitelist | set auth-server-whitelist value | * |
| customCSSName | Custom CSS name for the packaged available css files. Currently those are: "compactDark", "compactLight", "tweaks", "condensedDark" and "condensedLight" | |
| customCSSLocation | Location for custom CSS styles | |
| customCACertsFingerprints | custom CA Certs Fingerprints to allow SSL unrecognized signer or self signed certificate (see below) | [] |

As an example, to disable the persitence, you can run the following command:

```bash
teams-for-linux --partition nopersist
```

Alternatively, you can use a file called `config.json` with the configuration options. This file needs to be located in `~/.config/teams-for-linux/config.json`

[yargs](https://www.npmjs.com/package/yargs) allows for extra modes of configuration. Refer to their documentation if you prefer to use a configuration file instead of arguments.

Example:

```json
{
    "closeAppOnCross": true
}
```

## Getting custom CA Certs fingerprints

Information about how to get the custom CA Certs fingerprints is now available under the [certificate README.md file](../certificate/README.md)
