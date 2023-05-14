# teams-for-linux

This is an unofficial Microsoft Teams client. The official client for Linux from Microsoft is retired by the end of 2022 and is replaced with PWA. Read the blog [here](https://techcommunity.microsoft.com/t5/microsoft-teams-blog/microsoft-teams-progressive-web-app-now-available-on-linux/ba-p/3669846).

Please do report bugs and questions in the issues section. We will try to attend them at the earliest.

PRs and suggestions are welcomed. We will continue to support the community.

---

[![Gitter chat](https://badges.gitter.im/ismaelmartinez/teams-for-linux.png)](https://gitter.im/teams-for-linux/community "Gitter chat")
![](https://img.shields.io/github/release/IsmaelMartinez/teams-for-linux.svg?style=flat)
![](https://img.shields.io/github/downloads/IsmaelMartinez/teams-for-linux/total.svg?style=flat)
![Build & Release](https://github.com/IsmaelMartinez/teams-for-linux/workflows/Build%20&%20Release/badge.svg)
![](https://img.shields.io/librariesio/github/IsmaelMartinez/teams-for-linux)
[![Known Vulnerabilities](https://snyk.io//test/github/IsmaelMartinez/teams-for-linux/badge.svg?targetFile=package.json)](https://snyk.io//test/github/IsmaelMartinez/teams-for-linux?targetFile=package.json)
[![Codacy Badge](https://api.codacy.com/project/badge/Grade/8954c6c7e85c4ab9b92aef9f54f22eab)](https://www.codacy.com/manual/IsmaelMartinez/teams-for-linux?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=IsmaelMartinez/teams-for-linux&amp;utm_campaign=Badge_Grade)

Unofficial Microsoft Teams client for Linux using [`Electron`](https://electronjs.org/).
It uses the Web App and wraps it as a standalone application using Electron.

## Downloads

Binaries available under [releases](https://github.com/IsmaelMartinez/teams-for-linux/releases) for `AppImage`, `rpm`, `deb`, `snap`, and `tar.gz`.

In case of `AppImage`, we recommend to use [`AppImageLauncher`](https://github.com/TheAssassin/AppImageLauncher) for the best desktop experience.

### Debian/Ubuntu and other derivatives
```bash
curl -1sLf 'https://dl.cloudsmith.io/public/teams-for-linux/packages/setup.deb.sh' | sudo -E bash
sudo apt update
sudo apt install teams-for-linux
```
### RHEL/Fedora and other derivatives
```bash
curl -1sLf 'https://dl.cloudsmith.io/public/teams-for-linux/packages/setup.rpm.sh' | sudo -E bash
sudo yum update
sudo yum install teams-for-linux
```

Also available in:

[![AUR: teams-for-linux](https://img.shields.io/badge/AUR-teams--for--linux-blue.svg)](https://aur.archlinux.org/packages/teams-for-linux)

[![Pacstall: teams-for-linux-deb](https://img.shields.io/badge/Pacstall-teams--for--linux--deb-00958C)](https://github.com/pacstall/pacstall-programs/tree/master/packages/teams-for-linux-deb)

[![Get it from the Snap Store](https://snapcraft.io/static/images/badges/en/snap-store-black.svg)](https://snapcraft.io/teams-for-linux)

<a href='https://flathub.org/apps/details/com.github.IsmaelMartinez.teams_for_linux'><img width='170' alt='Download on Flathub' src='https://flathub.org/assets/badges/flathub-badge-en.png'/></a>

## Starting arguments

Check in the config [`README.md`](app/config/README.md) in the config folder.

## Contributing

Please refer to the [`CONTRIBUTING.md`](CONTRIBUTING.md) file for more information about how to run this application from source, and/or how to contribute.

## Known issues

Known issues and workarounds can be found in the [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md) file.

## History

Read about the history about this project in the [`HISTORY.md`](HISTORY.md) file.

## License

License: [`GPLv3`](LICENSE.md)
