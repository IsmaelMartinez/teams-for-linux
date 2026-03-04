#!/bin/bash
# Start Wayland environment: Sway (headless) + wayvnc + noVNC
# The app runs with native Wayland (--ozone-platform=wayland)
set -e

WIDTH=$(echo "$SCREEN_RESOLUTION" | cut -dx -f1)
HEIGHT=$(echo "$SCREEN_RESOLUTION" | cut -dx -f2)

echo "[Wayland] Starting Sway compositor (headless backend)..."
export WLR_BACKENDS=headless
export WLR_LIBINPUT_NO_DEVICES=1
export WLR_RENDERER=pixman
export WAYLAND_DISPLAY=wayland-1
export XDG_SESSION_TYPE=wayland
export XDG_CURRENT_DESKTOP=sway

# Disable XWayland for pure Wayland testing
export SWAY_EXTRA_ARGS="-Dno-xwayland"

sway $SWAY_EXTRA_ARGS &
SWAY_PID=$!
sleep 2

# Create virtual output with desired resolution
swaymsg create_output WLR_HEADLESS 2>/dev/null || true
swaymsg output HEADLESS-1 resolution "${WIDTH}x${HEIGHT}" 2>/dev/null || true

echo "[Wayland] Starting wayvnc on port ${VNC_PORT}..."
wayvnc --output=HEADLESS-1 127.0.0.1 "${VNC_PORT}" &
WAYVNC_PID=$!
sleep 1

echo "[Wayland] Starting noVNC on port ${NOVNC_PORT}..."
websockify --web="${NOVNC_PATH}" "${NOVNC_PORT}" "localhost:${VNC_PORT}" &
NOVNC_PID=$!
sleep 0.5

echo "[Wayland] Opening terminal (foot)..."
swaymsg exec foot 2>/dev/null || foot &
sleep 0.5

echo ""
echo "============================================="
echo "  Wayland Environment Ready"
echo "  noVNC: http://localhost:${NOVNC_PORT}/vnc.html"
echo "  VNC:   localhost:${VNC_PORT}"
echo "============================================="

if [[ -n "$APP_CMD" ]]; then
    WAYLAND_APP_CMD="${APP_CMD} --enable-features=UseOzonePlatform --ozone-platform=wayland"
    if [[ "${AUTO_LAUNCH}" == "true" ]]; then
        echo "[Wayland] Auto-launching app with native Wayland..."
        swaymsg exec "$WAYLAND_APP_CMD" 2>/dev/null || $WAYLAND_APP_CMD &
    else
        echo "[Wayland] Launch app with native Wayland:"
        echo "      $WAYLAND_APP_CMD"
        echo ""
        echo "  Or launch from the foot terminal inside the VNC session."
    fi
fi

echo ""
echo "[Wayland] Waiting... Press Ctrl+C to stop."

cleanup() {
    echo "[Wayland] Shutting down..."
    kill $NOVNC_PID 2>/dev/null
    kill $WAYVNC_PID 2>/dev/null
    kill $SWAY_PID 2>/dev/null
    return 0
}
trap cleanup SIGTERM SIGINT

wait $SWAY_PID
