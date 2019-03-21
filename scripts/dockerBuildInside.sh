#!/bin/bash

# This script is intended to be run inside the build container,
# do not run standalone.

# run dockerBuildSnap.sh in the repo root instead.

cd /src;

# Install packages
yarn || exit 1;

# Build snap
yarn run dist:linux:snap || exit 1;

echo "";
echo "";
echo "Final built snap is found in:"
find dist | grep "snap$"
