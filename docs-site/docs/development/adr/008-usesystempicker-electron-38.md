---
id: 008-usesystempicker-electron-38
---

# ADR 008: useSystemPicker Feature for Electron 38

## Status

❌ Rejected

## Context

Electron 38 introduced `useSystemPicker: true` option for `session.setDisplayMediaRequestHandler()`, allowing apps to defer screen/window selection to the OS native picker instead of custom dialogs. This feature could provide better UX by leveraging OS-level capabilities like loopback audio support.

**Investigation Date:** October 2025
**Electron Version:** 38+

### Platform Support Analysis

**macOS (Sonoma+):** ⚠️ Good with caveats
- Works but has known toggle-hang bugs with `applyConstraints()`
- [Electron Issue #45306](https://github.com/electron/electron/issues/45306)

**Windows 10/11:** ✅ Good
- Native picker via Chromium works reliably
- Aligns with Chrome behavior

**Linux (Wayland + PipeWire):** ❌ **Not Ready - BLOCKER**
- `useSystemPicker` does not actually invoke system picker on Linux
- Apps forced back through custom handler path
- Feature request exists but not implemented: [Electron Issue #48223](https://github.com/electron/electron/issues/48223)

**Linux (X11):** N/A
- No true system picker concept; custom picker remains standard

## Decision

**Reject `useSystemPicker` implementation.** Continue using current custom picker based on `desktopCapturer` API.

### Rationale

1. **Primary platform blocked:** Linux Wayland/PipeWire (primary target) has zero support
2. **Complexity not justified:**
   - Would require platform detection logic and runtime guards
   - Need to maintain both code paths (custom + system picker)
   - Feature flag UI and persistent configuration needed
   - Testing matrix explosion across platforms
3. **Current approach works everywhere:** `desktopCapturer`-based custom picker is reliable across all platforms
4. **macOS has known bugs:** Toggle-hang issues add implementation risk
5. **Windows benefit is minimal:** Consistent custom UX is preferred over platform inconsistency

## Consequences

### Positive

- ✅ Maintains single, unified code path across all platforms
- ✅ Reduces testing burden and complexity
- ✅ No new feature flags or configuration needed
- ✅ Current solution proven stable in production

### Negative

- ⚠️ Loses potential loopback audio benefits on Windows/macOS
- ⚠️ Defers to future when Linux support materializes

### Neutral

- Implementation remains in `app/screenSharing/index.js`
- No code changes required beyond documentation
- Monitor upstream Electron development

## Alternatives Considered

### Option 1: Implement with Opt-in Feature Flag

```javascript
// Pseudo-code
session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
  if (appPrefs.useSystemPicker && canUseSystemPicker(process.platform)) {
    callback({ useSystemPicker: true });
    return;
  }
  // Custom picker fallback
});

function canUseSystemPicker(platform) {
  return platform === 'darwin' || platform === 'win32';
}
```

**Why rejected:**
- Adds significant complexity for limited benefit
- Linux Wayland (primary platform) cannot use it
- Inconsistent UX across platforms
- Testing burden increases dramatically
- Requires UI, persistence, and user education

### Option 2: Platform-Specific Implementation

- Only enable on Windows/macOS with custom picker fallback
- Add detection logic for Wayland vs X11 on Linux

**Why rejected:**
- Same concerns as Option 1
- X11 lenience is not guaranteed to continue

## Monitoring Plan

**Track upstream issues:**

1. [Electron Issue #48223](https://github.com/electron/electron/issues/48223) - Linux Wayland/PipeWire support
2. [Electron Issue #45306](https://github.com/electron/electron/issues/45306) - macOS toggle-hang bug
3. [Electron Issue #38722](https://github.com/electron/electron/issues/38722) - macOS Sonoma picker API

**Revisit when:**
- Linux Wayland/PipeWire support lands in Electron (no ETA; no active development visible)
- macOS toggle-hang bug is resolved
- Electron exposes proper API for macOS Screen Sharing Picker integration

**Estimated timeline:** 12+ months

## Related

- [Research: usesystempicker-investigation.md](../research/usesystempicker-investigation.md)
- [Electron DesktopCapturer API](https://www.electronjs.org/docs/latest/api/desktop-capturer)
- [ADR 001: DesktopCapturer Source ID Format](001-desktopcapturer-source-id-format.md)

## References

- [Electron 38.0.0 Release](https://releases.electronjs.org/release/v38.0.0)
- [Electron 38.2.0 Release](https://releases.electronjs.org/release/v38.2.0) - Wayland fixes
- [Electron desktopCapturer API](https://www.electronjs.org/docs/latest/api/desktop-capturer)
- [Chrome Screen Sharing Controls](https://developer.chrome.com/docs/web-platform/screen-sharing-controls/)
- [xdg-desktop-portal ScreenCast API](https://flatpak.github.io/xdg-desktop-portal/#gdbus-org.freedesktop.portal.ScreenCast)
