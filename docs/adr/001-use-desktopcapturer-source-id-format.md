# ADR 001: Use desktopCapturer Source ID Format for Screen Sharing

## Status

Accepted

## Context

When implementing screen sharing preview windows in Teams for Linux, we need to identify which screen or window the user selected for sharing. There are two potential identifiers available:

1. **desktopCapturer source ID**: Format `screen:x:y` or `window:x:y` (e.g., `screen:602:0`)
   - Provided by Electron's `desktopCapturer.getSources()` API
   - Stable identifier for the selected screen/window
   - Required format for Wayland's xdg-desktop-portal

2. **MediaStream ID**: UUID format (e.g., `a1b2c3d4-5678-90ab-cdef-1234567890ab`)
   - Generated when the MediaStream is created from the source
   - Changes on each new stream instance
   - Not recognized by Wayland's preview window APIs

### The Problem

On Wayland, the preview window creation fails with "Invalid State" error when passed a MediaStream UUID because:

- Wayland's `xdg-desktop-portal` ScreenCast API expects the desktopCapturer source ID format
- The portal uses this ID to identify which screen/window to capture
- UUIDs are not valid portal source identifiers

On X11, the system is more permissive and accepts various formats, which masked this bug.

### Technical Background

**Wayland Portal Requirements:**
- [xdg-desktop-portal ScreenCast API](https://flatpak.github.io/xdg-desktop-portal/#gdbus-org.freedesktop.portal.ScreenCast) specifies string source identifiers
- [Electron Issue #33613](https://github.com/electron/electron/issues/33613) documents: "Wayland expects string ID, not UUID"
- [Chromium Bug #1343766](https://bugs.chromium.org/p/chromium/issues/detail?id=1343766) confirms Wayland requires specific format

**Electron API:**
- [DesktopCapturer API](https://www.electronjs.org/docs/latest/api/desktop-capturer) returns source objects with `id` property in format `screen:display_id:window_id`
- This `id` is the canonical identifier for desktop capture sources

## Decision

**We will use the desktopCapturer source ID format (`screen:x:y` or `window:x:y`) throughout the screen sharing pipeline, not the MediaStream UUID.**

### Implementation

1. **Source Selection** (`app/mainAppWindow/index.js`):
   - Store the desktopCapturer source object from `setupScreenSharing()`
   - Set `global.selectedScreenShareSource` with the source ID in correct format

2. **Stream Creation** (`app/screenSharing/injectedScreenSharing.js`):
   - Do NOT send `stream.id` (UUID) via IPC
   - Send `null` to preserve the source ID already stored in main process

3. **IPC Handler** (`app/index.js`):
   - Validate received source IDs match format `screen:x:y` or `window:x:y`
   - Reject UUID format with warning
   - Only update global state if format is valid

4. **Preview Window** (`app/screenSharing/previewWindow.html`):
   - Use the validated source ID from global state
   - Pass to `getUserMedia()` as `chromeMediaSourceId`

## Consequences

### Positive

- ✅ Screen sharing preview works on Wayland
- ✅ Consistent behavior across X11 and Wayland
- ✅ Uses canonical Electron API identifiers
- ✅ Future-proof against platform changes
- ✅ Validation prevents regression to UUID format

### Negative

- ⚠️ Requires coordination between main and renderer processes
- ⚠️ The renderer process (injectedScreenSharing.js) doesn't have access to the desktopCapturer source ID, only the MediaStream

### Alternatives Considered

**Alternative 1: Pass desktopCapturer source to renderer**
- ❌ Would require exposing more of Electron's APIs to renderer
- ❌ Security concerns with broader API access
- ❌ Violates separation of concerns

**Alternative 2: Platform detection (use UUID on X11, source ID on Wayland)**
- ❌ Adds complexity
- ❌ Inconsistent behavior across platforms
- ❌ X11 lenience is not guaranteed to continue

**Alternative 3: Store source ID in a different global variable**
- ❌ Adds state management complexity
- ❌ Risk of desynchronization
- ✅ Selected approach uses existing `global.selectedScreenShareSource`

## Notes

- Bug reported in [teams-for-linux Issue #1853](https://github.com/IsmaelMartinez/teams-for-linux/issues/1853)
- Fix implemented in v2.5.13
- The StreamSelector module (app/screenSharing/index.js:73-74) already expected this format
- Console logging with `[SCREEN_SHARE_DIAG]` prefix helps verify correct format

## References

- [Electron DesktopCapturer API](https://www.electronjs.org/docs/latest/api/desktop-capturer)
- [xdg-desktop-portal ScreenCast API](https://flatpak.github.io/xdg-desktop-portal/#gdbus-org.freedesktop.portal.ScreenCast)
- [Electron Issue #33613](https://github.com/electron/electron/issues/33613)
- [Chromium Bug #1343766](https://bugs.chromium.org/p/chromium/issues/detail?id=1343766)
- [teams-for-linux Issue #1853](https://github.com/IsmaelMartinez/teams-for-linux/issues/1853)
