# Known Issues

## Oauth Services

Some OAuth services (for example, GitHub) require that authentication windows
open inside Electron. By default, Teams for Linux opens links in an external
browser. If you need to open a link within an Electron window, use the
`Ctrl+Click` combination.

## No History

When updating the Electron version, the channel history may sometimes disappear.
This issue is typically related to a change in the user agent. Removing the
stored data in the configuration directory usually resolves the problem.

### Configuration Folder Locations

Below is a list of default configuration folder locations for different
installation types, along with the commands to remove the data:

|     Type of install      |                                   Location                                    |                                   Clean-up command                                   |
| :----------------------: | :---------------------------------------------------------------------------: | :----------------------------------------------------------------------------------: |
|     Vanilla install      |                          `~/.config/teams-for-linux`                          |                          `rm -rf ~/.config/teams-for-linux`                          |
|           snap           |           `~/snap/teams-for-linux/current/.config/teams-for-linux/`           |           `rm -rf ~/snap/teams-for-linux/current/.config/teams-for-linux/`           |
| --user installed flatpak | `~/.var/app/com.github.IsmaelMartinez.teams_for_linux/config/teams-for-linux` | `rm -rf ~/.var/app/com.github.IsmaelMartinez.teams_for_linux/config/teams-for-linux` |
|       From source        |                             `~/.config/Electron/`                             |                             `rm -rf ~/.config/Electron/`                             |

## Spellchecker Not Working

Refer to Issue
[#28](https://github.com/IsmaelMartinez/teams-for-linux/issues/28) for details.
In short, the bundled node_spellchecker only includes the en_US dictionary.

Workaround: Enable the use of local dictionaries by installing Hunspell along
with your locale’s dictionary. See the instructions at
[Atom's spell-check README](https://github.com/atom/spell-check#debian-ubuntu-and-mint).
Check Issue [#154](https://github.com/IsmaelMartinez/teams-for-linux/issues/154)
if you experience locale detection problems.

## No Desktop Notifications

Some Linux notification daemons do not fully support the implementation used by
Microsoft in their web version. This may result in certain notifications not
being shown.

Please refer to the `notificationMethod`, and other notification settings, in
the [Configuration README](app/config/README.md) for more information.

## Blank Page

Some users report a blank page at login (titled "Microsoft Teams -
initializing"). Try the following workarounds:

1. Refresh the Window:

   - Right-click the Microsoft Teams tray icon and select Refresh (or use
     Ctrl+R).

1. Clear Application Cache:

   - Close the application and delete the cache folder:

     - For a Vanilla install:
       ~/.config/teams-for-linux/Partitions/teams-4-linux/Application Cache

     - For Snap:
       ~/snap/teams-for-linux/current/.config/teams-for-linux/Partitions/teams-4-linux/Application
       Cache

     - For Flatpak:
       ~/.var/app/com.github.IsmaelMartinez.teams_for_linux/config/teams-for-linux/Partitions/teams-4-linux/Application
       Cache/

If the blank page returns after reloading or closing the app, repeat the cache
deletion step. See Issue
[#171](https://github.com/IsmaelMartinez/teams-for-linux/issues/171) for more
details.

> Check the config locations to find other installations location

## No Apple Silicon Mac build

Apple Silicon Macs cannot run unsigned code, and signing requires an Apple
Developer account ($99/year). For this reason, only Intel Mac builds are
provided in GitHub releases. (See Issue
[#1225](https://github.com/IsmaelMartinez/teams-for-linux/issues/1225) for
details.)

- Intel Build: Works on Apple Silicon via emulation (albeit slowly).
- Building Your Own: You can build an Apple Silicon version from source, signing
  it with your own developer keys. This process is free, but the keys will only
  work on your Mac.

Steps:

1. Download and open Xcode from the App Store.
1. In Xcode, go to Xcode → Settings → Accounts and add your account.
1. Under your account, click Manage Certificates and add an Apple Development
    certificate.
1. Create a dummy project in Xcode (any project will work) to ensure the
    certificate is added to your Keychain as trusted.
1. In the repository, run:

```bash
npm ci
npm run dist:mac:arm64
```

You should see a signing step in the output (ignore the "skipped macOS
notarization" warning).

The app will be built in the `dist/mac-arm64/` folder. Copy it to your
Applications folder.
