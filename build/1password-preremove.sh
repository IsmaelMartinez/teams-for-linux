#!/bin/bash
# Remove teams-for-linux from the 1Password custom_allowed_browsers list on uninstall.

ALLOWED_BROWSERS_FILE="/etc/1password/custom_allowed_browsers"

if [ -f "$ALLOWED_BROWSERS_FILE" ]; then
  sed -i '/^teams-for-linux$/d' "$ALLOWED_BROWSERS_FILE"
fi
