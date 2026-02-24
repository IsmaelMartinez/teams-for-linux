#!/bin/bash
# Cross-Distro Testing Helper Script
# Usage: ./run.sh <distro> <display-server> [path-to-appimage]
#
# Examples:
#   ./run.sh ubuntu x11
#   ./run.sh fedora wayland ./dist/teams-for-linux.AppImage
#   ./run.sh arch xwayland
#   ./run.sh --list            # Show all configurations
#   ./run.sh --build-all       # Pre-build all Docker images
#   ./run.sh --stop-all        # Stop all running containers

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

DISTROS=("ubuntu" "fedora" "debian" "arch")
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
  ./run.sh <distro> <display-server> [path-to-appimage]
  ./run.sh --list           Show all configurations and ports
  ./run.sh --build-all      Pre-build all Docker images
  ./run.sh --stop-all       Stop all running containers

Distros:      ubuntu, fedora, debian, arch
Display:      x11, wayland, xwayland

Examples:
  ./run.sh ubuntu x11
  ./run.sh fedora wayland ~/teams-for-linux.AppImage
  ./run.sh arch xwayland

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

# Parse arguments
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
APPIMAGE_PATH="${3:-}"

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
echo "============================================="
echo ""

# Build and run
docker compose up --build "${SERVICE}"
