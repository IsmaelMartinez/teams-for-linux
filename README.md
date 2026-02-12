# Teams for Linux

[![Matrix Space](https://img.shields.io/matrix/teams-for-linux-space%3Amatrix.org?server_fqdn=matrix.org&label=Matrix%20Space)](https://matrix.to/#/#teams-for-linux-space:matrix.org "Matrix Space")
![](https://img.shields.io/github/release/IsmaelMartinez/teams-for-linux.svg?style=flat)
![](https://img.shields.io/github/downloads/IsmaelMartinez/teams-for-linux/total.svg?style=flat)
![Build & Release](https://github.com/IsmaelMartinez/teams-for-linux/workflows/Build%20&%20Release/badge.svg)
![](https://img.shields.io/librariesio/github/IsmaelMartinez/teams-for-linux)
[![Known Vulnerabilities](https://snyk.io//test/github/IsmaelMartinez/teams-for-linux/badge.svg?targetFile=package.json)](https://snyk.io//test/github/IsmaelMartinez/teams-for-linux?targetFile=package.json)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=IsmaelMartinez_teams-for-linux&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=IsmaelMartinez_teams-for-linux)

**Unofficial Microsoft Teams client for Linux** — a native desktop app that wraps the Teams web version with enhanced Linux integration.

✅ **System notifications**  
✅ **System tray integration** (badge support varies by desktop environment)  
✅ **Custom backgrounds & themes**  
✅ **Screen sharing support**  
✅ **Multiple account profiles**  

> [!NOTE]
> This is an independent project, not affiliated with Microsoft. Some features are limited by the Teams web app.

## Sponsor

### Recall.ai — API for Meeting Recording and Transcription
> If you're looking for a meeting recording API, consider checking out [Recall.ai](https://www.recall.ai/product/microsoft-teams-recording-api?utm_source=github&utm_medium=sponsorship&utm_campaign=ismaelmartinez-teams-for-linux), an API that records and transcribes Zoom, Google Meet, Microsoft Teams, in-person meetings, and more.

_This sponsorship helps support the ongoing development of teams-for-linux._

## Installation

### Package Repositories

We have a dedicated deb and rpm repo at https://teamsforlinux.de hosted with :heart: by [Nils Büchner](https://github.com/nbuechner). Please follow the installation instructions below.

**Debian/Ubuntu:**
```bash
sudo mkdir -p /etc/apt/keyrings
sudo wget -qO /etc/apt/keyrings/teams-for-linux.asc https://repo.teamsforlinux.de/teams-for-linux.asc
sh -c 'echo "Types: deb\nURIs: https://repo.teamsforlinux.de/debian/\nSuites: stable\nComponents: main\nSigned-By: /etc/apt/keyrings/teams-for-linux.asc\nArchitectures: amd64" | sudo tee /etc/apt/sources.list.d/teams-for-linux-packages.sources'
sudo apt update && sudo apt install teams-for-linux
```

**RHEL/Fedora:**
```bash
curl -1sLf -o /tmp/teams-for-linux.asc https://repo.teamsforlinux.de/teams-for-linux.asc; sudo rpm --import /tmp/teams-for-linux.asc
sudo curl -1sLf -o /etc/yum.repos.d/teams-for-linux.repo https://repo.teamsforlinux.de/rpm/teams-for-linux.repo
sudo dnf -y install teams-for-linux
```

### Distribution Packages

[![AUR: teams-for-linux](https://img.shields.io/badge/AUR-teams--for--linux-blue.svg)](https://aur.archlinux.org/packages/teams-for-linux)
[![Pacstall: teams-for-linux-deb](https://img.shields.io/badge/Pacstall-teams--for--linux--deb-00958C)](https://github.com/pacstall/pacstall-programs/tree/master/packages/teams-for-linux-deb)  
[![Get it from the Snap Store](https://snapcraft.io/static/images/badges/en/snap-store-black.svg)](https://snapcraft.io/teams-for-linux)
<a href='https://flathub.org/apps/details/com.github.IsmaelMartinez.teams_for_linux'><img width='170' alt='Download on Flathub' src='https://flathub.org/assets/badges/flathub-badge-en.png'/></a>

### Manual Download

Download from [GitHub Releases](https://github.com/IsmaelMartinez/teams-for-linux/releases) — available as AppImage, deb, rpm, snap, tar.gz (plus Windows/macOS builds).

> [!TIP]
> For AppImage files, use [`AppImageLauncher`](https://github.com/TheAssassin/AppImageLauncher) for better desktop integration.

## Quick Start

1. **Install** using your preferred method above
2. **Launch** with `teams-for-linux` 
3. **Configure** by creating `~/.config/teams-for-linux/config.json` if needed

## Documentation

📖 **[Complete Documentation](https://ismaelmartinez.github.io/teams-for-linux/)** — Enhanced documentation with search, mobile optimization, and comprehensive guides

| Topic | Description |
|-------|-------------|
| **[Installation Guide](https://ismaelmartinez.github.io/teams-for-linux/installation)** | Package repositories and installation methods |
| **[Configuration Guide](https://ismaelmartinez.github.io/teams-for-linux/configuration)** | Complete setup and configuration options |
| **[Troubleshooting](https://ismaelmartinez.github.io/teams-for-linux/troubleshooting)** | Common issues and solutions |
| **[Multiple Profiles](https://ismaelmartinez.github.io/teams-for-linux/multiple-instances)** | Running work & personal accounts |
| **[Custom Backgrounds](https://ismaelmartinez.github.io/teams-for-linux/custom-backgrounds)** | Video call backgrounds setup |
| **[Contributing](https://ismaelmartinez.github.io/teams-for-linux/contributing)** | Development setup and contribution guidelines |

## Support & Community

- 💬 **Chat**: Join our [Matrix Space](https://matrix.to/#/#teams-for-linux-space:matrix.org)
- 🐛 **Issues**: [Report bugs](https://github.com/IsmaelMartinez/teams-for-linux/issues)
- 🤝 **Contributing**: See [`CONTRIBUTING.md`](CONTRIBUTING.md)

## Security & Sandboxing

Electron's contextIsolation and sandbox features are disabled to enable Teams DOM access functionality. For enhanced security, use system-level sandboxing:

**Available options**:
- **Flatpak**: Built-in isolation via Flathub
- **Snap packages**: Application confinement with auto-updates
- **Firejail**: Use this [script](https://codeberg.org/lars_uffmann/teams-for-linux-jailed) for manual sandboxing
- **AppArmor/SELinux**: Most Linux distributions include these by default

System-level sandboxing provides better isolation than Electron's built-in features while preserving full functionality.

## Advanced Usage

## History

Read about the history of this project in the [`HISTORY.md`](HISTORY.md) file.

## License

**GPL-3.0** — See [`LICENSE.md`](LICENSE.md)

Icons from [Icon Duck](https://iconduck.com/sets/hugeicons-essential-free-icons) (CC BY 4.0)
