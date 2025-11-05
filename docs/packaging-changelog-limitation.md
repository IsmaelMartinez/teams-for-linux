# Packaging Changelog Limitation

## Issue #1691: Debian Package Changelog

### Problem
The Debian (`.deb`) and RPM (`.rpm`) packages created by electron-builder contain a generic changelog that only says "Package created with FPM" instead of actual release notes.

### Investigation Summary

We attempted to include the generated changelog (from `appdata.xml`) in the packages using FPM's `--deb-upstream-changelog` and `--rpm-changelog` flags, but this approach is not feasible due to technical limitations:

#### What We Tried

1. **Direct FPM flags with relative path**
   ```json
   "deb": {
     "fpm": ["--deb-upstream-changelog=debian-changelog"]
   }
   ```
   - Result: ❌ FPM cannot resolve relative paths from its working directory
   - Error: `No such file or directory @ rb_sysopen - /workspace/debian-changelog`

2. **Using lintianOverrides**
   ```json
   "deb": {
     "lintianOverrides": ["changelog-file-missing-in-native-package"]
   }
   ```
   - Result: ❌ `lintianOverrides` is not a valid electron-builder option
   - Note: This option exists in `electron-installer-debian` but not in electron-builder

3. **Using system FPM**
   - Installed system FPM with `USE_SYSTEM_FPM=true`
   - Result: ❌ Same file path resolution issue persists

#### Root Cause

- FPM resolves file paths relative to its own working directory
- electron-builder runs FPM in an isolated context where the `debian-changelog` file is not accessible
- Absolute paths would be environment-specific and break across different build systems (local, CI/CD, Docker)

### Current Behavior

- FPM automatically creates a default changelog file to satisfy Debian lintian requirements
- The default changelog contains minimal information: "Package created with FPM"
- This is technically valid but not very useful for end users

### Where Users Can Find Changelog Information

While the `.deb`/`.rpm` packages don't include detailed changelogs, release information is available through multiple channels:

1. **GitHub Releases**: https://github.com/IsmaelMartinez/teams-for-linux/releases
2. **release-info.json**: Generated during build, used by electron-updater
3. **appdata.xml**: Contains full release history, used by software centers (GNOME Software, KDE Discover)
4. **In-app updates**: The electron-updater system shows release notes

### Is This a Problem?

For **application packages** (as opposed to library packages), having a minimal changelog in the package itself is acceptable because:

- Users primarily discover updates through app stores and GitHub
- The electron-updater system provides release notes within the app
- Software centers read from `appdata.xml` which contains full release history

This is a common pattern among Electron applications using electron-builder.

### Potential Future Solutions

If this becomes a high priority, possible approaches include:

1. **Custom build script**: Modify `scripts/afterpack.js` to copy `debian-changelog` to a location within the package structure that FPM automatically includes

2. **Switch packaging tools**: Use a different packaging approach that doesn't rely on FPM (e.g., native dpkg/rpmbuild)

3. **Post-processing**: Extract the package, add the changelog, and repackage (complex and fragile)

All of these would require significant build system changes and ongoing maintenance.

### Conclusion

Given the technical limitations and the availability of release information through other channels, we're documenting this as a known limitation rather than implementing a complex workaround.

Users who need detailed changelog information can access it through GitHub releases or the appdata.xml file that ships with the package.

---

**Related Issue**: #1691
**Investigation Date**: November 2025
**electron-builder Version**: 26.1.0
