# teams-for-linux

![](https://img.shields.io/github/release/IsmaelMartinez/teams-for-linux.svg?style=flat)
![](https://img.shields.io/github/downloads/IsmaelMartinez/teams-for-linux/total.svg?style=flat)


[![Build Status](https://travis-ci.org/IsmaelMartinez/teams-for-linux.svg?branch=master)](https://travis-ci.org/IsmaelMartinez/teams-for-linux) 
[![dependencies Status](https://david-dm.org/IsmaelMartinez/teams-for-linux/status.svg)](https://david-dm.org/IsmaelMartinez/teams-for-linux) 
[![devDependencies Status](https://david-dm.org/IsmaelMartinez/teams-for-linux/dev-status.svg)](https://david-dm.org/IsmaelMartinez/teams-for-linux?type=dev)

Unofficial Microsoft Teams client for Linux using [Electron](https://electronjs.org/).
It uses the Web App and wraps it as a standalone application using Electron.

## Install

You can download the tarball, rpm or deb from the [releases page](https://github.com/IsmaelMartinez/teams-for-linux/releases).

## Run from source

```bash
yarn start
```

## Build for linux

```bash
yarn run dist:linux
```

This will build an deb, rpm, snap, AppImage and tar.gz files in the dist folder. This files can be run in most popular linux distributions.

Is possible to specify the snap or AppImage build type using running this:

```bash
# Standalone build
yarn run dist:linux:snap

# Or, if you have docker installed, you can alternatively build there
./dockerBuildSnap.sh
```

This will build the snap into the `dist/` directory.

### Install using locally built snap file

To install the snap file using the generated file use this command.

```bash
cd dist
sudo snap install teams-for-linux_VERSION_amd64.snap --dangerous
```

### Install using snap from store


```bash
sudo snap install teams-for-linux
```

#### Use camera using the Snap build

Snap uses confinement to provide more security, this restric the access to hardware or data on your device to prevent security issues.

The camera is a restricted device on Snap, so you need to allow the access to the camera on Teams For Linux to be able to do videocalls, to do that run this command after the installation of the snap to create an interface to the camera:

```bash
sudo snap connect teams-for-linux:camera core:camera
```

## Available starting arguments

Check in the config [README.md](app/config/README.md) in the config folder.

## Development

This is a fairly small project. IMO, the ideal size for getting started with electron.

Just fork the repo and dive in. The app/index.js is the starting of all the application.

Once changes are made, just do a pull request to the branch with the following version number.

Each subfolder has a README.md file that explains the reason of existence and any extra required information.

### Version number

Just increase the lower (last) number in the package.json version string number.

We are not following SemVer at the moment.

This is because of this fork history. Jamie expressed his desire to refactor the project (0.2.0 branch) in Typescript and to support it.

## History

This branch is a child fork of [JamieMagee teams-for-linux](https://github.com/JamieMagee/teams-for-linux) repo, that is itself a fork of [Ivelkov teams-for-linux](https://github.com/ivelkov/teams-for-linux).

Jamie has express his desire to refactor this project in Typescript and to support it, but he has archive the project and I suspect that means he doesn't have the time to support it. I have tried to contact Ivelkov for a few months but haven't receive any answers.

For that reason, decided to refork it and fix a few things that where not working. The list has grown since then to support many features and to fix most of the bugs.

Ideally this project will die when Microsoft implements a desktop client for linux. Please do vote for it in the [Microsoft Suggestions Forum](https://microsoftteams.uservoice.com/forums/555103-public/suggestions/16911565-linux-client)

Currently, the project is in a stable condition, and should continue as long as needed. Non stable versions are released as pre-release.

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
