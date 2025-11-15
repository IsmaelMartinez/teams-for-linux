#!/bin/bash

##
# Manual Changelog Entry Helper
#
# Usage:
#   ./scripts/add-changelog.sh "Your changelog entry here"
#   npm run changelog:add "Your changelog entry here"
##

if [ -z "$1" ]; then
  echo "Usage: $0 \"Your changelog entry\""
  echo ""
  echo "Example:"
  echo "  $0 \"Fix notification behavior in system tray\""
  echo ""
  exit 1
fi

# Create .changelog directory if it doesn't exist
mkdir -p .changelog

# Generate filename with timestamp
TIMESTAMP=$(date +%s)
FILENAME=".changelog/manual-${TIMESTAMP}.txt"

# Save entry
echo "$1" > "$FILENAME"

echo "✅ Changelog entry created: $FILENAME"
echo ""
echo "Content:"
echo "  $1"
echo ""
echo "Add to git:"
echo "  git add $FILENAME"
