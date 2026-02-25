#!/bin/bash
set -e

echo "============================================="
echo "  Cross-Distro Testing Environment"
echo "============================================="
echo "  Distro:         $(cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d '"')"
echo "  Display Server: ${DISPLAY_SERVER}"
echo "  Resolution:     ${SCREEN_RESOLUTION}"
echo "  VNC Port:       ${VNC_PORT}"
echo "  noVNC Port:     ${NOVNC_PORT}"
echo "  App URL:        ${APP_URL:-<none>}"
echo "  Auto-launch:    ${AUTO_LAUNCH:-true}"
echo "============================================="

# Ensure XDG_RUNTIME_DIR exists (required by Wayland compositors)
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp/runtime-tester}"
mkdir -p "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"

# Start D-Bus session bus
if command -v dbus-launch &>/dev/null; then
    eval "$(dbus-launch --sh-syntax)"
    export DBUS_SESSION_BUS_ADDRESS
fi

# Download app from URL if APP_URL is set and no local binary exists
APP_LOCAL_DIR="/home/tester/app-local"
mkdir -p "$APP_LOCAL_DIR"

if [[ -n "${APP_URL:-}" ]] && [[ ! -f /app/teams-for-linux.AppImage ]] && [[ ! -f "${APP_LOCAL_DIR}/teams-for-linux.AppImage" ]]; then
    echo "[*] Downloading app from: ${APP_URL}"
    if curl -fSL --retry 3 --retry-delay 2 -o "${APP_LOCAL_DIR}/teams-for-linux.AppImage" "${APP_URL}"; then
        chmod +x "${APP_LOCAL_DIR}/teams-for-linux.AppImage"
        echo "[*] Download complete: ${APP_LOCAL_DIR}/teams-for-linux.AppImage"
    else
        echo "[!] Download failed. You can still launch the app manually later."
        rm -f "${APP_LOCAL_DIR}/teams-for-linux.AppImage"
    fi
fi

# Electron/Chromium flags required for running inside Docker containers:
#   --no-sandbox            : no user namespace / seccomp sandbox in container
#   --disable-gpu           : no physical GPU available, use software rendering
#   --disable-gpu-compositing : reduce memory from software compositor
#   --disable-dev-shm-usage : avoid /dev/shm size issues
#   --disable-features      : disable memory-heavy background features
#   --js-flags              : V8 heap capped at 4GB by pointer compression
ELECTRON_FLAGS="--no-sandbox --disable-gpu --disable-gpu-compositing --disable-dev-shm-usage"
ELECTRON_FLAGS="${ELECTRON_FLAGS} --disable-features=SpareRendererForSitePerProcess,BackForwardCache"
ELECTRON_FLAGS="${ELECTRON_FLAGS} --renderer-process-limit=1 --js-flags=--max-old-space-size=4096"

# Force software rendering via Mesa (no hardware GPU in container)
export LIBGL_ALWAYS_SOFTWARE=1
export MESA_GL_VERSION_OVERRIDE=3.3

# Set XDG_SESSION_TYPE so the app's Wayland detection (commandLine.js) triggers.
# The built AppImage ships --ozone-platform=x11 via executableArgs. For Wayland
# testing, start-wayland.sh overrides that with --ozone-platform=wayland. For
# XWayland testing, the baked-in x11 value is correct (app runs as X11 client).
if [[ "$DISPLAY_SERVER" == "wayland" ]] || [[ "$DISPLAY_SERVER" == "xwayland" ]]; then
    export XDG_SESSION_TYPE=wayland
else
    export XDG_SESSION_TYPE=x11
fi

# Extract .deb or .rpm if found in /app (works on Apple Silicon where AppImage cannot)
if [[ -f /app/teams-for-linux.deb ]] && [[ ! -d "${APP_LOCAL_DIR}/deb-extracted" ]]; then
    echo "[*] Extracting .deb package..."
    mkdir -p "${APP_LOCAL_DIR}/deb-extracted"
    dpkg-deb -x /app/teams-for-linux.deb "${APP_LOCAL_DIR}/deb-extracted"
    echo "[*] Extracted to ${APP_LOCAL_DIR}/deb-extracted"
elif [[ -f /app/teams-for-linux.rpm ]] && command -v rpm2cpio &>/dev/null && [[ ! -d "${APP_LOCAL_DIR}/rpm-extracted" ]]; then
    echo "[*] Extracting .rpm package..."
    mkdir -p "${APP_LOCAL_DIR}/rpm-extracted"
    cd "${APP_LOCAL_DIR}/rpm-extracted" && rpm2cpio /app/teams-for-linux.rpm | cpio -idm 2>/dev/null
    echo "[*] Extracted to ${APP_LOCAL_DIR}/rpm-extracted"
fi

# Locate the app: extracted deb/rpm -> AppImage -> downloaded -> source checkout
APP_CMD=""
if [[ -x "${APP_LOCAL_DIR}/deb-extracted/opt/teams-for-linux/teams-for-linux" ]]; then
    APP_CMD="${APP_LOCAL_DIR}/deb-extracted/opt/teams-for-linux/teams-for-linux ${ELECTRON_FLAGS}"
elif [[ -x "${APP_LOCAL_DIR}/rpm-extracted/opt/teams-for-linux/teams-for-linux" ]]; then
    APP_CMD="${APP_LOCAL_DIR}/rpm-extracted/opt/teams-for-linux/teams-for-linux ${ELECTRON_FLAGS}"
elif [[ -f /app/teams-for-linux.AppImage ]]; then
    chmod +x /app/teams-for-linux.AppImage 2>/dev/null || true
    APP_CMD="/app/teams-for-linux.AppImage --appimage-extract-and-run ${ELECTRON_FLAGS}"
elif [[ -f "${APP_LOCAL_DIR}/teams-for-linux.AppImage" ]]; then
    APP_CMD="${APP_LOCAL_DIR}/teams-for-linux.AppImage --appimage-extract-and-run ${ELECTRON_FLAGS}"
elif [[ -f /app/teams-for-linux ]]; then
    chmod +x /app/teams-for-linux 2>/dev/null || true
    APP_CMD="/app/teams-for-linux ${ELECTRON_FLAGS}"
elif [[ -d /src ]] && [[ -f /src/package.json ]]; then
    APP_CMD="npm start --prefix /src -- ${ELECTRON_FLAGS}"
fi

export APP_CMD
export AUTO_LAUNCH="${AUTO_LAUNCH:-true}"

case "${DISPLAY_SERVER}" in
    x11)
        echo "[*] Starting X11 environment..."
        exec /usr/local/bin/start-x11.sh
        ;;
    wayland)
        echo "[*] Starting Wayland environment..."
        exec /usr/local/bin/start-wayland.sh
        ;;
    xwayland)
        echo "[*] Starting XWayland environment..."
        exec /usr/local/bin/start-xwayland.sh
        ;;
    *)
        echo "[!] Unknown DISPLAY_SERVER: ${DISPLAY_SERVER}"
        echo "    Valid options: x11, wayland, xwayland"
        exit 1
        ;;
esac
