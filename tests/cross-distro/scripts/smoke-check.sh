#!/bin/bash
# Smoke check for cross-distro testing containers.
# Polls /tmp/app.log inside a running container for the Microsoft login URL.
#
# Usage: smoke-check.sh <container-name> [timeout-seconds]
#
# Exit 0 if the app reaches login.microsoftonline.com within the timeout.
# Exit 1 if the container stops, the log file never appears, or time runs out.
set -e

CONTAINER="${1:?Usage: smoke-check.sh <container-name> [timeout-seconds]}"
TIMEOUT="${2:-120}"
MARKER="login.microsoftonline.com"
POLL_INTERVAL=5
LOG_FILE="/tmp/app.log"

echo "[smoke] Checking container: ${CONTAINER} (timeout: ${TIMEOUT}s)"

# Phase 1: Wait for the log file to exist (app download + startup)
ELAPSED=0
while [[ "$ELAPSED" -lt "$TIMEOUT" ]]; do
    # Check container is still running
    if ! docker inspect --format='{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
        echo "[smoke] FAIL: Container ${CONTAINER} is not running"
        docker logs "$CONTAINER" 2>&1 | tail -30 || true
        exit 1
    fi

    # Check if log file exists
    if docker exec "$CONTAINER" test -f "$LOG_FILE" 2>/dev/null; then
        echo "[smoke] Log file found after ${ELAPSED}s"
        break
    fi

    sleep "$POLL_INTERVAL"
    ELAPSED=$((ELAPSED + POLL_INTERVAL))
done

if [[ "$ELAPSED" -ge "$TIMEOUT" ]]; then
    echo "[smoke] FAIL: Log file ${LOG_FILE} not found after ${TIMEOUT}s"
    exit 1
fi

# Phase 2: Poll the log file for the login URL marker
while [[ "$ELAPSED" -lt "$TIMEOUT" ]]; do
    if ! docker inspect --format='{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
        echo "[smoke] FAIL: Container ${CONTAINER} stopped unexpectedly"
        docker exec "$CONTAINER" cat "$LOG_FILE" 2>/dev/null | tail -30 || true
        exit 1
    fi

    if docker exec "$CONTAINER" grep -q "$MARKER" "$LOG_FILE" 2>/dev/null; then
        echo "[smoke] PASS: Found ${MARKER} in ${LOG_FILE} after ${ELAPSED}s"
        exit 0
    fi

    sleep "$POLL_INTERVAL"
    ELAPSED=$((ELAPSED + POLL_INTERVAL))
done

echo "[smoke] FAIL: ${MARKER} not found in ${LOG_FILE} after ${TIMEOUT}s"
echo "[smoke] Last 30 lines of app log:"
docker exec "$CONTAINER" tail -30 "$LOG_FILE" 2>/dev/null || echo "(could not read log)"
exit 1
