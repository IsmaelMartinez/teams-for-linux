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
#   ./run.sh --run-distro ubuntu         # Run all display servers for a distro
#   ./run.sh --run-display x11           # Run all distros with one display server
#   ./run.sh --run-all                   # Run all 9 configurations

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Port mapping computed from index. Avoids bash 4 associative arrays
# so the script works on macOS (bash 3.2).
# Order: ubuntu-x11(0), ubuntu-wayland(1), ubuntu-xwayland(2),
#         fedora-x11(3), fedora-wayland(4), fedora-xwayland(5),
#         debian-x11(6), debian-wayland(7), debian-xwayland(8)
DISTROS="ubuntu fedora debian"
DISPLAY_SERVERS="x11 wayland xwayland"
NOVNC_BASE=6081
VNC_BASE=5901

validate_distro() {
    local distro="$1"
    local valid=false
    for d in $DISTROS; do [[ "$d" == "$distro" ]] && valid=true; done
    if [[ "$valid" == false ]]; then
        echo "[!] Invalid distro: ${distro}"
        echo "    Valid: ${DISTROS}"
        exit 1
    fi
}

validate_display_server() {
    local ds="$1"
    local valid=false
    for s in $DISPLAY_SERVERS; do [[ "$s" == "$ds" ]] && valid=true; done
    if [[ "$valid" == false ]]; then
        echo "[!] Invalid display server: ${ds}"
        echo "    Valid: ${DISPLAY_SERVERS}"
        exit 1
    fi
}

get_index() {
    local distro="$1" ds="$2" d_idx=0 ds_idx=0 i=0
    for d in $DISTROS; do
        if [[ "$d" == "$distro" ]]; then d_idx=$i; fi
        i=$((i + 1))
    done
    i=0
    for s in $DISPLAY_SERVERS; do
        if [[ "$s" == "$ds" ]]; then ds_idx=$i; fi
        i=$((i + 1))
    done
    echo $(( d_idx * 3 + ds_idx ))
    return 0
}

get_novnc_port() {
    local distro="$1" ds="$2"
    echo $(( NOVNC_BASE + $(get_index "$distro" "$ds") ))
    return 0
}

get_vnc_port() {
    local distro="$1" ds="$2"
    echo $(( VNC_BASE + $(get_index "$distro" "$ds") ))
    return 0
}

show_help() {
    cat <<'EOF'
Cross-Distro Testing for Teams for Linux

Usage:
  ./run.sh <distro> <display-server> [options]
  ./run.sh --run-distro <distro> [options]   Run all display servers for a distro
  ./run.sh --run-display <display> [options]  Run all distros with a display server
  ./run.sh --run-all [options]               Run all 9 configurations
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
  # Single configuration
  ./run.sh ubuntu x11 --appimage ../../dist/teams-for-linux.AppImage

  # All display servers for one distro (3 containers in parallel)
  ./run.sh --run-distro ubuntu --url https://github.com/.../teams.AppImage

  # All distros with one display server (3 containers in parallel)
  ./run.sh --run-display x11

  # All 9 configurations in parallel
  ./run.sh --run-all --no-launch

  # Just the desktop, launch app manually from terminal
  ./run.sh debian xwayland --no-launch

The environment is accessible via:
  - Browser (noVNC): http://localhost:<port>/vnc.html
  - VNC client:      localhost:<vnc-port>
EOF
    return 0
}

show_list() {
    echo ""
    echo "Available test configurations:"
    echo ""
    printf "%-20s  %-10s  %-10s\n" "SERVICE" "noVNC" "VNC"
    printf "%-20s  %-10s  %-10s\n" "-------" "-----" "---"
    for distro in $DISTROS; do
        for ds in $DISPLAY_SERVERS; do
            printf "%-20s  %-10s  %-10s\n" "${distro}-${ds}" "$(get_novnc_port "$distro" "$ds")" "$(get_vnc_port "$distro" "$ds")"
        done
    done
    echo ""
    return 0
}

build_all() {
    echo "[*] Building all Docker images..."
    for distro in $DISTROS; do
        echo ""
        echo "=== Building ${distro} ==="
        docker compose build "${distro}-x11"
    done
    echo ""
    echo "[*] All images built. (Each distro image is shared across display servers.)"
    return 0
}

stop_all() {
    echo "[*] Stopping all containers..."
    docker compose down
    echo "[*] Done."
    return 0
}

# Parse group options (--url, --no-launch, --appimage) from remaining args.
# Sets APP_URL, AUTO_LAUNCH, and APPIMAGE_PATH variables.
parse_group_options() {
    APPIMAGE_PATH=""
    APP_URL=""
    AUTO_LAUNCH="true"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --appimage)
                if [[ -z "${2:-}" || "$2" =~ ^-- ]]; then
                    echo "[!] Missing argument for $1" >&2
                    exit 1
                fi
                APPIMAGE_PATH="$2"
                shift 2
                ;;
            --url)
                if [[ -z "${2:-}" || "$2" =~ ^-- ]]; then
                    echo "[!] Missing argument for $1" >&2
                    exit 1
                fi
                APP_URL="$2"
                shift 2
                ;;
            --no-launch)
                AUTO_LAUNCH="false"
                shift
                ;;
            *)
                echo "[!] Unknown option: $1"
                exit 1
                ;;
        esac
    done
}

# Copy AppImage into the app/ mount directory if --appimage was specified.
setup_appimage() {
    local app_dir="${SCRIPT_DIR}/app"
    mkdir -p "$app_dir"

    if [[ -n "${APPIMAGE_PATH:-}" ]]; then
        if [[ ! -f "$APPIMAGE_PATH" ]]; then
            echo "[!] AppImage not found: ${APPIMAGE_PATH}"
            exit 1
        fi
        echo "[*] Copying AppImage to mount directory..."
        cp "$APPIMAGE_PATH" "${app_dir}/teams-for-linux.AppImage"
        chmod +x "${app_dir}/teams-for-linux.AppImage"
    fi
}

# Run multiple services in parallel using docker compose up.
# Arguments: list of service names (e.g. "ubuntu-x11 ubuntu-wayland")
run_group() {
    local services=("$@")

    setup_appimage

    echo ""
    echo "============================================="
    echo "  Starting ${#services[@]} configurations in parallel"
    echo "============================================="
    for svc in "${services[@]}"; do
        local distro="${svc%-*}"
        local ds="${svc##*-}"
        local novnc
        novnc=$(get_novnc_port "$distro" "$ds")
        printf "  %-20s http://localhost:%s/vnc.html\n" "${svc}" "${novnc}"
    done
    if [[ -n "${APP_URL:-}" ]]; then
        echo "  App URL:  ${APP_URL}"
    fi
    echo "  Auto-launch: ${AUTO_LAUNCH}"
    echo "============================================="
    echo ""

    # Export env vars so docker compose picks them up via ${APP_URL:-} and
    # ${AUTO_LAUNCH:-true} defined in docker-compose.yml
    export APP_URL="${APP_URL:-}"
    export AUTO_LAUNCH="${AUTO_LAUNCH}"

    docker compose up --build "${services[@]}"
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
    --run-distro)
        DISTRO="$2"
        shift 2

        validate_distro "$DISTRO"

        parse_group_options "$@"

        # Build service list: all display servers for this distro
        SERVICES=()
        for ds in $DISPLAY_SERVERS; do
            SERVICES+=("${DISTRO}-${ds}")
        done

        run_group "${SERVICES[@]}"
        exit 0
        ;;
    --run-display)
        DISPLAY_SERVER="$2"
        shift 2

        validate_display_server "$DISPLAY_SERVER"

        parse_group_options "$@"

        # Build service list: all distros for this display server
        SERVICES=()
        for distro in $DISTROS; do
            SERVICES+=("${distro}-${DISPLAY_SERVER}")
        done

        run_group "${SERVICES[@]}"
        exit 0
        ;;
    --run-all)
        shift

        parse_group_options "$@"

        # Build service list: all 9 configurations
        SERVICES=()
        for distro in $DISTROS; do
            for ds in $DISPLAY_SERVERS; do
                SERVICES+=("${distro}-${ds}")
            done
        done

        run_group "${SERVICES[@]}"
        exit 0
        ;;
    --*)
        echo "[!] Unknown option: $1"
        show_help
        exit 1
        ;;
    *)
        # Valid distro name — fall through to single-service mode below
        ;;
esac

# ---- Single-service mode (original behavior) ----

DISTRO="$1"
DISPLAY_SERVER="$2"
shift 2

parse_group_options "$@"

validate_distro "$DISTRO"
validate_display_server "$DISPLAY_SERVER"

SERVICE="${DISTRO}-${DISPLAY_SERVER}"

setup_appimage

NOVNC_PORT=$(get_novnc_port "$DISTRO" "$DISPLAY_SERVER")
VNC_PORT=$(get_vnc_port "$DISTRO" "$DISPLAY_SERVER")

echo ""
echo "============================================="
echo "  Starting: ${SERVICE}"
echo "  noVNC:    http://localhost:${NOVNC_PORT}/vnc.html"
echo "  VNC:      localhost:${VNC_PORT}"
if [[ -n "$APP_URL" ]]; then
echo "  App URL:  ${APP_URL}"
fi
echo "  Auto-launch: ${AUTO_LAUNCH}"
echo "============================================="
echo ""

# Build env var overrides for docker compose (use array to prevent injection)
COMPOSE_ENV=()
if [[ -n "$APP_URL" ]]; then
    COMPOSE_ENV+=( -e "APP_URL=${APP_URL}" )
fi
COMPOSE_ENV+=( -e "AUTO_LAUNCH=${AUTO_LAUNCH}" )

# Build and run
docker compose run --build --service-ports "${COMPOSE_ENV[@]}" "${SERVICE}"
