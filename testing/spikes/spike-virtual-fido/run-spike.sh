#!/usr/bin/env bash
#
# run-spike.sh - Build and run the virtual-fido + fido2-tools spike
#
# This script builds the Docker image and runs the spike container.
# Must be run from the spike directory (testing/spikes/spike-virtual-fido/).
#
# The container runs --privileged because virtual-fido needs:
#   1. The vhci-hcd kernel module loaded
#   2. Access to /dev for USB device creation
#   3. Access to /sys/devices/platform/ for USB/IP attachment

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="spike-virtual-fido"
CONTAINER_NAME="spike-virtual-fido-run"

echo "============================================="
echo "  virtual-fido + fido2-tools Spike Test"
echo "============================================="
echo ""
echo "Host:      $(uname -s) $(uname -m)"
echo "Docker:    $(docker --version 2>/dev/null || echo 'NOT FOUND')"
echo ""

# Verify Docker is available
if ! command -v docker &>/dev/null; then
    echo "FAIL: Docker is not installed or not on PATH."
    echo "Install Docker Desktop for macOS: https://docs.docker.com/desktop/install/mac-install/"
    exit 1
fi

# Verify Docker daemon is running
if ! docker info &>/dev/null 2>&1; then
    echo "FAIL: Docker daemon is not running."
    echo "Start Docker Desktop and try again."
    exit 1
fi

# On macOS, warn that vhci-hcd is likely unavailable in Docker Desktop
if [[ "$(uname -s)" == "Darwin" ]]; then
    echo "NOTE: Running on macOS. Docker Desktop uses a minimal LinuxKit"
    echo "      kernel that likely does NOT include the vhci-hcd module."
    echo "      The spike will detect this and report which phases can run."
    echo ""
fi

echo "Building Docker image '${IMAGE_NAME}'..."
echo "(This downloads Ubuntu 24.04, fido2-tools, Go, and builds virtual-fido)"
echo ""

docker build -t "${IMAGE_NAME}" "${SCRIPT_DIR}"

echo ""
echo "Running spike container (--privileged required for USB/kernel access)..."
echo ""

# Remove any previous container with the same name
docker rm -f "${CONTAINER_NAME}" 2>/dev/null || true

# Run with --privileged for kernel module loading and /dev access.
docker run \
    --name "${CONTAINER_NAME}" \
    --privileged \
    --rm \
    "${IMAGE_NAME}"

EXIT_CODE=$?

echo ""
if [[ $EXIT_CODE -eq 0 ]]; then
    echo "Spike complete: all tests passed."
elif [[ $EXIT_CODE -eq 2 ]]; then
    echo "Spike complete: tests skipped (vhci-hcd not available)."
    echo "Try running on a native Linux host or GitHub Actions runner."
else
    echo "Spike complete: some tests failed. See output above."
fi
exit $EXIT_CODE
