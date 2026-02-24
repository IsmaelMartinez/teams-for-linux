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

# Locate the app (AppImage mounted at /app or source at /src)
APP_CMD=""
if [ -f /app/teams-for-linux.AppImage ]; then
    chmod +x /app/teams-for-linux.AppImage
    APP_CMD="/app/teams-for-linux.AppImage --appimage-extract-and-run --no-sandbox"
elif [ -f /app/teams-for-linux ]; then
    chmod +x /app/teams-for-linux
    APP_CMD="/app/teams-for-linux --no-sandbox"
elif [ -d /src ] && [ -f /src/package.json ]; then
    APP_CMD="npm start --prefix /src -- --no-sandbox"
fi

export APP_CMD

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
