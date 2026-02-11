# Uninstall Guide

This guide covers how to remove Teams for Linux from your system, including the application itself, package repositories, and user data.

:::tip
The uninstall steps depend on how you originally installed the application. If you're unsure, check your package manager's installed packages list.
:::

## Package Repository Installations

### Debian/Ubuntu (apt)

```bash
# Remove the application
sudo apt remove teams-for-linux

# Remove the repository source
sudo rm /etc/apt/sources.list.d/teams-for-linux-packages.sources

# Remove the signing key
sudo rm /etc/apt/keyrings/teams-for-linux.asc

# Update package lists
sudo apt update
```

### RHEL/Fedora/CentOS (dnf/rpm)

```bash
# Remove the application
sudo dnf remove teams-for-linux

# Remove the repository configuration
sudo rm /etc/yum.repos.d/teams-for-linux.repo
```

## Distribution-Specific Packages

### Arch Linux (AUR)

```bash
# Using yay
yay -R teams-for-linux

# Using paru
paru -R teams-for-linux

# Using pacman directly
sudo pacman -R teams-for-linux
```

### Ubuntu (Pacstall)

```bash
pacstall -R teams-for-linux-deb
```

### Snap

```bash
sudo snap remove teams-for-linux
```

### Flatpak

```bash
flatpak uninstall com.github.IsmaelMartinez.teams_for_linux
```

## Manual Installations

### Debian/Ubuntu (.deb installed via dpkg)

```bash
sudo dpkg -r teams-for-linux
```

### Red Hat/Fedora (.rpm installed via rpm)

```bash
sudo rpm -e teams-for-linux
```

### AppImage

AppImage files are standalone executables with no system-level installation. Delete the AppImage file you downloaded:

```bash
rm teams-for-linux_*.AppImage
```

If you used [AppImageLauncher](https://github.com/TheAssassin/AppImageLauncher), also remove the desktop integration it created.

### Portable Installation (tar.gz)

Delete the extracted directory:

```bash
rm -rf teams-for-linux/
```

## Removing User Data

Uninstalling the application does not remove your user data and configuration. To perform a complete removal, delete the configuration directory for your installation type:

| Installation type | Configuration directory |
|-------------------|----------------------|
| Standard (deb/rpm/AUR) | `~/.config/teams-for-linux` |
| Snap | `~/snap/teams-for-linux/current/.config/teams-for-linux/` |
| Flatpak (user install) | `~/.var/app/com.github.IsmaelMartinez.teams_for_linux/config/teams-for-linux` |
| From source | `~/.config/Electron/` |

:::warning
Removing user data deletes your cached login sessions, configuration, and any local application data. This action cannot be undone.
:::

## Related Documentation

- [Installation Guide](installation.md) — Install Teams for Linux
- [Configuration](configuration.md) — Configuration reference
- [Troubleshooting](troubleshooting.md) — Common issues and solutions
