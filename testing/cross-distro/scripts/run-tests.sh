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

# Install dependencies from the mounted source into a writable location.
# /src is mounted read-only, so we copy package files and install locally.
WORK_DIR="/home/tester/test-workspace"
mkdir -p "$WORK_DIR"

echo "[*] Installing npm dependencies..."
cp "${SRC_DIR}/package.json" "${SRC_DIR}/package-lock.json" "$WORK_DIR/"
cd "$WORK_DIR"
npm ci --ignore-scripts 2>&1 | tail -3

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
        WIDTH=$(echo "$SCREEN_RESOLUTION" | cut -dx -f1)
        HEIGHT=$(echo "$SCREEN_RESOLUTION" | cut -dx -f2)
        DEPTH=$(echo "$SCREEN_RESOLUTION" | cut -dx -f3)
        Xvfb :1 -screen 0 "${SCREEN_RESOLUTION}" -ac +extension GLX +render -noreset &
        DISPLAY_PID=$!
        sleep 1
        export DISPLAY=:1
        # Start a window manager (some Electron operations need one)
        openbox &
        sleep 0.5
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
        sleep 2
        # Create virtual output
        swaymsg create_output WLR_HEADLESS 2>/dev/null || true
        export WAYLAND_DISPLAY=wayland-1
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
        sleep 2
        swaymsg create_output WLR_HEADLESS 2>/dev/null || true
        # XWayland sets DISPLAY automatically via Sway
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
