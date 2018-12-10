# teams-for-linux

[![Build Status](https://travis-ci.org/IsmaelMartinez/teams-for-linux.svg?branch=master)](https://travis-ci.org/IsmaelMartinez/teams-for-linux)

Unofficial Microsoft Teams client for Linux using [Electron](https://electronjs.org/).
It uses the Web App and wraps it as a standalone application using Electron.

## History
This branch is a child fork of [JamieMagee teams-for-linux](https://github.com/JamieMagee/teams-for-linux) that is itself a fork of (Ivelkov teams-for-linux)[https://github.com/ivelkov/teams-for-linux]. 

Jamie has express his desire to refactor this project in Typescript and to support it, but he doesn't have the time to support it at the moment. I have tried to contact Ivelkov for a few months but haven't receive any answers. 

Ideally this project will die when Microsoft implements a desktop client for linux. Please do vote for it in the [Microsoft Suggestions Forum](https://microsoftteams.uservoice.com/forums/555103-public/suggestions/16911565-linux-client)

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
| help  | show the available commands | false |
| version | show the version number | false |
| disableDesktopNotificationsHack | disable electron-desktop-notifications extension hack | false |
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

## Developing
This is a fairly small project, ideal size to get started with electron.

Just clone the code and dive in. The app/index.js is the starting of all the application. 

I will be adding README.md files to each folder explaining the reason of each folder.

### Version number
The way I have been doing developing is by creating a branch with the next version number. I am not following SemVer at the moment, just increasing the lower number is enought. 

This is mainly because the history of this fork. Jamie has express his desire to refactor this project (0.2.0 branch) in Typescript and to support it, but he is as short with time as me.

## Known issues

### Oauth services
Some services requires the app to open the windows in electron. An example is github that requires authentication using oauth. 

We are defaulting in opening the links in a external browser, but links can be open ina electron windows by using the 'Crl+Click' combination.

### No history
Switching the userAgent with the persistence turn on sometimes have the side effect of "loosing" the channels history. Removing the data under `~/.config/teams-for-linux` should fix the issue.

### Double notifications
Some notifications daemons in linux can end up generating double notifications (like in the cast of Dunst). If this happen you can run the application with `teams --disableDesktopNotifications` that will disable the notifications implemented in this client.

## License

[GPLv3](LICENSE.md)