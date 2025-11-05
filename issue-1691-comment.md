# Comment for Issue #1691

## Investigation Complete: Unable to Implement Due to Electron-Builder/FPM Limitation

After thorough investigation, I'm unable to implement custom changelog inclusion in deb/rpm packages due to a fundamental limitation with how electron-builder's FPM integration handles file paths.

### What Was Attempted

1. ✅ **Successfully generated Debian-formatted changelog** from `appdata.xml`
   - Created `scripts/generateDebianChangelog.js` that parses release information
   - Generates properly formatted changelog in `/debian-changelog`
   - Integrated into build process via `scripts/afterpack.js`

2. ❌ **Failed to pass changelog to FPM**
   ```json
   "deb": {
     "fpm": ["--deb-upstream-changelog=debian-changelog"]
   }
   ```
   **Error**: `No such file or directory @ rb_sysopen - /workspace/debian-changelog`

   **Root cause**: FPM resolves file paths relative to its own working directory, not the project root. When electron-builder invokes FPM, it runs in an isolated context where relative paths cannot be resolved.

3. ❌ **Attempted lintianOverrides approach**
   ```json
   "deb": {
     "lintianOverrides": ["changelog-file-missing-in-native-package"]
   }
   ```
   **Error**: `Invalid configuration object. electron-builder has been initialized using a configuration object that does not match the API schema.`

   **Root cause**: `lintianOverrides` is not a valid electron-builder configuration option (it exists in `electron-installer-debian` but not in electron-builder).

4. ❌ **Tested with system FPM** (`USE_SYSTEM_FPM=true`)
   - Same file path resolution issue persists

### Why This Doesn't Work

- FPM's `--deb-upstream-changelog` and `--rpm-changelog` flags expect file paths
- These paths are resolved in FPM's working directory context, not the project root
- electron-builder doesn't expose enough control over FPM's working directory
- Using absolute paths would be environment-specific and break across different systems (local dev, CI/CD, Docker)

### Upstream Issues Found

Related issues in the FPM project:
- [jordansissel/fpm#1575](https://github.com/jordansissel/fpm/issues/1575) - Changelog path confusion between `--deb-changelog` and `--deb-upstream-changelog`
- [electron-userland/electron-builder#400](https://github.com/electron-userland/electron-builder/issues/400) - Differences between system FPM and bundled FPM in changelog handling

**No existing issue found in electron-builder** specifically about `--deb-upstream-changelog` file path resolution, so this may warrant reporting upstream.

### Current Status

**This issue is being closed as "won't fix"** due to technical limitations in the build toolchain.

### Where Users Can Find Changelog Information

While deb/rpm packages contain only a generic FPM changelog, detailed release information is available through:

1. **GitHub Releases**: https://github.com/IsmaelMartinez/teams-for-linux/releases
2. **appdata.xml**: Shipped with the package, used by software centers (GNOME Software, KDE Discover)
3. **release-info.json**: Generated during build, used by electron-updater
4. **In-app updates**: The electron-updater system shows release notes when updates are available

### Documentation

I've created comprehensive documentation explaining this limitation:
- See `docs/packaging-changelog-limitation.md` in the repository
- Explains what was tried, why it failed, and alternatives

### For the Maintainers

If this becomes a high priority in the future, potential solutions include:

1. **Modify build scripts** to copy changelog into package structure before FPM runs
2. **Switch packaging tools** away from FPM (significant work)
3. **Post-process packages** to inject changelog (fragile, complex)

All would require significant effort and ongoing maintenance.

---

Thank you for reporting this issue. While we couldn't implement the requested feature, the investigation has been valuable in understanding the limitations of the current build toolchain.
