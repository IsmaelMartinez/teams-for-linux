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

## Blank page

Some users have reported a blank page on login (with the title `Microsoft Teams - initializing`).

The following workarounds tend to solve the issue:

*    Right click on the Microsoft Teams icon tray and click on Refresh. (Ctrl+R)

If the above doesn't work:

*    Close the application and delete the application cache folder

  *    `.config/teams-for-linux/Partitions/teams-4-linux/Application Cache`

  *    for Snap installation, `snap/teams-for-linux/current/.config/teams-for-linux/Partitions/teams-4-linux/Application Cache`.

  *    for flatpak, `~/.var/app/com.github.IsmaelMartinez.teams_for_linux/config/teams-for-linux/Partitions/teams-4-linux/Application\ Cache/`

  >  Check the config locations to find other installations location

Refer to [#171](https://github.com/IsmaelMartinez/teams-for-linux/issues/171) for more info

If when you reload or close the application you get the blank page again, please repeat the second workaround.

## No Apple Silicon Mac build
It appears that Apple Silicon can't run unsigned code, and the Apple Developer account that is required for signing
costs $99/year. Thus, only Intel Mac release is pre-built in Github releases. This issue is tracked in
[#1225](https://github.com/IsmaelMartinez/teams-for-linux/issues/1225).

The Intel build works on Apple Silicon Macs, but runs slow because it is emulated.

You can **build your own Apple Silicon build from this repo yourself**, signed with your own local developer account keys. This is free, but the keys work only on our Mac.

The steps below expect that you have NodeJS and npm installed (both are in Homebrew).

1. Download XCode (from AppStore)
2. Open it
3. Menu bar XCode -> Settings -> Accounts
4. Select your account -> Manage certificates
5. Click plus on lower left -> Apple development
6. Close the settings menu and create a new project in XCode. Does not matter which one, just create something using
   the wizard, doesn't matter what. This is required to get the certificate into your local Keychain as trusted.
7. Run `npm ci`, `npm run dist:mac:arm64` in this repository. You should see `signing` step in the output with no errors, except for `skipped macOS notarization` warning.
8. The app is built in the `dist/mac-arm64/` folder, from where you can copy it to Applications.
