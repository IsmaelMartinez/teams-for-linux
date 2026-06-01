#!/bin/bash
# Register teams-for-linux as a trusted browser with 1Password for Linux.
# This enables the 1Password browser extension (Ctrl+Shift+X) to fill
# credentials in the Teams login page when 1Password is installed.
# See: https://support.1password.com/cs/connect-1password-x-linux/

ALLOWED_BROWSERS_FILE="/etc/1password/custom_allowed_browsers"

if [ -f "$ALLOWED_BROWSERS_FILE" ]; then
  if ! grep -qx "teams-for-linux" "$ALLOWED_BROWSERS_FILE"; then
    # Ensure there is a trailing newline before appending so we don't
    # accidentally concatenate with the last line of the file.
    [ -s "$ALLOWED_BROWSERS_FILE" ] && \
      tail -c1 "$ALLOWED_BROWSERS_FILE" | grep -qv $'\n' && \
      echo "" >> "$ALLOWED_BROWSERS_FILE"
    echo "teams-for-linux" >> "$ALLOWED_BROWSERS_FILE"
  fi
fi
