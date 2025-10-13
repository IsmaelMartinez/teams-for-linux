# useSystemPicker Investigation for Electron 38

**Status:** Not Viable for Linux Wayland
**Date:** October 2025
**Decision:** Do not implement - Linux Wayland/PipeWire support is non-existent

## Executive Summary

Electron 38 introduced `useSystemPicker: true` as an option for `setDisplayMediaRequestHandler`, allowing apps to defer to the OS native screen picker instead of custom dialogs. **However, this feature is currently not viable for Teams for Linux** due to lack of support on Linux Wayland/PipeWire, which is a primary target platform.

## What is useSystemPicker?

Electron allows handling `navigator.mediaDevices.getDisplayMedia()` via `session.setDisplayMediaRequestHandler`. With `useSystemPicker: true`, Electron defers to the OS/browser's native picker instead of custom dialogs—useful to unlock OS features like loopback audio on some platforms.

**Reference:** [Electron desktopCapturer API](https://www.electronjs.org/docs/latest/api/desktop-capturer)

## Platform Compatibility Analysis

### macOS (Sonoma+)
**Status:** ⚠️ Good, with caveats

- Works, but has known issues:
  - Toggling `useSystemPicker` on/off/on can hang `getDisplayMedia()` calls
  - Issues with `applyConstraints()` and audio track return not aligned with Chrome
  - Requires tear down and recreation of capture session to avoid toggle-hang bug
- Apple's Screen Sharing Picker UI exists but Electron doesn't expose first-class API yet

**Reference:** [GitHub Issue #45306](https://github.com/electron/electron/issues/45306) - useSystemPicker toggle hang
**Reference:** [GitHub Issue #38722](https://github.com/electron/electron/issues/38722) - macOS Sonoma picker integration

### Windows 10/11
**Status:** ✅ Good

- Native picker flow via Chromium is solid
- Aligns closely with Chrome's behavior
- Supports options like `surfaceSwitching`, `selfBrowserSurface`, `systemAudio`
- Requires validation of loopback audio expectations per device

**Reference:** [Chrome Screen Sharing Controls](https://developer.chrome.com/docs/web-platform/screen-sharing-controls/)

### Linux (Wayland + PipeWire)
**Status:** ❌ Not Ready - BLOCKER

**Critical Finding:**
`useSystemPicker: true` **does not actually use the system picker on Linux** with PipeWire/xdg-desktop-portal. The feature request exists but is not implemented. Apps are forced back through the custom handler path, which for portals often only yields one "source". This breaks the entire point of `useSystemPicker` on Linux.

**Electron 38.2.0 includes a fix** for using `XDG_SESSION_TYPE=wayland` correctly, but the system picker itself is still not supported.

**Reference:** [GitHub Issue #48223](https://github.com/electron/electron/issues/48223) - Support useSystemPicker on Linux (Wayland/Portals)
**Reference:** [Electron 38.2.0 Release](https://releases.electronjs.org/release/v38.2.0) - Wayland fixes

### Linux (X11)
**Status:** N/A

- No true "system picker" concept on X11
- Works through Electron handler path (`desktopCapturer`)
- Custom picker remains the standard approach

## Practical Compatibility Matrix

| Platform | `useSystemPicker` viability | Recommendation |
|----------|----------------------------|----------------|
| macOS (Sonoma+) | ⚠️ Good, with caveats | Test carefully; known bugs exist |
| Windows 10/11 | ✅ Good | Works like Chrome; validate audio |
| Linux (Wayland + PipeWire) | ❌ **Not ready** | **BLOCKER - Does not work** |
| Linux (X11) | N/A | Keep custom picker |

## Decision: Do Not Implement

**Rationale:**

1. **Primary target platform blocked:** Linux Wayland/PipeWire support is non-existent, and Teams for Linux primarily targets Linux users
2. **Complexity not justified:** Adding `useSystemPicker` would require:
   - Platform detection logic
   - Runtime guards for Wayland vs X11
   - Maintaining both code paths (custom + system picker)
   - Feature flag UI for user configuration
   - Testing matrix explosion across platforms
3. **Custom picker works everywhere:** Our current implementation based on `desktopCapturer` is reliable across all platforms
4. **macOS has known bugs:** Toggle-hang and `applyConstraints()` issues add risk
5. **Windows benefit is minimal:** While it works on Windows, the custom picker provides consistent UX

## Alternative Considered: Opt-in Feature Flag

**Approach:** Make `useSystemPicker` an opt-in feature flag with custom picker as fallback:

```javascript
// Pseudo-code
session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
  if (appPrefs.useSystemPicker && canUseSystemPicker(process.platform)) {
    callback({ useSystemPicker: true });
    return;
  }

  // Custom picker (works everywhere)
  const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
  const source = await showYourPickerUI(sources);
  if (!source) return callback(new Error('aborted'));
  callback({ video: source });
});

function canUseSystemPicker(platform) {
  if (platform === 'darwin' || platform === 'win32') return true;
  // Wayland support pending in Electron
  return false;
}
```

**Rejected because:**
- Adds significant complexity for limited benefit
- Linux Wayland (primary platform) cannot use it
- Inconsistent UX across platforms
- Testing burden increases dramatically
- Feature flag requires UI, persistence, and user education

## Monitoring Plan

**Track these upstream issues:**

1. [GitHub Issue #48223](https://github.com/electron/electron/issues/48223) - Linux Wayland/PipeWire support
2. [GitHub Issue #45306](https://github.com/electron/electron/issues/45306) - macOS toggle-hang bug
3. [GitHub Issue #38722](https://github.com/electron/electron/issues/38722) - macOS Sonoma picker API

**Revisit this decision when:**
- Linux Wayland/PipeWire support lands in Electron (no ETA)
- macOS toggle-hang bug is resolved
- Electron exposes proper API for macOS Screen Sharing Picker title-bar UI

**Estimated timeline:** 12+ months (no active development visible on Linux support)

## References

- [Electron 38.0.0 Release](https://releases.electronjs.org/release/v38.0.0)
- [Electron 38.2.0 Release](https://releases.electronjs.org/release/v38.2.0) - Wayland fixes
- [Electron desktopCapturer API](https://www.electronjs.org/docs/latest/api/desktop-capturer)
- [GitHub Issue #45306](https://github.com/electron/electron/issues/45306) - useSystemPicker toggle hang on macOS
- [GitHub Issue #38722](https://github.com/electron/electron/issues/38722) - macOS Sonoma Screen Sharing picker
- [GitHub Issue #48223](https://github.com/electron/electron/issues/48223) - Linux Wayland/Portals support
- [Chrome Screen Sharing Controls](https://developer.chrome.com/docs/web-platform/screen-sharing-controls/)

## Conclusion

`useSystemPicker` is **not viable for Teams for Linux** due to complete lack of Linux Wayland/PipeWire support, which is a primary target platform. The additional complexity and testing burden of supporting it on Windows/macOS only is not justified. The current custom picker implementation using `desktopCapturer` remains the correct approach.

**Recommendation:** Continue using the current custom stream selector implementation. Monitor upstream Electron development but do not allocate engineering resources to `useSystemPicker` until Linux Wayland support materializes.
