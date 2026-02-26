#!/bin/bash
# Run Playwright authenticated tests inside a Docker container.
# This script is called by the entrypoint when RUN_TESTS=true.
#
# It starts the display server (Xvfb/Sway), installs npm dependencies
# from the mounted source, then runs the authenticated test suite.
# The container exits with the test exit code.
set -e

SESSION_DIR="/home/tester/.config/teams-for-linux"
SRC_DIR="/src"

echo "============================================="
echo "  Running Playwright Tests"
echo "============================================="
echo "  Distro:         $(cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d '"')"
echo "  Display Server: ${DISPLAY_SERVER}"
echo "  Session dir:    ${SESSION_DIR}"
echo "============================================="

# Start D-Bus session bus (Electron needs it for IPC)
if command -v dbus-launch &>/dev/null; then
    eval "$(dbus-launch --sh-syntax)"
    export DBUS_SESSION_BUS_ADDRESS
fi

# Tell helpers.js we're inside Docker
export DOCKER_TEST=true

# Check source is mounted
if [[ ! -f "${SRC_DIR}/package.json" ]]; then
    echo "[!] Source not mounted at ${SRC_DIR}. Check docker-compose volumes."
    exit 1
fi

# Check session exists
if [[ ! -d "${SESSION_DIR}" ]] || [[ ! -f "${SESSION_DIR}/Cookies" && ! -d "${SESSION_DIR}/Partitions" ]]; then
    echo "[!] No login session found in ${SESSION_DIR}."
    echo "    Run the container normally first and log in via noVNC,"
    echo "    then re-run with --test."
    exit 1
fi

# Diagnostic: show session directory contents
echo "[*] Session directory contents:"
ls -la "${SESSION_DIR}/" | head -20
echo "[*] Session dir permissions: $(stat -c '%U:%G %a' "${SESSION_DIR}" 2>/dev/null || stat -f '%Su:%Sg %Lp' "${SESSION_DIR}" 2>/dev/null)"

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

echo "[*] Starting display server for tests..."

# Start the display server in the background (tests need it but not noVNC)
case "${DISPLAY_SERVER}" in
    x11)
        Xvfb :1 -screen 0 "${SCREEN_RESOLUTION}" -ac +extension GLX +render -noreset &
        DISPLAY_PID=$!
        sleep 2
        export DISPLAY=:1
        # Start a window manager (Electron needs one for window management)
        openbox &
        sleep 1
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
        # Wait for the Wayland socket to appear
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
        # Wait for the Wayland socket (Sway creates it)
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
        # XWayland: Electron runs as X11 client through Sway's XWayland
        export DISPLAY=:0
        ;;
esac

echo "[*] Display server ready."
echo "[*] Running authenticated tests..."
echo ""

# Point tests at the persisted session
export E2E_SESSION_DIR="${SESSION_DIR}"

# Run the tests
cd "$WORK_DIR"
npx playwright test --config playwright.authenticated.config.js "$@"
TEST_EXIT=$?

# Cleanup
kill $DISPLAY_PID 2>/dev/null || true

exit $TEST_EXIT
