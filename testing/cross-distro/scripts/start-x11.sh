#!/bin/bash
# Start X11 environment: Xvfb + Openbox + x11vnc + noVNC
set -e

WIDTH=$(echo "$SCREEN_RESOLUTION" | cut -dx -f1)
HEIGHT=$(echo "$SCREEN_RESOLUTION" | cut -dx -f2)
DEPTH=$(echo "$SCREEN_RESOLUTION" | cut -dx -f3)

echo "[X11] Starting Xvfb on :1 (${WIDTH}x${HEIGHT}x${DEPTH})..."
Xvfb :1 -screen 0 "${SCREEN_RESOLUTION}" -ac +extension GLX +render -noreset &
XVFB_PID=$!
sleep 1

export DISPLAY=:1

echo "[X11] Starting Openbox window manager..."
openbox &
sleep 0.5

echo "[X11] Starting x11vnc on port ${VNC_PORT}..."
x11vnc -display :1 -forever -shared -rfbport "${VNC_PORT}" -localhost -bg -o /tmp/x11vnc.log
sleep 0.5

echo "[X11] Starting noVNC on port ${NOVNC_PORT}..."
websockify --web="${NOVNC_PATH}" "${NOVNC_PORT}" "localhost:${VNC_PORT}" &
NOVNC_PID=$!
sleep 0.5

echo "[X11] Opening terminal..."
xterm -geometry 100x30+10+10 &

echo ""
echo "============================================="
echo "  X11 Environment Ready"
echo "  noVNC: http://localhost:${NOVNC_PORT}/vnc.html"
echo "  VNC:   localhost:${VNC_PORT}"
echo "============================================="

APP_LOG="/tmp/app.log"
if [[ -n "$APP_CMD" ]]; then
    if [[ "${AUTO_LAUNCH}" == "true" ]]; then
        echo "[X11] Auto-launching app (logs: tail -f ${APP_LOG})..."
        $APP_CMD > "$APP_LOG" 2>&1 &
    else
        echo "[X11] App available. Launch with:"
        echo "      $APP_CMD 2>&1 | tee ${APP_LOG}"
        echo ""
        echo "  Or launch from the xterm terminal inside the VNC session."
    fi
fi

echo ""
echo "[X11] Waiting... Press Ctrl+C to stop."

# Keep container running and forward signals
cleanup() {
    echo "[X11] Shutting down..."
    kill $NOVNC_PID 2>/dev/null
    kill $XVFB_PID 2>/dev/null
    return 0
}
trap cleanup SIGTERM SIGINT

wait $XVFB_PID
