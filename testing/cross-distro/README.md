# Cross-Distro Testing

Manual testing environment for Teams for Linux across multiple Linux distributions and display servers (X11, Wayland, XWayland).

Each configuration runs in a Docker container with a window manager and VNC access, allowing interactive testing with real Microsoft Teams login.

## Prerequisites

- Docker and Docker Compose v2 (Docker Desktop on macOS works fine)
- An AppImage URL (CI artifact link, GitHub release) **or** a locally built AppImage

Containers are pinned to `linux/amd64` so they run consistently on both Linux hosts and macOS (including Apple Silicon via Rosetta 2).

## Quick start

The easiest way: provide a URL and the container downloads and launches the app for you.

```bash
cd testing/cross-distro

# Pass a URL -- container downloads the AppImage and auto-launches it
./run.sh ubuntu x11 --url https://github.com/IsmaelMartinez/teams-for-linux/releases/download/v1.0.0/teams-for-linux-1.0.0.AppImage

# Or use a local AppImage
./run.sh ubuntu x11 --appimage ../../dist/teams-for-linux-*.AppImage

# Open in browser -- Teams is already running
# http://localhost:6081/vnc.html
```

The app auto-launches by default. When you connect via noVNC, Teams is already on screen waiting for login.

## Available configurations

| Service | Distro | Display | noVNC Port | VNC Port |
|---------|--------|---------|:----------:|:--------:|
| `ubuntu-x11` | Ubuntu 24.04 | X11 | 6081 | 5901 |
| `ubuntu-wayland` | Ubuntu 24.04 | Wayland | 6082 | 5902 |
| `ubuntu-xwayland` | Ubuntu 24.04 | XWayland | 6083 | 5903 |
| `fedora-x11` | Fedora 41 | X11 | 6084 | 5904 |
| `fedora-wayland` | Fedora 41 | Wayland | 6085 | 5905 |
| `fedora-xwayland` | Fedora 41 | XWayland | 6086 | 5906 |
| `debian-x11` | Debian Bookworm | X11 | 6087 | 5907 |
| `debian-wayland` | Debian Bookworm | Wayland | 6088 | 5908 |
| `debian-xwayland` | Debian Bookworm | XWayland | 6089 | 5909 |
| `arch-x11` | Arch Linux | X11 | 6090 | 5910 |
| `arch-wayland` | Arch Linux | Wayland | 6091 | 5911 |
| `arch-xwayland` | Arch Linux | XWayland | 6092 | 5912 |

## Usage

### Helper script

```bash
# Show all configurations and ports
./run.sh --list

# Run with a URL (downloads at container startup, auto-launches)
./run.sh <distro> <display-server> --url <appimage-url>

# Run with a local AppImage file
./run.sh <distro> <display-server> --appimage <path>

# Start desktop only, launch app manually from terminal inside VNC
./run.sh <distro> <display-server> --url <url> --no-launch

# Pre-build all Docker images
./run.sh --build-all

# Stop all running containers
./run.sh --stop-all
```

### Docker Compose directly

```bash
# With URL -- downloads AppImage at startup
APP_URL=https://example.com/teams.AppImage docker compose up --build ubuntu-x11

# Multiple services in parallel (all download the same URL)
APP_URL=https://example.com/teams.AppImage docker compose up --build ubuntu-x11 fedora-wayland arch-xwayland

# Desktop only, no auto-launch
AUTO_LAUNCH=false docker compose up --build ubuntu-x11

# Stop everything
docker compose down
```

### Accessing the environment

**Browser (noVNC):** Navigate to `http://localhost:<noVNC_PORT>/vnc.html`

**VNC client:** Connect to `localhost:<VNC_PORT>` (localhost-only, no password required)

### Auto-launch behavior

By default (`AUTO_LAUNCH=true`), the app starts automatically after the display server is ready. When you connect via noVNC, Teams is already on screen.

To disable auto-launch and start the desktop only:

```bash
./run.sh ubuntu x11 --url <url> --no-launch
```

Then launch manually from the terminal inside VNC:

```bash
# X11 environments
/home/tester/app-local/teams-for-linux.AppImage --appimage-extract-and-run --no-sandbox

# Wayland environments (native Wayland rendering)
/home/tester/app-local/teams-for-linux.AppImage --appimage-extract-and-run --no-sandbox \
    --enable-features=UseOzonePlatform --ozone-platform=wayland

# XWayland environments (X11 rendering through XWayland)
/home/tester/app-local/teams-for-linux.AppImage --appimage-extract-and-run --no-sandbox
```

## Display server details

### X11

- **Display server:** Xvfb (virtual framebuffer)
- **Window manager:** Openbox
- **VNC server:** x11vnc
- **Terminal:** xterm

Standard X11 rendering. This is the traditional Linux display path and what most users currently run.

### Wayland

- **Compositor:** Sway (headless backend, XWayland disabled)
- **VNC server:** wayvnc
- **Terminal:** foot

Native Wayland rendering via Electron's Ozone platform. Tests the `--ozone-platform=wayland` code path. XWayland is explicitly disabled to ensure the app runs as a pure Wayland client.

### XWayland

- **Compositor:** Sway (headless backend, XWayland enabled)
- **VNC server:** wayvnc
- **Terminal:** xterm (via XWayland)

The app runs as an X11 client through the XWayland compatibility layer. This is the default behavior when running Electron on a Wayland desktop without ozone flags -- the most common real-world Wayland scenario today.

## Providing the app binary

### URL download (recommended)

Pass a URL and the container downloads the AppImage at startup. This works with GitHub release URLs, CI artifact links, or any direct download URL.

```bash
# GitHub release
./run.sh ubuntu x11 --url https://github.com/IsmaelMartinez/teams-for-linux/releases/download/v1.0.0/teams-for-linux.AppImage

# Direct compose (useful for running multiple distros against the same build)
APP_URL=https://example.com/teams.AppImage docker compose up --build ubuntu-x11 fedora-x11 arch-x11
```

### Local AppImage

Build locally and pass the file path:

```bash
npm run dist:linux:appimage
./run.sh ubuntu x11 --appimage ../../dist/teams-for-linux-*.AppImage
```

Or copy it manually into the mount directory:

```bash
mkdir -p testing/cross-distro/app
cp dist/teams-for-linux-*.AppImage testing/cross-distro/app/teams-for-linux.AppImage
```

### Native packages (deb/rpm)

To test native package installation, `docker exec` into a running container and install:

```bash
# Start the environment
docker compose up -d ubuntu-x11

# Copy and install deb
docker cp dist/teams-for-linux_*.deb ubuntu-x11:/tmp/
docker exec ubuntu-x11 sudo dpkg -i /tmp/teams-for-linux_*.deb

# Or for Fedora/rpm
docker cp dist/teams-for-linux-*.rpm fedora-x11:/tmp/
docker exec fedora-x11 sudo rpm -i /tmp/teams-for-linux-*.rpm
```

## Troubleshooting

### Sway fails to start

Sway needs the `WLR_BACKENDS=headless` environment variable (set automatically). If it still fails, try running the container with `--privileged` as a last resort. This disables most Docker security isolation, so only use it on a trusted local machine for debugging purposes:

```bash
docker compose run --privileged ubuntu-wayland
```

### AppImage fails to run

AppImages need FUSE or the `--appimage-extract-and-run` flag. The entrypoint script uses the extract-and-run method by default. If it fails, extract manually:

```bash
cd /app
./teams-for-linux.AppImage --appimage-extract
./squashfs-root/teams-for-linux --no-sandbox
```

### Black screen in VNC

Wait a few seconds for the display server to initialize. If the screen stays black:

- **X11:** Check if Xvfb is running: `ps aux | grep Xvfb`
- **Wayland:** Check Sway logs: `journalctl --user -u sway` or `/tmp/sway.log`
- **XWayland:** Verify XWayland process: `ps aux | grep Xwayland`

### noVNC shows "connection refused"

The noVNC web server may need a moment to start. Refresh the page after a few seconds. Check container logs:

```bash
docker compose logs ubuntu-x11
```

## Security notes

All VNC and noVNC ports are bound to `127.0.0.1` (localhost only) so they are not accessible from the network. The VNC servers inside containers also listen on localhost only.

The containers use `seccomp=unconfined` and `SYS_PTRACE` because Sway's wlroots headless backend and Electron's sandbox require these capabilities. These settings weaken Docker's default isolation, so this environment should only be used on trusted local machines for development and testing purposes.

The `--privileged` flag mentioned in troubleshooting is a last resort and should never be used on shared or production machines.

## Architecture notes

- All containers share the host kernel (Docker limitation). Kernel-level differences between distros are not tested.
- Userspace differences (library versions, desktop integration, package dependencies) are tested.
- The `app/` directory in this folder is gitignored. Place your AppImage there for mounting into containers.
- Each distro image includes all three display server stacks. The `DISPLAY_SERVER` environment variable selects which one to activate at runtime.

## Phase 2 roadmap

Future improvements planned for this testing infrastructure:

### Session token sharing (login once, test everywhere)

Log in to Microsoft Teams once and reuse the session across all test containers. This avoids re-authenticating on each of the 12 configurations.

**Approach:** Mount the Electron `userData` directory (which contains cookies, local storage, and session tokens) as a shared volume across containers.

```bash
# Phase 2 concept (not yet implemented):
# 1. Log in on one container
./run.sh ubuntu x11 --url <url>
# 2. Log in via VNC, then export session
docker cp <container>:/home/tester/.config/teams-for-linux ./session-data/
# 3. Start other containers with shared session
./run.sh fedora wayland --url <url> --session ./session-data/
```

**Considerations:**
- Session tokens may be tied to machine IDs or hardware fingerprints
- Electron cookie encryption (via Fuse) may prevent cross-instance sharing
- May need to disable cookie encryption for test builds
- Token expiry and refresh behavior needs testing across containers

### Pre-built test images on container registry

Publish the base distro images to a container registry (GHCR) so users skip the Docker build step entirely.

### CI integration

Run the cross-distro test matrix in GitHub Actions as a smoke test on PRs, verifying the app at least starts on each configuration.
