# teams-for-linux

[![Build Status](https://travis-ci.org/IsmaelMartinez/teams-for-linux.svg?branch=master)](https://travis-ci.org/IsmaelMartinez/teams-for-linux)

Unofficial Microsoft Teams client for Linux using [Electron](https://electronjs.org/).
It uses the Web App and wraps it as a standalone application using Electron.

## Install

You can download the tarball, rpm or deb from the [releases page](https://github.com/IsmaelMartinez/teams-for-linux/releases).

## Run from source

```bash
yarn start
```

## Available starting arguments

The application uses [yargs](https://www.npmjs.com/package/yargs) to allow command line arguments.

Here is the list of available arguments and its usage:

| Option | Usage | Default Value |
|:-:|:-:|:-:|
| help  | show the available commands  |  false |
| version  | show the version number  |  false |
| disableDesktopNotifications | disable electron-desktop-notifications extension | false |
| partition | [BrowserWindow](https://electronjs.org/docs/api/browser-window) webpreferences partition  | persist:teams-4-linux |
| webDebug  | start with the browser developer tools open  |  false |
| url  | url to open |  https://teams.microsoft.com/ |
| config | config file location | ~/.config/teams.json |
| edgeUserAgent  |  user agent string for edge | Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) 69.0.3497.100 Safari/537.36 Edge/42.17134  |
| chromeUserAgent  |  user agent string for chrome |  Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36 |
| ntlmV2enabled | enable-ntlm-v2 value | true |
| authServerWhitelist | auth-server-whitelist value | * |


As an example, to disable the persitence, you can run the following command:
```bash
yarn start --partition nopersist
```

## Known issues

### No history
Switching the userAgent with the persistence turn on sometimes have the side effect of "loosing" the channels history. Removing the data under `~/.config/teams-for-linux` should fix the issue.

### Double notifications
Some notifications daemons in linux can end up generating double notifications (like in the cast of Dunst). If this happen you can run the application with `teams --disableDesktopNotifications` that will disable the notifications implemented in this client.

## License

[GPLv3](LICENSE.md)
