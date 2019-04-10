# teams-for-linux

![](https://img.shields.io/github/release/IsmaelMartinez/teams-for-linux.svg?style=flat)
![](https://img.shields.io/github/downloads/IsmaelMartinez/teams-for-linux/total.svg?style=flat)

[![Build Status](https://travis-ci.org/IsmaelMartinez/teams-for-linux.svg?branch=master)](https://travis-ci.org/IsmaelMartinez/teams-for-linux) 
[![dependencies Status](https://david-dm.org/IsmaelMartinez/teams-for-linux/status.svg)](https://david-dm.org/IsmaelMartinez/teams-for-linux) 
[![devDependencies Status](https://david-dm.org/IsmaelMartinez/teams-for-linux/dev-status.svg)](https://david-dm.org/IsmaelMartinez/teams-for-linux?type=dev)

Unofficial Microsoft Teams client for Linux using [Electron](https://electronjs.org/).
It uses the Web App and wraps it as a standalone application using Electron.

## Available starting arguments

Check in the config [README.md](app/config/README.md) in the config folder.

## Contributing

Please refer to the [CONTRIBUTE.md](CONTRIBUTE.md) file for more information about how to run this application from source, and/or how to contribute.

## History

Read about the history about this project in the [HISTORY.md](HISTORY.md) file.

## Known issues

### Oauth services

Some services requires the app to open the windows in electron. An example is github that requires authentication using oauth.

We are defaulting in opening the links in a external browser, but links can be open ina electron windows by using the 'Crl+Click' combination.

### No history

Switching the userAgent with the persistence turn on sometimes have the side effect of "loosing" the channels history. Removing the data under `~/.config/teams-for-linux` or, if using snap `rm -rf /home/$HOME/snap/teams*`, should fix the issue.

### Spellchecker not working

Details are in issue [#28](https://github.com/IsmaelMartinez/teams-for-linux/issues/28)

In short, node_spellchecker only ships with en_US dictionary.

As a work around, only valid when running from source, you can enable the use of local dictionaries by following the next steps:

1. Install hunspell and your locale dictionary as indicates in this link [https://github.com/atom/spell-check#debian-ubuntu-and-mint](https://github.com/atom/spell-check#debian-ubuntu-and-mint)
2. Run the following commands from the root of the app (where this README.md file is located)
  1.`mv node_modules/spellchecker/vendor/hunspell_dictionaries node_modules/spellchecker/vendor/hunspell_dictionaries.old` mv the en_US dictionaries to another location.
  2.`ln -s /usr/share/hunspell/ node_modules/spellchecker/vendor/hunspell_dictionaries` create a simbolic link to the hunspell dictionaries. Note, I am using the default location for hunspell.

Starting the app with `yarn start`, and if you have your system configured with the right dictionaries and locale, you should be able to see the spellchecker working.

Unfortunately, at this moment in time it is not possible to use local dictionaries with the packaged app. Fixing issue [51](https://github.com/atom/node-spellchecker/issues/51) in node-spellchecker should solve this issue.

### No desktop notifications

Some notifications daemons in linux don't support the implementation that Microsoft implemented in the browser.

This project includes a desktop notification hack that can be enable by running the application with `teams-for-linux --enableDesktopNotificationsHack`.

## License

[GPLv3](LICENSE.md)