# Known issues

## Oauth services

Some services requires the app to open the windows in electron. An example is github that requires authentication using oauth.

We are defaulting in opening the links in a external browser, but links can be open ina electron windows by using the 'Crl+Click' combination.

## No history

Switching the userAgent with the persistence turn on sometimes have the side effect of "loosing" the channels history. Removing the data under the appropriate config directory should fix the issue.

### Config folder locations

The following is a list of locations depending on your type installation:

| Type of install | Location | Clean-up command |
|:-------------:|:-------------:|:-----:|
| Vanilla install | `~/.config/teams-for-linux` | `rm -rf ~/.config/teams-for-linux` |
| snap | `~/snap/teams-for-linux/current/.config/teams-for-linux/` |  `rm -rf ~/snap/teams-for-linux/current/.config/teams-for-linux/` |
| --user installed flatpak | `~/.var/app/com.github.IsmaelMartinez.teams_for_linux/config/teams-for-linux` | `rm -rf ~/.var/app/com.github.IsmaelMartinez.teams_for_linux/config/teams-for-linux` |
| From source | `~/.config/Electron/` | `rm -rf ~/.config/Electron/` |

## Spellchecker not working

Details are in issue [#28](https://github.com/IsmaelMartinez/teams-for-linux/issues/28)

In short, node_spellchecker only ships with en_US dictionary.

As a work around, you can enable the use of local dictionaries by installing hunspell and your locale dictionary as indicates in this link [https://github.com/atom/spell-check#debian-ubuntu-and-mint](https://github.com/atom/spell-check#debian-ubuntu-and-mint)

Also check [#154](https://github.com/IsmaelMartinez/teams-for-linux/issues/154) in case you have an issue with the detection of the locale.

## No desktop notifications

Some notifications daemons in linux don't support the implementation that Microsoft implemented in the browser.

This project includes a desktop notification hack that can be enable by running the application with `teams-for-linux --enableDesktopNotificationsHack`.

## Blank page

Some users have reported a blank page on login (with the title `Microsoft Teams - initializing`).

The following workarounds tend to solve the issue:

*    Right click on the Microsoft Teams icon tray and click on Refresh. (Ctrl+R)

If the above doesn't work:

*    Close the application and delete the application cache folder

  *    `.config/teams-for-linux/Partitions/teams-4-linux/Application Cache`

  *    for Snap installation, `snap/teams-for-linux/current/.config/teams-for-linux/Partitions/teams-4-linux/Application Cache`.

  *    for flatpack, `~/.var/app/com.github.IsmaelMartinez.teams_for_linux/config/teams-for-linux/Partitions/teams-4-linux/Application\ Cache/`

  >  Check the config locations to find other installations location

Refer to [#171](https://github.com/IsmaelMartinez/teams-for-linux/issues/171) for more info

If when you reload or close the application you get the blank page again, please repeat the second workaround.
