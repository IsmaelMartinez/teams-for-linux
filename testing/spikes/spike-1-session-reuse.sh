#!/bin/bash
# Spike 1: Does session reuse work after app restart?
#
# This spike validates the most critical assumption: if you log in once and
# save the session to a directory, relaunching the app with that same directory
# should skip the login flow.
#
# Steps:
#   1. Run this script — it launches the app with a custom session dir
#   2. Log in to Teams manually in the app window
#   3. Close the app (Cmd+Q or close the window)
#   4. Run this script again — does it come back authenticated?
#
# Expected result (success): The app loads Teams directly, no login page.
# Expected result (failure): The app redirects to login.microsoftonline.com.
#
# Usage:
#   ./testing/spikes/spike-1-session-reuse.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SESSION_DIR="${PROJECT_ROOT}/testing/spikes/.test-session"

mkdir -p "$SESSION_DIR"

echo "============================================="
echo "  Spike 1: Session Reuse"
echo "============================================="
echo ""

if [ -f "$SESSION_DIR/Cookies" ] || [ -d "$SESSION_DIR/Partitions" ]; then
    echo "  Session directory has existing data."
    echo "  If the app loads without asking you to log in, session reuse WORKS."
else
    echo "  Session directory is empty (first run)."
    echo "  Log in to Teams, then close the app and run this script again."
fi

echo ""
echo "  Session dir: $SESSION_DIR"
echo ""
echo "  Launching app..."
echo ""

cd "$PROJECT_ROOT"
E2E_USER_DATA_DIR="$SESSION_DIR" npm start
