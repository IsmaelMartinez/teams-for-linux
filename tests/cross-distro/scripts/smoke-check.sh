#!/bin/bash
# Smoke check for cross-distro testing containers.
#
# Usage: smoke-check.sh <container-name> [timeout-seconds]
#
# PASS conditions (app launched and Electron main process is alive):
#   - The container stays running for the duration of the check.
#   - /tmp/app.log appears (start-{x11,wayland,xwayland}.sh got far enough
#     to redirect the AppImage's stdout/stderr into it).
#   - /tmp/app.log grows past MIN_LOG_BYTES, confirming the Electron main
#     process actually produced output (not just an empty file from an
#     immediate crash).
#   - /tmp/app.log contains no hard-failure signatures (exec format error,
#     cannot execute binary file, Trace/breakpoint trapped, GLIBC error).
#
# FAIL conditions:
#   - Container stops before the checks pass.
#   - Log file never appears.
#   - Log never grows above MIN_LOG_BYTES.
#   - A hard-failure signature is found.
#
# This intentionally does NOT assert any navigation URL marker — the CI
# container is unauthenticated and the main process does not log URLs to
# stdout, so URL-based assertions were timing out even when the app
# launched correctly.
set -e

CONTAINER="${1:?Usage: smoke-check.sh <container-name> [timeout-seconds]}"
TIMEOUT="${2:-120}"
POLL_INTERVAL=5
LOG_FILE="/tmp/app.log"
MIN_LOG_BYTES=500
FAIL_PATTERNS='exec format error|cannot execute binary file|Trace/breakpoint trapped|GLIBC_[0-9]'

echo "[smoke] Checking container: ${CONTAINER} (timeout: ${TIMEOUT}s)"

container_running() {
    docker inspect --format='{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true
}

dump_diagnostics() {
    echo "[smoke] --- diagnostics ---"
    echo "[smoke] container state:"
    docker inspect --format='{{.State.Status}} (exit={{.State.ExitCode}})' "$CONTAINER" 2>/dev/null || true
    echo "[smoke] docker logs (last 30):"
    docker logs "$CONTAINER" 2>&1 | tail -30 || true
    echo "[smoke] /tmp contents:"
    docker exec "$CONTAINER" ls -la /tmp 2>/dev/null || true
    if docker exec "$CONTAINER" test -f "$LOG_FILE" 2>/dev/null; then
        LOG_SIZE=$(docker exec "$CONTAINER" stat -c%s "$LOG_FILE" 2>/dev/null || echo "?")
        echo "[smoke] app.log size: ${LOG_SIZE} bytes"
        echo "[smoke] app.log (last 200):"
        docker exec "$CONTAINER" tail -200 "$LOG_FILE" 2>/dev/null || echo "(could not read log)"
    else
        echo "[smoke] ${LOG_FILE} does not exist inside the container"
    fi
}

# Phase 1: wait for the log file to appear.
ELAPSED=0
while [[ "$ELAPSED" -lt "$TIMEOUT" ]]; do
    if ! container_running; then
        echo "[smoke] FAIL: Container ${CONTAINER} is not running"
        dump_diagnostics
        exit 1
    fi

    if docker exec "$CONTAINER" test -f "$LOG_FILE" 2>/dev/null; then
        echo "[smoke] Log file found after ${ELAPSED}s"
        break
    fi

    sleep "$POLL_INTERVAL"
    ELAPSED=$((ELAPSED + POLL_INTERVAL))
done

if [[ "$ELAPSED" -ge "$TIMEOUT" ]]; then
    echo "[smoke] FAIL: Log file ${LOG_FILE} not found after ${TIMEOUT}s"
    dump_diagnostics
    exit 1
fi

# Phase 2: poll until the log is non-trivial and free of hard-failure
# signatures. The app passing this means Electron started, rendered, and
# at least logged some GPU/GL/DevTools lines on the way up.
while [[ "$ELAPSED" -lt "$TIMEOUT" ]]; do
    if ! container_running; then
        echo "[smoke] FAIL: Container ${CONTAINER} stopped unexpectedly"
        dump_diagnostics
        exit 1
    fi

    # Hard-failure signatures — fail fast if any appear; no point waiting.
    if docker exec "$CONTAINER" grep -Eq "$FAIL_PATTERNS" "$LOG_FILE" 2>/dev/null; then
        echo "[smoke] FAIL: Hard-failure signature in ${LOG_FILE}"
        dump_diagnostics
        exit 1
    fi

    LOG_SIZE=$(docker exec "$CONTAINER" stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)
    if [[ "$LOG_SIZE" -ge "$MIN_LOG_BYTES" ]]; then
        echo "[smoke] PASS: ${LOG_FILE} reached ${LOG_SIZE} bytes after ${ELAPSED}s (app launched)"
        exit 0
    fi

    sleep "$POLL_INTERVAL"
    ELAPSED=$((ELAPSED + POLL_INTERVAL))
done

echo "[smoke] FAIL: ${LOG_FILE} stayed below ${MIN_LOG_BYTES} bytes for ${TIMEOUT}s"
dump_diagnostics
exit 1
