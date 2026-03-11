#!/bin/sh
# Sway status bar script. Inline status_command in sway config has quoting
# issues with pipes and command substitution, so we use a separate script.
. /etc/os-release
echo "Cross-Distro Test | $PRETTY_NAME | $DISPLAY_SERVER"
