#!/bin/bash

cd /src;

# Install packages
yarn || exit 1;

# Build snap
yarn run dist:linux:snap || exit 1;

echo "Final built snap is found in:"
find dist | grep "snap$"
