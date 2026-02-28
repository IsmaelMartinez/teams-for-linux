# Cross-Distro Testing

Docker-based manual testing for Teams for Linux across distributions and display servers.

## Prerequisites

- Docker and Docker Compose v2
- An AppImage (local file or download URL)

Containers are `linux/amd64`, working on both Linux and macOS (Apple Silicon via Rosetta 2).

## Quick start

```bash
cd testing/cross-distro

# From URL (downloads and auto-launches)
./run.sh ubuntu x11 --url https://github.com/IsmaelMartinez/teams-for-linux/releases/download/v1.0.0/teams-for-linux-1.0.0.AppImage

# From local AppImage
./run.sh ubuntu x11 --appimage ../../dist/teams-for-linux-*.AppImage

# Open in browser
# http://localhost:6081/vnc.html
```

## Configurations

| Service | Distro | Display | noVNC | VNC |
|---------|--------|---------|:-----:|:---:|
| `ubuntu-x11` | Ubuntu 24.04 | X11 | 6081 | 5901 |
| `ubuntu-wayland` | Ubuntu 24.04 | Wayland | 6082 | 5902 |
| `ubuntu-xwayland` | Ubuntu 24.04 | XWayland | 6083 | 5903 |
| `fedora-x11` | Fedora 41 | X11 | 6084 | 5904 |
| `fedora-wayland` | Fedora 41 | Wayland | 6085 | 5905 |
| `fedora-xwayland` | Fedora 41 | XWayland | 6086 | 5906 |
| `debian-x11` | Debian Bookworm | X11 | 6087 | 5907 |
| `debian-wayland` | Debian Bookworm | Wayland | 6088 | 5908 |
| `debian-xwayland` | Debian Bookworm | XWayland | 6089 | 5909 |

## Usage

```bash
./run.sh <distro> <display-server> [options]

# Options
--appimage <path>   Local AppImage file
--url <url>         Download URL
--no-launch         Start desktop only (launch app manually)

# Utility
./run.sh --list         Show all configurations
./run.sh --build-all    Pre-build all images
./run.sh --stop-all     Stop all containers
```

Docker Compose directly:

```bash
APP_URL=https://example.com/teams.AppImage docker compose up --build ubuntu-x11 fedora-wayland
AUTO_LAUNCH=false docker compose up --build ubuntu-x11
```

### Manual app launch

With `--no-launch`, start the app from the terminal inside VNC:

```bash
# X11 / XWayland
/home/tester/app-local/teams-for-linux.AppImage --appimage-extract-and-run \
    --no-sandbox --disable-gpu --disable-dev-shm-usage

# Wayland (native)
/home/tester/app-local/teams-for-linux.AppImage --appimage-extract-and-run \
    --no-sandbox --disable-gpu --disable-dev-shm-usage \
    --enable-features=UseOzonePlatform --ozone-platform=wayland
```

### Apple Silicon (ARM64 Macs)

AppImage binaries cannot execute under Docker's Rosetta 2 emulation. Use a `.deb` or `.rpm` package instead -- the entrypoint will extract it automatically with `dpkg-deb` or `rpm2cpio` and run the installed binary directly.

```bash
# Download the amd64 .deb
curl -fSL -o app/teams-for-linux.deb \
  https://github.com/IsmaelMartinez/teams-for-linux/releases/download/v2.7.7/teams-for-linux_2.7.7_amd64.deb

# Run normally -- the entrypoint detects and extracts the .deb
./run.sh ubuntu x11
```

For Fedora, use the `.rpm` equivalent:

```bash
curl -fSL -o app/teams-for-linux.rpm \
  https://github.com/IsmaelMartinez/teams-for-linux/releases/download/v2.7.7/teams-for-linux-2.7.7.x86_64.rpm

./run.sh fedora x11
```

The entrypoint checks for files in this order: extracted `.deb`/`.rpm` > `.AppImage` > downloaded AppImage > source checkout.

## Electron in Docker

The entrypoint handles these automatically:

| Concern | Solution |
|---------|----------|
| No GPU | `--disable-gpu`, `LIBGL_ALWAYS_SOFTWARE=1` (Mesa llvmpipe) |
| Shared memory | `--disable-dev-shm-usage`, `shm_size: 2gb` |
| No namespaces | `--no-sandbox` |
| Wayland detection | `XDG_SESSION_TYPE` set per display server |
| Ozone override | AppImage ships `--ozone-platform=x11`; Wayland script overrides to `=wayland` |

**X11** -- high confidence, mirrors CI exactly (`xvfb-run` + Electron).
**XWayland** -- high confidence, app sees X11 through Sway's XWayland bridge.
**Wayland** -- medium confidence, Sway headless + Electron Ozone is less battle-tested in Docker.

## Display servers

- **X11:** Xvfb + Openbox + x11vnc + xterm
- **Wayland:** Sway (headless, XWayland disabled) + wayvnc + foot
- **XWayland:** Sway (headless, XWayland enabled) + wayvnc + xterm

## Troubleshooting

**Sway won't start:** Try `docker compose run --privileged ubuntu-wayland` (last resort, weakens isolation).

**AppImage fails:** Extract manually: `./teams-for-linux.AppImage --appimage-extract && ./squashfs-root/teams-for-linux --no-sandbox`

**Black screen:** Wait a few seconds. Check `ps aux | grep Xvfb` (X11) or `/tmp/sway.log` (Wayland).

**noVNC "connection refused":** Refresh after a few seconds. Check `docker compose logs <service>`.

## Security

- All ports bound to `127.0.0.1` only
- `seccomp=unconfined` + `SYS_PTRACE` required for Sway/Electron -- use on trusted machines only

## Notes

- Containers share the host kernel; only userspace differences (libs, packages) are tested
- The `app/` directory is gitignored -- place AppImages there for mounting
- Each image includes all three display server stacks; `DISPLAY_SERVER` env var selects at runtime
