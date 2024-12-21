# teams-for-linux

This is an unofficial Microsoft Teams client. The official one from Microsoft is retired and got replaced with PWA. Read the blog [here](https://techcommunity.microsoft.com/t5/microsoft-teams-blog/microsoft-teams-progressive-web-app-now-available-on-linux/ba-p/3669846).

Please report bugs and enhancements in the issues section. We will attend them as soon as possible. Please review the open/close issues before raising a new one and avoid duplicates. We encourage everyone to join our chat room in [matrix](https://matrix.to/#/#teams-for-linux_community:gitter.im) and ask your questions. That's probably the quickest way to find solutions. Alternatively open a github discussion.

As this is a wrapper around the web version of teams, we would not be able to add certain features. It's not because we don't want to, but we're fully dependent on Microsoft in certain cases. We may close the issue stating the same reason.

PRs and suggestions are welcomed. We will continue to support the community.

---

[![Gitter chat](https://badges.gitter.im/ismaelmartinez/teams-for-linux.png)](https://gitter.im/teams-for-linux/community "Gitter chat")
![](https://img.shields.io/github/release/IsmaelMartinez/teams-for-linux.svg?style=flat)
![](https://img.shields.io/github/downloads/IsmaelMartinez/teams-for-linux/total.svg?style=flat)
![Build & Release](https://github.com/IsmaelMartinez/teams-for-linux/workflows/Build%20&%20Release/badge.svg)
![](https://img.shields.io/librariesio/github/IsmaelMartinez/teams-for-linux)
[![Known Vulnerabilities](https://snyk.io//test/github/IsmaelMartinez/teams-for-linux/badge.svg?targetFile=package.json)](https://snyk.io//test/github/IsmaelMartinez/teams-for-linux?targetFile=package.json)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=IsmaelMartinez_teams-for-linux&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=IsmaelMartinez_teams-for-linux)

Unofficial Microsoft Teams client for Linux using [`Electron`](https://electronjs.org/).
It uses the Web App and wraps it as a standalone application using Electron.

## Downloads

Binaries available under [releases](https://github.com/IsmaelMartinez/teams-for-linux/releases) for `AppImage`, `rpm`, `deb`, `snap`, and `tar.gz`.

In the case of `AppImage`, we recommend using [`AppImageLauncher`](https://github.com/TheAssassin/AppImageLauncher) for the best desktop experience.

We have a dedicated deb and rpm repo at https://teamsforlinux.de hosted with :heart: by [Nils Büchner](https://github.com/nbuechner). Please follow the installation instructions below.

### Debian/Ubuntu and other derivatives
```bash
sudo mkdir -p /etc/apt/keyrings

sudo wget -qO /etc/apt/keyrings/teams-for-linux.asc https://repo.teamsforlinux.de/teams-for-linux.asc

echo "deb [signed-by=/etc/apt/keyrings/teams-for-linux.asc arch=$(dpkg --print-architecture)] https://repo.teamsforlinux.de/debian/ stable main" | sudo tee /etc/apt/sources.list.d/teams-for-linux-packages.list

sudo apt update

sudo apt install teams-for-linux
```
### RHEL/Fedora and other derivatives
```bash
curl -1sLf -o /tmp/teams-for-linux.asc https://repo.teamsforlinux.de/teams-for-linux.asc; rpm --import /tmp/teams-for-linux.asc; rm -f /tmp/teams-for-linux.asc

curl -1sLf -o /etc/yum.repos.d/teams-for-linux.repo https://repo.teamsforlinux.de/rpm/teams-for-linux.repo

yum update

yum install teams-for-linux
```

Also available in:

[![AUR: teams-for-linux](https://img.shields.io/badge/AUR-teams--for--linux-blue.svg)](https://aur.archlinux.org/packages/teams-for-linux)

[![Pacstall: teams-for-linux-deb](https://img.shields.io/badge/Pacstall-teams--for--linux--deb-00958C)](https://github.com/pacstall/pacstall-programs/tree/master/packages/teams-for-linux-deb)

[![Get it from the Snap Store](https://snapcraft.io/static/images/badges/en/snap-store-black.svg)](https://snapcraft.io/teams-for-linux)

<a href='https://flathub.org/apps/details/com.github.IsmaelMartinez.teams_for_linux'><img width='170' alt='Download on Flathub' src='https://flathub.org/assets/badges/flathub-badge-en.png'/></a>

## Configuration and starting arguments

Please check in the config [`README.md`](app/config/README.md) of the config folder for startup or configuration options, to enable or disable certain features or behaviors.

## Running teams-for-linux in a firejail

A simple shell script that runs teams-for-linux in a firejail is hosted at https://codeberg.org/lars_uffmann/teams-for-linux-jailed. The script can be used both to start t4l, as well as to join meetings with an active t4l instance.

## Contributing

Please refer to the [`CONTRIBUTING.md`](CONTRIBUTING.md) file for more information about how to run this application from source, and/or how to contribute.

## Known issues

Known issues and workarounds can be found in the [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md) file.

## History

Read about the history of this project in the [`HISTORY.md`](HISTORY.md) file.

## License

Some icons are from [Icon Duck](https://iconduck.com/sets/hugeicons-essential-free-icons) under the `CC BY 4.0` license.

License: [`GPLv3`](LICENSE.md)
