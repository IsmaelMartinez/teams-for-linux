#!/bin/bash
# 1Password browser integration setup for teams-for-linux
#
# Use this script when installing via AppImage or tar.gz (formats that have
# no package manager post-install hook). For deb and rpm packages this runs
# automatically.
#
# Usage (requires sudo):
#   sudo bash 1password-setup.sh            # register
#   sudo bash 1password-setup.sh --remove   # unregister
#
# What it does:
#   Adds (or removes) 'teams-for-linux' to 1Password's custom browser
#   allowlist at /etc/1password/custom_allowed_browsers. This enables
#   1Password's global autofill shortcut (default: Ctrl+Shift+X) to fill
#   credentials on the Microsoft login page when your Teams session expires.
#
# Reference: https://support.1password.com/cs/connect-1password-x-linux/

set -euo pipefail

ALLOWED_BROWSERS_FILE="/etc/1password/custom_allowed_browsers"
ENTRY="teams-for-linux"

if [[ "${1:-}" == "--remove" ]]; then
  if [ ! -f "$ALLOWED_BROWSERS_FILE" ]; then
    echo "1Password allowlist not found — nothing to remove."
    exit 0
  fi
  sed -i "/^${ENTRY}\$/d" "$ALLOWED_BROWSERS_FILE"
  echo "Removed '${ENTRY}' from ${ALLOWED_BROWSERS_FILE}"
  exit 0
fi

# --- register ---
if [ ! -f "$ALLOWED_BROWSERS_FILE" ]; then
  echo "1Password does not appear to be installed (${ALLOWED_BROWSERS_FILE} not found)."
  echo "Install 1Password for Linux first, then re-run this script."
  exit 1
fi

if grep -qx "$ENTRY" "$ALLOWED_BROWSERS_FILE"; then
  echo "'${ENTRY}' is already registered."
  exit 0
fi

# Ensure a trailing newline before appending.
if [ -s "$ALLOWED_BROWSERS_FILE" ] && \
   ! tail -c1 "$ALLOWED_BROWSERS_FILE" | grep -qv $'\n'; then
  :  # file already ends with newline
else
  echo "" >> "$ALLOWED_BROWSERS_FILE"
fi

echo "$ENTRY" >> "$ALLOWED_BROWSERS_FILE"
echo "Registered '${ENTRY}' in ${ALLOWED_BROWSERS_FILE}"
echo "Restart 1Password for the change to take effect."
