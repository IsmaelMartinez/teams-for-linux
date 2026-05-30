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
    DOWNLOADED="${APP_LOCAL_DIR}/teams-for-linux.AppImage"
    echo "[*] Downloading app from: ${APP_URL}"
    if curl -fSL --retry 3 --retry-delay 2 -o "${DOWNLOADED}" "${APP_URL}"; then
        # Verify the download is an ELF binary (AppImages are ELF + appended
        # squashfs). If it's JSON/HTML (e.g. API metadata served instead of
        # the asset) we must fail now — chmod +x succeeds on anything, and
        # "executing" a JSON blob later would time out the smoke check with
        # no obvious cause.
        DETECTED=$(file -b "${DOWNLOADED}" 2>/dev/null || echo "unknown")
        if [[ "${DETECTED}" != ELF* ]]; then
            echo "[!] Downloaded file is not an ELF binary."
            echo "    file:   ${DETECTED}"
            echo "    size:   $(stat -c%s "${DOWNLOADED}" 2>/dev/null || wc -c <"${DOWNLOADED}") bytes"
            echo "    first 200 bytes:"
            head -c 200 "${DOWNLOADED}" || true
            echo
            rm -f "${DOWNLOADED}"
            exit 1
        fi
        chmod +x "${DOWNLOADED}"
        echo "[*] Download complete: ${DOWNLOADED} ($(stat -c%s "${DOWNLOADED}" 2>/dev/null || wc -c <"${DOWNLOADED}") bytes)"
    else
        echo "[!] Download failed. You can still launch the app manually later."
        rm -f "${DOWNLOADED}"
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
# Use plaintext cookie storage so sessions persist across different D-Bus sessions.
# Without this, Chromium encrypts cookies via the system keyring (gnome-keyring/kwallet)
# which differs between the manual-login and automated-test D-Bus sessions.
ELECTRON_FLAGS="${ELECTRON_FLAGS} --password-store=basic"

# Force software rendering via Mesa (no hardware GPU in container)
export LIBGL_ALWAYS_SOFTWARE=1
export MESA_GL_VERSION_OVERRIDE=3.3

# Set XDG_SESSION_TYPE so the app's Wayland detection (commandLine.js) triggers.
# The AppImage no longer bakes in an --ozone-platform default; Chromium picks the
# backend itself per session. For Wayland testing, start-wayland.sh forces native
# Wayland with --ozone-platform=wayland. For XWayland testing, the app launches
# without an explicit ozone flag and Chromium chooses X11/XWayland on its own.
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
    # /src is mounted read-only and its node_modules are from the host platform.
    # Running npm start would fail with EROFS trying to reconcile them.
    echo "[!] No app binary found. /src is available but cannot run from source"
    echo "    in Docker (read-only mount, host-platform node_modules)."
    echo ""
    echo "    Provide an app binary using one of these methods:"
    echo "      --latest              Download the latest GitHub release automatically"
    echo "      --url <release-url>   Download an AppImage from a specific URL"
    echo "      --appimage <path>     Copy a local AppImage into the container"
    echo "      Place a .deb or .rpm in tests/cross-distro/app/"
    echo ""
    echo "    Example:"
    echo "      ./run.sh ubuntu x11 --latest"
    APP_CMD=""
fi

if [[ -n "$APP_CMD" ]] && [[ -n "${APP_FLAGS:-}" ]]; then
    APP_CMD="${APP_CMD} ${APP_FLAGS}"
fi

export APP_CMD
export AUTO_LAUNCH="${AUTO_LAUNCH:-true}"

# Login mode: install workspace Electron, start noVNC, launch app for login
if [[ "${RUN_LOGIN:-false}" == "true" ]]; then
    echo "[*] Login mode: launching app with test Electron for session creation..."
    exec /usr/local/bin/run-tests.sh
fi

# Test mode: start display server and run Playwright tests instead of the app
if [[ "${RUN_TESTS:-false}" == "true" ]]; then
    echo "[*] Test mode: running Playwright tests..."
    exec /usr/local/bin/run-tests.sh
fi

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
