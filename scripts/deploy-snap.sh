#!/bin/bash

echo "deploying to snap"

snapcraft push --release=edge ../dist/teams-for-linux_*.snap