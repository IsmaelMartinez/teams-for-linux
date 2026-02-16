---
id: 011-appimage-update-info
---

# ADR 011: AppImage Update Information for Third-Party Update Managers

## Status

⛔ Superseded

**Superseded by**: [Electron-Updater Auto-Update Research](../research/electron-updater-auto-update-research.md)

The appimagetool post-processing approach implemented by this ADR does not produce working results within the electron-builder ecosystem. electron-builder uses its own `AppImageUpdater` class and `latest-linux.yml` metadata, ignoring the standard `.upd_info` ELF section that appimagetool embeds. The CI steps have been removed from `build.yml` and the project will pursue native `electron-updater` auto-updates instead.

## Context

Teams for Linux distributes AppImage builds for Linux users. A feature request ([Issue #2065](https://github.com/IsmaelMartinez/teams-for-linux/issues/2065)) proposed embedding update metadata into AppImage releases to enable third-party update managers like [Gear Lever](https://github.com/mijorus/gearlever) to automatically detect and manage updates.

**Key Constraints:**

1. **electron-builder Limitation**: electron-builder uses its own proprietary update mechanism ([electron-updater](https://www.electron.build/auto-update.html)) instead of the standard [AppImage update information specification](https://github.com/AppImage/AppImageSpec/blob/master/draft.md#update-information)
2. **Multiple Architectures**: Need to support x86_64, arm64, and armv7l builds
3. **CI Integration**: Solution must work in GitHub Actions environment (no FUSE available)
4. **Backward Compatibility**: Must not break existing electron-updater in-app update mechanism

**Investigation Date:** January 2026

### The Problem

Without embedded update information:
- Third-party AppImage update tools (Gear Lever, AppImageUpdate, etc.) cannot detect available updates
- Users must manually check GitHub releases for new versions
- The AppImages lack the embedded `.upd_info` ELF section that standard tools expect

## Decision

**Post-process AppImages with appimagetool to embed update information.** This approach adds update metadata without affecting the existing electron-updater mechanism.

### Implementation

Added two new steps to each Linux build job (`linux_x64`, `linux_arm64`, `linux_arm`) in `.github/workflows/build.yml`:

1. **Add AppImage update info** - Downloads appimagetool, extracts the AppImage, and repacks with embedded update info
2. **Upload to release** - Uses `gh release upload --clobber` to upload modified AppImage and generated `.zsync` file

### Update Information Format

Uses the GitHub releases zsync format:

```text
gh-releases-zsync|IsmaelMartinez|teams-for-linux|latest|teams-for-linux-*<arch>*.AppImage.zsync
```

| Architecture | ARCH env | Pattern |
|--------------|----------|---------|
| x86_64 | `x86_64` | `*x86_64*.AppImage.zsync` |
| arm64 | `aarch64` | `*arm64*.AppImage.zsync` |
| armv7l | `armhf` | `*armv7l*.AppImage.zsync` |

### CI Compatibility

Uses `--appimage-extract-and-run` flag with appimagetool to avoid FUSE requirement in GitHub Actions runners.

## Consequences

### Positive

- ✅ **Third-party update manager support** - Gear Lever, AppImageUpdate, and similar tools can now detect and manage updates
- ✅ **Delta updates** - `.zsync` files enable efficient delta updates (only download changed parts)
- ✅ **Better Linux integration** - Aligns with AppImage ecosystem standards
- ✅ **Dual update paths** - Users can choose between in-app updates (electron-updater) or external tools
- ✅ **No breaking changes** - Existing update mechanism unchanged

### Negative

- ⚠️ **Increased build time** - Adds ~2-3 minutes to each Linux build job
- ⚠️ **Additional release assets** - `.zsync` files added to GitHub releases
- ⚠️ **Maintenance overhead** - appimagetool dependency in CI workflow

### Neutral

- Both update mechanisms (electron-updater and AppImage update info) coexist independently
- Users updating via external tools may briefly see in-app "update available" notification until it re-checks

## Alternatives Considered

### Option 1: electron-builder Native Configuration

Configure electron-builder to generate `.zsync` files via publish settings.

**Why rejected:**
- electron-builder does NOT embed update info in the AppImage's ELF section
- Third-party tools still cannot detect updates
- Only works with electron-updater, not standard AppImage tools

### Option 2: afterAllArtifactBuild Hook

Implement post-processing in a custom electron-builder hook.

**Why rejected:**
- Requires appimagetool to be available during local builds
- Complicates local development workflow
- Less transparent than explicit CI steps

### Option 3: Separate Post-Release Workflow

Create a separate workflow triggered after release publication.

**Why rejected:**
- Adds complexity with multiple workflows
- Potential timing issues with release publication
- Harder to debug failures

## Related

- Issue: [#2065](https://github.com/IsmaelMartinez/teams-for-linux/issues/2065)
- Implementation: `.github/workflows/build.yml`

## References

- [AppImage Update Information Specification](https://github.com/AppImage/AppImageSpec/blob/master/draft.md#update-information)
- [Making AppImages Updateable - AppImage Documentation](https://docs.appimage.org/packaging-guide/optional/updates.html)
- [Gear Lever Project](https://github.com/mijorus/gearlever)
- [electron-builder Auto Update Documentation](https://www.electron.build/auto-update.html)
- [electron-builder Issue #2311 - AppImageUpdate Integration](https://github.com/electron-userland/electron-builder/issues/2311)
