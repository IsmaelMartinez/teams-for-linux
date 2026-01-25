# AppImage Update Information Investigation

This document summarizes the investigation into adding update information to Teams for Linux AppImages, as requested in [Issue #2065](https://github.com/IsmaelMartinez/teams-for-linux/issues/2065).

**Status**: Implemented in `.github/workflows/build.yml`

## Background

The feature request proposes embedding update metadata into AppImage releases using `.zsync` files. This would enable third-party update managers like [Gear Lever](https://github.com/mijorus/gearlever) to automatically detect and manage application updates.

## Current State

Teams for Linux uses **electron-builder** to create AppImages with the following configuration:

- Build configuration is defined in `package.json` under the `build` section
- AppImages are built via `npm run dist:linux:appimage` or architecture-specific commands
- GitHub Actions workflow publishes AppImages to GitHub releases
- An existing `afterPack` hook exists at `scripts/afterpack.js`

## The Problem

**electron-builder uses its own proprietary update mechanism** ([electron-updater](https://www.electron.build/auto-update.html)) instead of the standard [AppImage update information specification](https://github.com/AppImage/AppImageSpec/blob/master/draft.md#update-information).

This means:
- Third-party AppImage update tools (Gear Lever, AppImageUpdate, etc.) cannot detect available updates
- Users must manually check GitHub releases for new versions
- The AppImages lack the embedded `.upd_info` ELF section that standard tools expect

## AppImage Update Information Specification

The specification defines several update info formats:

### 1. zsync (Generic HTTP Server)

```text
zsync|https://server.domain/path/Application-latest-x86_64.AppImage.zsync
```

### 2. GitHub Releases (Recommended for this project)

```text
gh-releases-zsync|IsmaelMartinez|teams-for-linux|latest|teams-for-linux-*-x86_64.AppImage.zsync
```

Format: `gh-releases-zsync|<username>|<repo>|<release>|<zsync-filename-pattern>`

Where `<release>` can be:
- `latest` - Latest stable release (excludes pre-releases)
- `latest-pre` - Only pre-releases
- `latest-all` - Either releases or pre-releases

## Proposed Solution

### Recommended Approach: Post-process with appimagetool

Since electron-builder doesn't natively support embedding AppImage update information, the solution is to post-process the AppImage after building.

#### Implementation Steps

1. **Build the AppImage** with electron-builder (as currently done)

2. **Install appimagetool** in the CI workflow:
   ```bash
   wget -q https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage
   chmod +x appimagetool-x86_64.AppImage
   ```

3. **Extract the AppImage**:
   ```bash
   ./teams-for-linux-*.AppImage --appimage-extract
   ```

4. **Repack with update info**:
   ```bash
   ARCH=x86_64 ./appimagetool-x86_64.AppImage \
     -u "gh-releases-zsync|IsmaelMartinez|teams-for-linux|latest|teams-for-linux-*-x86_64.AppImage.zsync" \
     squashfs-root \
     teams-for-linux-x86_64.AppImage
   ```

5. **Upload both files** to GitHub releases:
   - `teams-for-linux-*-x86_64.AppImage`
   - `teams-for-linux-*-x86_64.AppImage.zsync` (generated automatically)

### Architecture Considerations

The process needs to be repeated for each architecture:
- `x86_64` (amd64)
- `aarch64` (arm64)
- `armhf` (armv7l)

### Workflow Changes Required

Modify `.github/workflows/build.yml` to add post-processing steps for Linux builds:

```yaml
- name: Add AppImage update info
  if: contains(github.ref, 'main')
  run: |
    # Download appimagetool
    wget -q https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage
    chmod +x appimagetool-x86_64.AppImage

    # Process each AppImage
    for appimage in dist/*.AppImage; do
      # Extract
      "$appimage" --appimage-extract

      # Determine architecture from filename
      if [[ "$appimage" == *"x86_64"* ]]; then
        ARCH="x86_64"
      elif [[ "$appimage" == *"arm64"* ]] || [[ "$appimage" == *"aarch64"* ]]; then
        ARCH="aarch64"
      elif [[ "$appimage" == *"armv7l"* ]]; then
        ARCH="armhf"
      fi

      # Repack with update info
      ARCH=$ARCH ./appimagetool-x86_64.AppImage \
        -u "gh-releases-zsync|IsmaelMartinez|teams-for-linux|latest|teams-for-linux-*-$ARCH.AppImage.zsync" \
        squashfs-root \
        "$appimage"

      # Cleanup
      rm -rf squashfs-root
    done
```

## Alternative Approaches Considered

### 1. electron-builder Configuration

electron-builder can generate `.zsync` files via publish configuration, but:
- It does NOT embed update info in the AppImage's ELF section
- Third-party tools still cannot detect updates
- Only works with electron-updater, not standard AppImage tools

### 2. afterAllArtifactBuild Hook

Could implement post-processing in a custom electron-builder hook:
- More integrated with the build process
- Requires appimagetool to be available during build
- May complicate local development builds

### 3. Separate Post-Release Workflow

Create a separate workflow triggered after release:
- Cleaner separation of concerns
- Adds complexity with multiple workflows
- May have timing issues with release publication

## Impact Assessment

### Benefits
- Users can use Gear Lever and other AppImage managers to update the app
- Enables delta updates (only download changed parts)
- Better integration with Linux desktop environments
- Consolidates update management for users with multiple AppImages

### Considerations
- Increases build complexity slightly
- Adds ~2-3 minutes to CI build time
- Requires uploading additional `.zsync` files to releases
- Must maintain both electron-updater (for in-app updates) and AppImage update info (for external tools)

## Recommendation

Implement the post-processing approach in the GitHub Actions workflow. This provides:
- Minimal changes to the existing build process
- Support for all three architectures
- Automatic `.zsync` file generation
- Full compatibility with third-party update managers

The in-app update mechanism via electron-updater should be retained for users who prefer that approach.

## References

- [AppImage Update Information Specification](https://github.com/AppImage/AppImageSpec/blob/master/draft.md#update-information)
- [Making AppImages Updateable - AppImage Documentation](https://docs.appimage.org/packaging-guide/optional/updates.html)
- [Gear Lever Project](https://github.com/mijorus/gearlever)
- [electron-builder Auto Update Documentation](https://www.electron.build/auto-update.html)
- [electron-builder Issue #2311 - AppImageUpdate Integration](https://github.com/electron-userland/electron-builder/issues/2311)
