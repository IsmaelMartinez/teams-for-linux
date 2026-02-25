#!/bin/bash
# Build the app from source and run it in a cross-distro test container.
#
# Usage:
#   ./build-and-run.sh <distro> <display-server>
#   ./build-and-run.sh ubuntu x11
#   ./build-and-run.sh fedora wayland
#
# This script:
#   1. Runs npm ci + electron-builder to produce an x64 AppImage
#   2. Copies it into the app/ mount directory
#   3. Starts the container via run.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

DISTRO="${1:-ubuntu}"
DISPLAY_SERVER="${2:-x11}"

echo "[*] Building x64 AppImage from source..."
cd "$REPO_ROOT"
npm ci
npx electron-builder --x64 -l AppImage

# Find the built AppImage
APPIMAGE=$(find "$REPO_ROOT/dist" -maxdepth 1 -name '*.AppImage' -type f | head -1)
if [[ -z "$APPIMAGE" ]]; then
    echo "[!] Build failed — no AppImage found in dist/"
    exit 1
fi

echo "[*] Built: $APPIMAGE"

# Copy to the app/ mount directory
mkdir -p "$SCRIPT_DIR/app"
cp "$APPIMAGE" "$SCRIPT_DIR/app/teams-for-linux.AppImage"
chmod +x "$SCRIPT_DIR/app/teams-for-linux.AppImage"

echo "[*] Starting ${DISTRO}-${DISPLAY_SERVER} container..."
cd "$SCRIPT_DIR"
exec ./run.sh "$DISTRO" "$DISPLAY_SERVER"
