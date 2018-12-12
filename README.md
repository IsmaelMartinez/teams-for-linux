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
Check in the config [README.md](app/config/README.md) in the config folder.

## Development
This is a fairly small project. IMO, the ideal size for getting started with electron.

Just fork the repo and dive in. The app/index.js is the starting of all the application. 

Once changes are made, just do a pull request to master.

Each subfolder has a README.md file that explains the reason of existence and any extra required information.

### Version number
Just increase the lower (last) number in the package.json version string number. 

We are not following SemVer at the moment. 

This is because of this fork history. Jamie expressed his desire to refactor the project (0.2.0 branch) in Typescript and to support it.

## History
This branch is a child fork of [JamieMagee teams-for-linux](https://github.com/JamieMagee/teams-for-linux) repo, that is itself a fork of (Ivelkov teams-for-linux)[https://github.com/ivelkov/teams-for-linux]. 

Jamie has express his desire to refactor this project in Typescript and to support it, but he doesn't have the time to support it at the moment. I have tried to contact Ivelkov for a few months but haven't receive any answers. 

For that reason, decided to refork it and fix a few things that where not working. Mainly the notification and the gif animations, but the list is fairly big.

Ideally this project will die when Microsoft implements a desktop client for linux. Please do vote for it in the [Microsoft Suggestions Forum](https://microsoftteams.uservoice.com/forums/555103-public/suggestions/16911565-linux-client)

## Known issues

### Oauth services
Some services requires the app to open the windows in electron. An example is github that requires authentication using oauth. 

We are defaulting in opening the links in a external browser, but links can be open ina electron windows by using the 'Crl+Click' combination.

### No history
Switching the userAgent with the persistence turn on sometimes have the side effect of "loosing" the channels history. Removing the data under `~/.config/teams-for-linux` should fix the issue.

### No desktop notifications
Some notifications daemons in linux don't support the implementation that Microsoft implemented in the browser. 

This project includes a desktop notification hack that can be enable by running the application with `teams --enableDesktopNotificationsHack`. 

Read more about this and another config arguments in the [config README.md](config/README.md) file.

## License

[GPLv3](LICENSE.md)