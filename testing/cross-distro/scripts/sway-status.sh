#!/bin/sh
# Sway status bar script. Inline status_command in sway config has quoting
# issues with pipes and command substitution, so we use a separate script.
distro=$(grep PRETTY_NAME /etc/os-release | cut -d= -f2 | tr -d '"')
echo "Cross-Distro Test | $distro | $DISPLAY_SERVER"
