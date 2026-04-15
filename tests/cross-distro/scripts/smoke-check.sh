#!/bin/bash
# Smoke check for cross-distro testing containers.
#
# Usage: smoke-check.sh <container-name> [timeout-seconds]
#
# Passes when the app produced real output (log file > MIN_LOG_BYTES) with
# no hard-failure signature, meaning the Electron main process actually
# started. Does NOT assert a navigation URL — the CI container is
# unauthenticated and the main process does not log URLs to stdout, so
# URL-based assertions used to time out even on successful launches.
set -e

CONTAINER="${1:?Usage: smoke-check.sh <container-name> [timeout-seconds]}"
TIMEOUT="${2:-120}"
POLL_INTERVAL=5
LOG_FILE="/tmp/app.log"

# Electron on startup typically emits ~100B of DevTools banner + several
# hundred bytes of GPU/GL warnings and app-level [STARTUP]/[IPC Security]
# lines. 500 bytes comfortably clears a crash-with-single-line-error but
# stays below a minimal successful boot.
MIN_LOG_BYTES=500

# Regexes for log signatures that mean we should stop waiting and fail.
#   - exec format error / cannot execute binary file: kernel refused the
#     file (wrong arch, not an ELF, etc.).
#   - Trace/breakpoint trapped: SIGTRAP from a Chromium crash.
#   - not found.*GLIBC_: missing libc version, only ever emitted on
#     real dynamic-linker failure (benign contexts say "GLIBC_2.x" without
#     "not found").
FAIL_PATTERNS='exec format error|cannot execute binary file|Trace/breakpoint trapped|not found.*GLIBC_'

echo "[smoke] Checking container: ${CONTAINER} (timeout: ${TIMEOUT}s)"

container_running() {
    docker inspect --format='{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true
}

# Single-round-trip check: returns "<status> <size>" where status is
# "fail" if FAIL_PATTERNS matched, "ok" otherwise, and size is the
# current byte size of LOG_FILE (0 if unreadable).
log_status() {
    docker exec \
        -e PATTERNS="$FAIL_PATTERNS" \
        -e LOG="$LOG_FILE" \
        "$CONTAINER" sh -c '
            SIZE=$(stat -c%s "$LOG" 2>/dev/null || echo 0)
            if grep -Eq "$PATTERNS" "$LOG" 2>/dev/null; then
                echo "fail $SIZE"
            else
                echo "ok $SIZE"
            fi
        ' 2>/dev/null
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

# Phase 1 — log file appears.
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

# Phase 2 — log grows past threshold with no crash signature.
while [[ "$ELAPSED" -lt "$TIMEOUT" ]]; do
    if ! container_running; then
        echo "[smoke] FAIL: Container ${CONTAINER} stopped unexpectedly"
        dump_diagnostics
        exit 1
    fi

    STATUS_AND_SIZE=$(log_status || echo "ok 0")
    STATUS="${STATUS_AND_SIZE%% *}"
    LOG_SIZE="${STATUS_AND_SIZE##* }"

    if [[ "$STATUS" == "fail" ]]; then
        echo "[smoke] FAIL: Hard-failure signature in ${LOG_FILE}"
        dump_diagnostics
        exit 1
    fi

    if [[ "$LOG_SIZE" =~ ^[0-9]+$ ]] && [[ "$LOG_SIZE" -ge "$MIN_LOG_BYTES" ]]; then
        echo "[smoke] PASS: ${LOG_FILE} reached ${LOG_SIZE} bytes after ${ELAPSED}s (app launched)"
        exit 0
    fi

    sleep "$POLL_INTERVAL"
    ELAPSED=$((ELAPSED + POLL_INTERVAL))
done

echo "[smoke] FAIL: ${LOG_FILE} stayed below ${MIN_LOG_BYTES} bytes for ${TIMEOUT}s"
dump_diagnostics
exit 1
