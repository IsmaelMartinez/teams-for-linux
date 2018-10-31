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
| partition | [BrowserWindow](https://electronjs.org/docs/api/browser-window) webpreferences partition  | nopersist |
| webDebug  | start with the browser developer tools open  |  false |
| url  | url to open |  https://teams.microsoft.com/ |
| config | config file location | ~/.config/teams.json |
| userAgent  | select the user agent to use | chrome  |
| edgeUserAgent  |  user agent string for edge | Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/17.17134  |
| chromeUserAgent  |  user agent string for chrome |  Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36 |
| ntlmV2enabled | enable-ntlm-v2 value | true |
| authServerWhitelist | auth-server-whitelist value | * |


As an example:
```bash
yarn start --partition persist:teams-linux
```

## Known issues

### Video calls
Currently Microsoft only supports video calls when using a browser with the edge userAgent.

Use `teams --userAgent edge` to be able to use video calls.

### Mentions not working with userAgent edge
@mentions dissapear after a few seconds of typing it when using the userAgent as edge.

There is currently no work around it. This is the reason why the detault userAgent is, at this moment in time, chrome.

### No history
Switching the userAgent with the persistence turn on sometimes have the side effect of "loosing" the channels history. Removing the data under `~/.config/teams-for-linux` should fix the issue.

## License

[GPLv3](LICENSE.md)