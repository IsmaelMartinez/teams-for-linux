# Config

This folder contains the configuration options available for the app.

## Available starting arguments

The application uses [yargs](https://www.npmjs.com/package/yargs) to allow command line arguments.

Here is the list of available arguments and its usage:

| Option | Usage | Default Value |
|:-:|:-:|:-:|
| help  | show the available commands | false |
| version | show the version number | false |
| disableDesktopNotificationsHack | disable electron-desktop-notifications extension hack | false |
| closeAppOnCross | Close the app when clicking the close (X) cross | false | 
| partition | [BrowserWindow](https://electronjs.org/docs/api/browser-window) webpreferences partition | persist:teams-4-linux |
| webDebug | start with the browser developer tools open  |  false |
| url | url to open | https://teams.microsoft.com/ |
| config | config file location | ~/.config/teams.json |
| edgeUserAgent | user agent string for edge | Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36 Edge/42.17134 |
| chromeUserAgent | user agent string for chrome | Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36 |
| ntlmV2enabled | set enable-ntlm-v2 value | true |
| authServerWhitelist | set auth-server-whitelist value | * |

As an example, to disable the persitence, you can run the following command:

```bash
teams --partition nopersist
```

[yargs](https://www.npmjs.com/package/yargs) allows for extra modes of configuration. Refer to their documentation if you prefer to use a configuration file instead of arguments.