#!/bin/bash
mkdir /opt/outlook
cp -f dist/outlook-for-linux\ 0.1.17.AppImage /opt/outlook/outlook.appimage
ln -fs /opt/outlook/outlook.appimage /usr/local/bin/outlook
