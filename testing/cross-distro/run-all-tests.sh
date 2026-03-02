#!/bin/bash
# Run Playwright authenticated tests across all distro/display-server combinations.
# Requires a login session to exist (created via ./run.sh <distro> <ds> --login).
#
# Usage:
#   ./run-all-tests.sh              Run all 9 configurations
#   ./run-all-tests.sh --cleanup    Also remove session folder after all tests
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

DISTROS="ubuntu fedora debian"
DISPLAY_SERVERS="x11 wayland xwayland"
CLEANUP=false
readonly SEPARATOR="============================================="

if [[ "${1:-}" == "--cleanup" ]]; then
    CLEANUP=true
fi

# Check session exists
if [[ ! -d "./session" ]] || [[ ! -d "./session/Partitions" ]]; then
    echo "[!] No login session found in ./session/"
    echo "    Create one first with: ./run.sh ubuntu x11 --login"
    exit 1
fi

echo ""
echo "$SEPARATOR"
echo "  Running All Authenticated Tests"
echo "  Configurations: $(echo $DISTROS | wc -w | tr -d ' ') distros x $(echo $DISPLAY_SERVERS | wc -w | tr -d ' ') display servers"
echo "  Cleanup after:  ${CLEANUP}"
echo "$SEPARATOR"
echo ""

PASSED=0
FAILED=0
ERRORS=""
TOTAL=0

for distro in $DISTROS; do
    for ds in $DISPLAY_SERVERS; do
        TOTAL=$((TOTAL + 1))
        SERVICE="${distro}-${ds}"
        echo ""
        echo "$SEPARATOR"
        echo "  [$TOTAL/9] ${SERVICE}"
        echo "$SEPARATOR"

        if ./run.sh "$distro" "$ds" --test 2>&1; then
            PASSED=$((PASSED + 1))
            echo "[OK] ${SERVICE} passed"
        else
            FAILED=$((FAILED + 1))
            ERRORS="${ERRORS}  - ${SERVICE}\n"
            echo "[FAIL] ${SERVICE} failed"
        fi
    done
done

echo ""
echo "$SEPARATOR"
echo "  Results: ${PASSED} passed, ${FAILED} failed (out of ${TOTAL})"
echo "$SEPARATOR"

if [[ -n "$ERRORS" ]]; then
    echo ""
    echo "Failed configurations:"
    echo -e "$ERRORS"
fi

if [[ "$CLEANUP" == "true" ]]; then
    echo ""
    echo "[*] Cleaning up session folder..."
    rm -rf "./session"
    echo "[*] Session removed."
fi

echo ""
if [[ "$FAILED" -gt 0 ]]; then
    exit 1
fi
exit 0
