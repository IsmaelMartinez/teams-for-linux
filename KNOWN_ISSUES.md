# Known issues

## Oauth services

Some services requires the app to open the windows in electron. An example is github that requires authentication using oauth.

We are defaulting in opening the links in a external browser, but links can be open ina electron windows by using the 'Crl+Click' combination.

## No history

Switching the userAgent with the persistence turn on sometimes have the side effect of "loosing" the channels history. Removing the data under `~/.config/teams-for-linux` or, if using snap `rm -rf /home/$HOME/snap/teams*`, should fix the issue.

## Spellchecker not working

Details are in issue [#28](https://github.com/IsmaelMartinez/teams-for-linux/issues/28)

In short, node_spellchecker only ships with en_US dictionary.

As a work around, only valid when running from source, you can enable the use of local dictionaries by following the next steps:

1. Install hunspell and your locale dictionary as indicates in this link [https://github.com/atom/spell-check#debian-ubuntu-and-mint](https://github.com/atom/spell-check#debian-ubuntu-and-mint)
2. Run the following commands from the root of the app (where this README.md file is located)
  1.`mv node_modules/spellchecker/vendor/hunspell_dictionaries node_modules/spellchecker/vendor/hunspell_dictionaries.old` mv the en_US dictionaries to another location.
  2.`ln -s /usr/share/hunspell/ node_modules/spellchecker/vendor/hunspell_dictionaries` create a simbolic link to the hunspell dictionaries. Note, I am using the default location for hunspell.

Starting the app with `yarn start`, and if you have your system configured with the right dictionaries and locale, you should be able to see the spellchecker working.

Unfortunately, at this moment in time it is not possible to use local dictionaries with the packaged app. Fixing issue [51](https://github.com/atom/node-spellchecker/issues/51) in node-spellchecker should solve this issue.

## Strange link icon on snap app

Some snap installation show a non standard icon for links. If you suffer this, please use the deb package instead.

Please refer to the issue #99 for more info.

## No desktop notifications

Some notifications daemons in linux don't support the implementation that Microsoft implemented in the browser.

This project includes a desktop notification hack that can be enable by running the application with `teams-for-linux --enableDesktopNotificationsHack`.