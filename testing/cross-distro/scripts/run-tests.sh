#!/bin/bash
# Run Playwright authenticated tests inside a Docker container.
# This script is called by the entrypoint when RUN_TESTS=true or RUN_LOGIN=true.
#
# Modes:
#   RUN_LOGIN=true  - Install workspace Electron, start display + noVNC, launch
#                     the app so the user can log in via browser. Session persists.
#   RUN_TESTS=true  - Install workspace Electron, start display (no noVNC), run
#                     Playwright tests against the persisted session.
#
# Both modes use the SAME Electron binary (from npm ci) so the session format
# is guaranteed to be compatible between login and test runs.
set -e

SESSION_DIR="/home/tester/.config/teams-for-linux"
SRC_DIR="/src"
readonly SEPARATOR="============================================="

MODE="test"
if [[ "${RUN_LOGIN:-false}" == "true" ]]; then
    MODE="login"
fi

echo "$SEPARATOR"
echo "  Playwright Test Runner (mode: ${MODE})"
echo "$SEPARATOR"
echo "  Distro:         $(cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d '"')"
echo "  Display Server: ${DISPLAY_SERVER}"
echo "  Session dir:    ${SESSION_DIR}"
echo "$SEPARATOR"

# D-Bus session bus is inherited from entrypoint.sh (via exec).

# Tell helpers.js we're inside Docker
export DOCKER_TEST=true

# Check source is mounted
if [[ ! -f "${SRC_DIR}/package.json" ]]; then
    echo "[!] Source not mounted at ${SRC_DIR}. Check docker-compose volumes."
    exit 1
fi

# In test mode, verify session exists
if [[ "$MODE" == "test" ]] && { [[ ! -d "${SESSION_DIR}" ]] || [[ ! -f "${SESSION_DIR}/Cookies" && ! -d "${SESSION_DIR}/Partitions" ]]; }; then
    echo "[!] No login session found in ${SESSION_DIR}."
    echo "    Run with --login first to create a session, then re-run with --test."
    exit 1
fi

# Install dependencies from the mounted source into a writable location.
# /src is mounted read-only, so we copy package files and install locally.
WORK_DIR="/home/tester/test-workspace"
mkdir -p "$WORK_DIR"

echo "[*] Installing npm dependencies..."
cp "${SRC_DIR}/package.json" "${SRC_DIR}/package-lock.json" "$WORK_DIR/"
cd "$WORK_DIR"
npm ci --ignore-scripts 2>&1 | tail -3

# Electron binary is needed by Playwright but --ignore-scripts skips it
echo "[*] Installing Electron binary..."
node node_modules/electron/install.js 2>&1 | tail -3

# Copy test files and config so they resolve @playwright/test from the
# workspace node_modules (not /src/node_modules). Symlink app/ since it's
# larger and doesn't import @playwright/test.
ln -sf "${SRC_DIR}/app" "$WORK_DIR/app"
cp -r "${SRC_DIR}/tests" "$WORK_DIR/tests"
cp "${SRC_DIR}/playwright.authenticated.config.js" "$WORK_DIR/playwright.authenticated.config.js"

echo "[*] Starting display server..."

# Software rendering env vars
export LIBGL_ALWAYS_SOFTWARE=1
export MESA_GL_VERSION_OVERRIDE=3.3

# Start the display server
case "${DISPLAY_SERVER}" in
    x11)
        Xvfb :1 -screen 0 "${SCREEN_RESOLUTION}" -ac +extension GLX +render -noreset &
        DISPLAY_PID=$!
        sleep 2
        export DISPLAY=:1
        openbox &
        sleep 1

        if [[ "$MODE" == "login" ]]; then
            echo "[*] Starting VNC + noVNC for login..."
            x11vnc -display :1 -forever -shared -rfbport "${VNC_PORT}" -localhost -bg -o /tmp/x11vnc.log
            sleep 0.5
            websockify --web="${NOVNC_PATH}" "${NOVNC_PORT}" "localhost:${VNC_PORT}" &
            NOVNC_PID=$!
            sleep 0.5
        fi
        ;;
    wayland)
        export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp/runtime-tester}"
        mkdir -p "$XDG_RUNTIME_DIR"
        chmod 700 "$XDG_RUNTIME_DIR"
        export WLR_BACKENDS=headless
        export WLR_LIBINPUT_NO_DEVICES=1
        export XDG_SESSION_TYPE=wayland
        sway &
        DISPLAY_PID=$!
        echo "[*] Waiting for Wayland socket..."
        for i in $(seq 1 20); do
            SOCKET=$(ls "$XDG_RUNTIME_DIR"/wayland-* 2>/dev/null | head -1 | xargs -r basename)
            if [[ -n "$SOCKET" ]]; then break; fi
            sleep 0.5
        done
        if [[ -z "$SOCKET" ]]; then
            echo "[!] Wayland socket not found in $XDG_RUNTIME_DIR after 10s"
            ls -la "$XDG_RUNTIME_DIR/" 2>/dev/null
            exit 1
        fi
        export WAYLAND_DISPLAY="$SOCKET"
        echo "[*] Found Wayland socket: $WAYLAND_DISPLAY"
        swaymsg create_output WLR_HEADLESS 2>/dev/null || true

        if [[ "$MODE" == "login" ]]; then
            echo "[*] Starting wayvnc + noVNC for login..."
            swaymsg output HEADLESS-1 resolution "$(echo "$SCREEN_RESOLUTION" | cut -dx -f1)x$(echo "$SCREEN_RESOLUTION" | cut -dx -f2)" 2>/dev/null || true
            wayvnc --output=HEADLESS-1 127.0.0.1 "${VNC_PORT}" &
            WAYVNC_PID=$!
            sleep 1
            websockify --web="${NOVNC_PATH}" "${NOVNC_PORT}" "localhost:${VNC_PORT}" &
            NOVNC_PID=$!
            sleep 0.5
        fi
        ;;
    xwayland)
        export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp/runtime-tester}"
        mkdir -p "$XDG_RUNTIME_DIR"
        chmod 700 "$XDG_RUNTIME_DIR"
        export WLR_BACKENDS=headless
        export WLR_LIBINPUT_NO_DEVICES=1
        export XDG_SESSION_TYPE=wayland
        sway &
        DISPLAY_PID=$!
        echo "[*] Waiting for Wayland socket..."
        for i in $(seq 1 20); do
            SOCKET=$(ls "$XDG_RUNTIME_DIR"/wayland-* 2>/dev/null | head -1 | xargs -r basename)
            if [[ -n "$SOCKET" ]]; then break; fi
            sleep 0.5
        done
        if [[ -z "$SOCKET" ]]; then
            echo "[!] Wayland socket not found in $XDG_RUNTIME_DIR after 10s"
            ls -la "$XDG_RUNTIME_DIR/" 2>/dev/null
            exit 1
        fi
        export WAYLAND_DISPLAY="$SOCKET"
        echo "[*] Found Wayland socket: $WAYLAND_DISPLAY"
        swaymsg create_output WLR_HEADLESS 2>/dev/null || true
        export DISPLAY=:0

        if [[ "$MODE" == "login" ]]; then
            echo "[*] Starting wayvnc + noVNC for login..."
            swaymsg output HEADLESS-1 resolution "$(echo "$SCREEN_RESOLUTION" | cut -dx -f1)x$(echo "$SCREEN_RESOLUTION" | cut -dx -f2)" 2>/dev/null || true
            wayvnc --output=HEADLESS-1 127.0.0.1 "${VNC_PORT}" &
            WAYVNC_PID=$!
            sleep 1
            websockify --web="${NOVNC_PATH}" "${NOVNC_PORT}" "localhost:${VNC_PORT}" &
            NOVNC_PID=$!
            sleep 0.5
        fi
        ;;
    *)
        echo "[!] Unknown display server: ${DISPLAY_SERVER}"
        exit 1
        ;;
esac

echo "[*] Display server ready."

# ============================================================
# LOGIN MODE: launch the app with noVNC so the user can log in
# ============================================================
if [[ "$MODE" == "login" ]]; then
    ELECTRON_BIN="$WORK_DIR/node_modules/.bin/electron"
    ELECTRON_FLAGS="--no-sandbox --disable-gpu --disable-gpu-compositing --disable-dev-shm-usage"
    ELECTRON_FLAGS="${ELECTRON_FLAGS} --disable-features=SpareRendererForSitePerProcess,BackForwardCache"
    ELECTRON_FLAGS="${ELECTRON_FLAGS} --renderer-process-limit=1 --js-flags=--max-old-space-size=4096"
    ELECTRON_FLAGS="${ELECTRON_FLAGS} --password-store=basic"

    if [[ "${DISPLAY_SERVER}" == "wayland" ]]; then
        ELECTRON_FLAGS="${ELECTRON_FLAGS} --ozone-platform=wayland"
    fi

    echo ""
    echo "$SEPARATOR"
    echo "  Login Mode Ready"
    echo "  noVNC: http://localhost:${NOVNC_PORT}/vnc.html"
    echo "  VNC:   localhost:${VNC_PORT}"
    echo ""
    echo "  Log into Teams, wait for it to fully load,"
    echo "  then press Ctrl+C to save the session."
    echo "$SEPARATOR"
    echo ""

    APP_LOG="/tmp/app.log"
    USER_STOPPED=false

    E2E_USER_DATA_DIR="${SESSION_DIR}" E2E_TESTING=true \
        $ELECTRON_BIN $WORK_DIR/app/index.js $ELECTRON_FLAGS > "$APP_LOG" 2>&1 &
    APP_PID=$!

    cleanup() {
        echo ""
        USER_STOPPED=true
        echo "[*] Stopping app (saving session)..."
        kill $APP_PID 2>/dev/null
        sleep 3
        echo "[*] Session saved to ${SESSION_DIR}"
        ls -la "${SESSION_DIR}/" 2>/dev/null | head -10
        ls -la "${SESSION_DIR}/Partitions/teams-4-linux/" 2>/dev/null | head -5
        kill $DISPLAY_PID 2>/dev/null
        kill ${NOVNC_PID:-0} ${WAYVNC_PID:-0} 2>/dev/null
        return 0
    }
    trap cleanup SIGTERM SIGINT

    wait $APP_PID 2>/dev/null
    APP_EXIT=$?

    if [[ "$USER_STOPPED" == false ]]; then
        echo ""
        echo "[!] App exited unexpectedly (exit code: ${APP_EXIT})."
        echo "    The session may not be valid. Check ${APP_LOG} for details."
        kill $DISPLAY_PID 2>/dev/null
        kill ${NOVNC_PID:-0} ${WAYVNC_PID:-0} 2>/dev/null
        exit 1
    fi

    cleanup
    exit 0
fi

# ============================================================
# TEST MODE: run Playwright tests against persisted session
# ============================================================

# Ensure session directory is writable by this container's tester user.
# The tester UID varies across distro images because installed packages may
# claim UID 1000, so the session files from --login may be owned by a
# different UID. Make everything world-accessible.
chmod -R a+rwX "${SESSION_DIR}" || echo "[!] Warning: Failed to set permissions on ${SESSION_DIR}. This may cause issues."

# Remove stale Chromium singleton files left by previous Electron processes.
# These persist when Electron is killed (SIGKILL) or across container restarts,
# and cause "App already running" / Permission Denied errors.
rm -f "${SESSION_DIR}/SingletonLock" "${SESSION_DIR}/SingletonSocket" "${SESSION_DIR}/SingletonCookie"

echo "[*] Running authenticated tests..."
echo ""

export E2E_SESSION_DIR="${SESSION_DIR}"

cd "$WORK_DIR"
npx playwright test --config playwright.authenticated.config.js "$@"
TEST_EXIT=$?

kill $DISPLAY_PID 2>/dev/null || true

exit $TEST_EXIT
