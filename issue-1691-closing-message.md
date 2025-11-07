# Closing Message for Issue #1691

## Unable to Include Custom Changelog in deb/rpm Packages - Closing as Blocked

After thorough investigation, we're unable to implement this feature due to a limitation in how electron-builder passes file paths to FPM (the packaging tool it uses).

### The Problem

When we attempt to include our generated changelog using FPM's flags:

```json
"deb": {
  "fpm": ["--deb-upstream-changelog=debian-changelog"]
}
```

FPM cannot resolve the file path, resulting in:
```
Error: No such file or directory @ rb_sysopen - /workspace/debian-changelog
```

**Root cause**: FPM resolves paths relative to its own working directory, not the project root. electron-builder doesn't provide a way to:
- Resolve file paths before passing them to FPM
- Control FPM's working directory
- Map files into FPM's execution context

This affects both `--deb-upstream-changelog` and `--rpm-changelog` flags.

### What We've Tried

✅ Generated a properly formatted Debian changelog from `appdata.xml`
❌ Cannot pass it to FPM due to path resolution issues
❌ `lintianOverrides` option doesn't exist in electron-builder
❌ System FPM (`USE_SYSTEM_FPM=true`) has the same limitation

Full investigation documented in: `docs/packaging-changelog-limitation.md`

### Current Status

**Closing as blocked** pending upstream support from electron-builder for FPM file path resolution.

### Where Users Can Find Changelog Information

While the `.deb`/`.rpm` packages contain only a generic FPM-generated changelog, detailed release information is available:

- **GitHub Releases**: https://github.com/IsmaelMartinez/teams-for-linux/releases
- **appdata.xml**: Included in packages, used by software centers (GNOME Software, KDE Discover)
- **release-info.json**: Used by the app's auto-updater
- **In-app updates**: Shows release notes when updates are available

### Next Steps

We're reporting this limitation to electron-builder. If they add support for file path resolution in FPM flags, we can revisit this issue.

**Reference documentation**: See `docs/packaging-changelog-limitation.md` for the complete technical investigation.
