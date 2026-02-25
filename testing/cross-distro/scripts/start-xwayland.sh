#!/bin/bash
# Start XWayland environment: Sway (headless, XWayland enabled) + wayvnc + noVNC
# The app runs as an X11 client through XWayland (no ozone flags)
set -e

WIDTH=$(echo "$SCREEN_RESOLUTION" | cut -dx -f1)
HEIGHT=$(echo "$SCREEN_RESOLUTION" | cut -dx -f2)

echo "[XWayland] Starting Sway compositor (headless + XWayland)..."
export WLR_BACKENDS=headless
export WLR_LIBINPUT_NO_DEVICES=1
export WLR_RENDERER=pixman
export WAYLAND_DISPLAY=wayland-1
export XDG_SESSION_TYPE=wayland
export XDG_CURRENT_DESKTOP=sway

# XWayland is enabled by default in Sway (no -Dno-xwayland flag)
sway &
SWAY_PID=$!
sleep 2

# Create virtual output with desired resolution
swaymsg create_output WLR_HEADLESS 2>/dev/null || true
swaymsg output HEADLESS-1 resolution "${WIDTH}x${HEIGHT}" 2>/dev/null || true

echo "[XWayland] Starting wayvnc on port ${VNC_PORT}..."
wayvnc --output=HEADLESS-1 127.0.0.1 "${VNC_PORT}" &
WAYVNC_PID=$!
sleep 1

echo "[XWayland] Starting noVNC on port ${NOVNC_PORT}..."
websockify --web="${NOVNC_PATH}" "${NOVNC_PORT}" "localhost:${VNC_PORT}" &
NOVNC_PID=$!
sleep 0.5

# Open xterm via XWayland (X11 app on Wayland)
echo "[XWayland] Opening terminal (xterm via XWayland)..."
if command -v xterm &>/dev/null; then
    swaymsg exec xterm 2>/dev/null || true
else
    swaymsg exec foot 2>/dev/null || true
fi
sleep 0.5

echo ""
echo "============================================="
echo "  XWayland Environment Ready"
echo "  noVNC: http://localhost:${NOVNC_PORT}/vnc.html"
echo "  VNC:   localhost:${VNC_PORT}"
echo "============================================="

if [[ -n "$APP_CMD" ]]; then
    if [[ "${AUTO_LAUNCH}" == "true" ]]; then
        echo "[XWayland] Auto-launching app (X11 client via XWayland)..."
        swaymsg exec "$APP_CMD" 2>/dev/null || $APP_CMD &
    else
        echo "[XWayland] Launch app (runs as X11 client via XWayland):"
        echo "      $APP_CMD"
        echo ""
        echo "  Do NOT add --ozone-platform=wayland (app should use XWayland)."
        echo "  Or launch from the terminal inside the VNC session."
    fi
fi

echo ""
echo "[XWayland] Waiting... Press Ctrl+C to stop."

cleanup() {
    echo "[XWayland] Shutting down..."
    kill $NOVNC_PID 2>/dev/null
    kill $WAYVNC_PID 2>/dev/null
    kill $SWAY_PID 2>/dev/null
    return 0
}
trap cleanup SIGTERM SIGINT

wait $SWAY_PID
