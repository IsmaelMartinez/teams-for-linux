#!/bin/bash
# Cross-Distro Testing Helper Script
# Usage: ./run.sh <distro> <display-server> [options]
#
# Examples:
#   ./run.sh ubuntu x11
#   ./run.sh ubuntu x11 --appimage ./teams.AppImage
#   ./run.sh fedora wayland --url https://example.com/teams.AppImage
#   ./run.sh debian xwayland --no-launch
#   ./run.sh --list            # Show all configurations
#   ./run.sh --build-all       # Pre-build all Docker images
#   ./run.sh --stop-all        # Stop all running containers

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

DISTROS=("ubuntu" "fedora" "debian")
DISPLAY_SERVERS=("x11" "wayland" "xwayland")

# Port mapping: distro-display -> noVNC port
declare -A NOVNC_PORTS
declare -A VNC_PORTS
PORT=6081
VPORT=5901
for distro in "${DISTROS[@]}"; do
    for ds in "${DISPLAY_SERVERS[@]}"; do
        NOVNC_PORTS["${distro}-${ds}"]=$PORT
        VNC_PORTS["${distro}-${ds}"]=$VPORT
        ((PORT++))
        ((VPORT++))
    done
done

show_help() {
    cat <<'EOF'
Cross-Distro Testing for Teams for Linux

Usage:
  ./run.sh <distro> <display-server> [options]
  ./run.sh --list           Show all configurations and ports
  ./run.sh --build-all      Pre-build all Docker images
  ./run.sh --stop-all       Stop all running containers

Distros:      ubuntu, fedora, debian
Display:      x11, wayland, xwayland

Options:
  --appimage <path>   Copy a local AppImage into the container
  --url <url>         Download AppImage from URL at container startup
  --no-launch         Don't auto-launch the app (just start the desktop)

Examples:
  # Local AppImage
  ./run.sh ubuntu x11 --appimage ../../dist/teams-for-linux.AppImage

  # Download from URL (e.g. CI artifact link, GitHub release)
  ./run.sh fedora wayland --url https://github.com/.../teams-for-linux.AppImage

  # Just the desktop, launch app manually from terminal
  ./run.sh debian xwayland --no-launch

The environment is accessible via:
  - Browser (noVNC): http://localhost:<port>/vnc.html
  - VNC client:      localhost:<vnc-port>
EOF
}

show_list() {
    echo ""
    echo "Available test configurations:"
    echo ""
    printf "%-20s  %-10s  %-10s\n" "SERVICE" "noVNC" "VNC"
    printf "%-20s  %-10s  %-10s\n" "-------" "-----" "---"
    for distro in "${DISTROS[@]}"; do
        for ds in "${DISPLAY_SERVERS[@]}"; do
            key="${distro}-${ds}"
            printf "%-20s  %-10s  %-10s\n" "$key" "${NOVNC_PORTS[$key]}" "${VNC_PORTS[$key]}"
        done
    done
    echo ""
}

build_all() {
    echo "[*] Building all Docker images..."
    for distro in "${DISTROS[@]}"; do
        echo ""
        echo "=== Building ${distro} ==="
        docker compose build "${distro}-x11"
    done
    echo ""
    echo "[*] All images built. (Each distro image is shared across display servers.)"
}

stop_all() {
    echo "[*] Stopping all containers..."
    docker compose down
    echo "[*] Done."
}

# Parse global flags
case "${1:-}" in
    -h|--help|"")
        show_help
        exit 0
        ;;
    --list)
        show_list
        exit 0
        ;;
    --build-all)
        build_all
        exit 0
        ;;
    --stop-all)
        stop_all
        exit 0
        ;;
esac

DISTRO="$1"
DISPLAY_SERVER="$2"
shift 2

# Parse options
APPIMAGE_PATH=""
APP_URL=""
AUTO_LAUNCH="true"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --appimage)
            APPIMAGE_PATH="$2"
            shift 2
            ;;
        --url)
            APP_URL="$2"
            shift 2
            ;;
        --no-launch)
            AUTO_LAUNCH="false"
            shift
            ;;
        *)
            # Legacy: positional arg is treated as appimage path
            APPIMAGE_PATH="$1"
            shift
            ;;
    esac
done

# Validate distro
if [[ ! " ${DISTROS[*]} " =~ " ${DISTRO} " ]]; then
    echo "[!] Invalid distro: ${DISTRO}"
    echo "    Valid: ${DISTROS[*]}"
    exit 1
fi

# Validate display server
if [[ ! " ${DISPLAY_SERVERS[*]} " =~ " ${DISPLAY_SERVER} " ]]; then
    echo "[!] Invalid display server: ${DISPLAY_SERVER}"
    echo "    Valid: ${DISPLAY_SERVERS[*]}"
    exit 1
fi

SERVICE="${DISTRO}-${DISPLAY_SERVER}"

# Set up app directory for mounting
APP_DIR="${SCRIPT_DIR}/app"
mkdir -p "$APP_DIR"

if [ -n "$APPIMAGE_PATH" ]; then
    if [ ! -f "$APPIMAGE_PATH" ]; then
        echo "[!] AppImage not found: ${APPIMAGE_PATH}"
        exit 1
    fi
    echo "[*] Copying AppImage to mount directory..."
    cp "$APPIMAGE_PATH" "${APP_DIR}/teams-for-linux.AppImage"
    chmod +x "${APP_DIR}/teams-for-linux.AppImage"
fi

echo ""
echo "============================================="
echo "  Starting: ${SERVICE}"
echo "  noVNC:    http://localhost:${NOVNC_PORTS[$SERVICE]}/vnc.html"
echo "  VNC:      localhost:${VNC_PORTS[$SERVICE]}"
if [ -n "$APP_URL" ]; then
echo "  App URL:  ${APP_URL}"
fi
echo "  Auto-launch: ${AUTO_LAUNCH}"
echo "============================================="
echo ""

# Build env var overrides for docker compose
COMPOSE_ENV=()
if [ -n "$APP_URL" ]; then
    COMPOSE_ENV+=(-e "APP_URL=${APP_URL}")
fi
COMPOSE_ENV+=(-e "AUTO_LAUNCH=${AUTO_LAUNCH}")

# Build and run
docker compose run --build --service-ports "${COMPOSE_ENV[@]}" "${SERVICE}"
