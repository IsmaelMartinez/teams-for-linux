# Wayland Optimizations Audit

:::warning Screen Sharing vs Camera Conflict
The `--use-fake-ui-for-media-stream` conflict between issues #2169 and #2217 is not a simple flag swap. Read the deep dive section before making any changes to Wayland flags.
:::

**Date:** 2026-02-23
**Updated:** 2026-02-24
**Current Version:** Electron 39.5.1 (Chromium 142)
**Upcoming Version:** Electron 40.4.0 (Chromium 144)
**Related Issues:** [#2221](https://github.com/IsmaelMartinez/teams-for-linux/issues/2221), [#2217](https://github.com/IsmaelMartinez/teams-for-linux/issues/2217), [#2169](https://github.com/IsmaelMartinez/teams-for-linux/issues/2169), [#2222](https://github.com/IsmaelMartinez/teams-for-linux/issues/2222), [#2204](https://github.com/IsmaelMartinez/teams-for-linux/issues/2204), [#2107](https://github.com/IsmaelMartinez/teams-for-linux/issues/2107)
**Related ADRs:** [ADR-001](../adr/001-desktopcapturer-source-id-format.md), [ADR-008](../adr/008-usesystempicker-electron-38.md)

---

## Context

This document covers two related investigations prompted by a cluster of open issues around Wayland media handling.

[Issue #2221](https://github.com/IsmaelMartinez/teams-for-linux/issues/2221) reports a crash when using camera or microphone during meetings on v2.7.7 (AUR -bin package, Wayland session). The reporter tested both native Wayland and XWayland modes with identical results. This crash is distinct from [Issue #2169](https://github.com/IsmaelMartinez/teams-for-linux/issues/2169) (camera broken due to GPU being disabled under XWayland), which was fixed in PR #2190.

[Issue #2217](https://github.com/IsmaelMartinez/teams-for-linux/issues/2217) reports screen sharing broken on XWayland since v2.7.7. The cause is the `!isX11Forced` guard added in PR #2190: without `--use-fake-ui-for-media-stream`, the screen picker opens but shows empty panes. [PR #2219](https://github.com/IsmaelMartinez/teams-for-linux/pull/2219) proposes re-enabling the flag for XWayland — but that directly reintroduces #2169.

The two issues contradict each other at the flag level. The deep dive below explains why and identifies the targeted fix.

---

## Wayland Workarounds Inventory

The project applies several Wayland-specific flags and workarounds. Here is an audit of each one.

### 1. `--ozone-platform=x11` (Force XWayland)

**Location:** `package.json` lines 98-100 (Linux) and 142-144 (Snap) via `executableArgs`

**What it does:** Forces the app to run through XWayland instead of native Wayland, even on Wayland sessions.

**Why it was added (v2.7.4):** Electron 38 changed the default ozone platform from `x11` to `auto`, causing the app to run as a native Wayland client. This triggered widespread regressions: blank/black windows ([#1604](https://github.com/IsmaelMartinez/teams-for-linux/issues/1604), [#1494](https://github.com/IsmaelMartinez/teams-for-linux/issues/1494)), window sizing issues ([#2094](https://github.com/IsmaelMartinez/teams-for-linux/issues/2094)), and GPU rendering failures.

**Still needed?** Yes. Native Wayland GPU acceleration remains broken upstream:

- NVIDIA + native Wayland: GPU acceleration does not work ([Chromium issue 350117524](https://issues.chromium.org/issues/350117524)), producing "Unsupported modifier, resource creation failed" errors.
- AMD + native Wayland: Fedora 42 users report broken GPU acceleration with only software rendering available.
- Kernel 6.12+ regression: Electron apps fail to start on Wayland entirely on some configurations ([NixOS/nixpkgs#382612](https://github.com/NixOS/nixpkgs/issues/382612)).
- VMs without GPU: Wayland windows don't appear at all ([electron/electron#48321](https://github.com/electron/electron/issues/48321)).
- Electron has zero dedicated Wayland tests ([electron/electron#48441](https://github.com/electron/electron/issues/48441)) — the baseline test spec initiative is still in early discussion.

**Recommendation:** Keep. Removing this prematurely would break the app for a large portion of users. Revisit when Chromium's Wayland GPU story stabilizes and Electron adds baseline Wayland test coverage.

**Trade-off:** Users with fractional scaling on Wayland get blurry text under XWayland ([#1787](https://github.com/IsmaelMartinez/teams-for-linux/issues/1787)). They can override to `--ozone-platform=wayland` manually, which is documented in `docs-site/docs/troubleshooting.md`.

---

### 2. GPU Auto-Disable on Native Wayland

**Location:** `app/startup/commandLine.js` lines 28-48

**What it does:** When running on Wayland (`XDG_SESSION_TYPE=wayland`):

- If user explicitly set `disableGpu` via CLI or config: respect that choice
- If X11 is forced (`--ozone-platform=x11`): keep GPU enabled (XWayland handles GPU correctly)
- If native Wayland (no X11 force): set `config.disableGpu = true` to avoid blank window / crash

**Why it was added:** Native Wayland rendering with GPU enabled caused blank windows and crashes. Disabling GPU was the workaround. Issue #2169 then revealed that GPU must stay enabled under XWayland for camera to work, leading to the current conditional logic.

**Still needed?** Partially. Since the default is now `--ozone-platform=x11`, the native Wayland GPU disable path only triggers when a user manually overrides to `--ozone-platform=wayland` or `--ozone-platform=auto`. In that case, GPU issues on native Wayland are still real, so the fallback is valuable.

**Recommendation:** Keep the conditional logic. It correctly handles the three scenarios (user explicit, XWayland, native Wayland) and protects users who override to native Wayland. The `disableGpuExplicitlySet` tracking in `app/config/index.js:595-599` is well-designed.

---

### 3. `--enable-features=WebRTCPipeWireCapturer`

**Location:** `app/startup/commandLine.js` lines 50-62

**What it does:** Enables PipeWire-based screen capture when running under Wayland.

**Why it was added:** PipeWire is the standard screen capture mechanism on Wayland. Without it, screen sharing fails entirely on Wayland sessions.

**Still needed?** No. `WebRTCPipeWireCapturer` has been enabled by default since Chromium 110 (early 2023). The `chrome://flags` entry for this flag expired around Chromium 120 ([Chromium issue 40284380](https://issues.chromium.org/issues/40284380)). On Chromium 142 (Electron 39), passing the flag is harmless but entirely redundant.

**Recommendation:** Remove, but only after the #2217 investigation is resolved. Removing the enable-feature and adding `--disable-features=WebRTCPipeWireCapturer` for the `isX11Forced` path (see Option F below) should be done in the same change to avoid changing two variables independently during investigation. Removing just the enable is safe cleanup but defers the more important `isX11Forced` disable.

**Important distinction:** There is a different flag called `WebRtcPipeWireCamera` for PipeWire camera support (not screen sharing). This flag is NOT enabled by default and its expiry keeps being extended (currently milestone 150+). The project does not currently use this flag.

---

### 4. `--use-fake-ui-for-media-stream`

**Location:** `app/startup/commandLine.js` lines 64-71

**What it does:** Tells Chromium's `MediaStreamUIController` to auto-approve all media device requests (camera, microphone, display capture) without showing any UI. Currently only applied on native Wayland (the `!isX11Forced` guard on line 70).

**Why it was added:** On native Wayland, Chromium's internal permission dialog caused GPU context binding failures in the video capture service. The flag bypasses that dialog entirely.

**The conflict:** The `!isX11Forced` guard fixes #2169 (camera) but causes #2217 (screen sharing empty on XWayland). These two issues directly contradict each other at this flag. See the deep dive below for the full root cause analysis and the targeted fix.

**Recommendation:** Do not toggle this flag back and forth. The correct fix is `--disable-features=WebRTCPipeWireCapturer` when `isX11Forced`, which addresses the root cause without touching the camera/mic permission path. See Option F in the deep dive.

---

### 5. `--disable-features=HardwareMediaKeyHandling`

**Location:** `app/startup/commandLine.js` lines 14-24

**What it does:** Prevents system media keys (play/pause/stop) from conflicting with Teams' internal media controls.

Not Wayland-specific. Applied unconditionally on all platforms.

**Recommendation:** Keep. Still valid in Chromium 144 and prevents a real conflict.

---

### 6. `--try-supported-channel-layouts`

**Location:** `app/startup/commandLine.js` line 6

**What it does:** Helps audio playback find a working channel layout.

Not Wayland-specific. Applied unconditionally.

**Recommendation:** Keep. Not related to the Wayland audit.

---

### 7. `--autoplay-policy=no-user-gesture-required`

**Location:** `app/startup/commandLine.js` lines 8-12

**What it does:** Allows audio playback without a prior user gesture. Needed for notification sounds.

Not Wayland-specific. Applied unconditionally.

**Recommendation:** Keep. Not related to the Wayland audit.

---

## Deep Dive: The Screen Sharing vs Camera Conflict

### The Handler Is Already There

`session.setDisplayMediaRequestHandler()` is already implemented at `app/mainAppWindow/index.js:264`. It shows the custom `StreamSelector` picker and returns a `DesktopCapturerSource` directly to Teams. This has been in the codebase since PR #1792 (v2.5.x) and was explicitly chosen over `useSystemPicker: true` (rejected in ADR-008).

```javascript
// app/mainAppWindow/index.js:264
window.webContents.session.setDisplayMediaRequestHandler(
  (_request, callback) => {
    streamSelector.show((source) => {
      if (source) {
        handleScreenSourceSelection(source, callback);
      } else {
        setImmediate(() => { try { callback({}); } catch { } });
      }
    });
  }
);
```

Despite the handler being registered, screen sharing is still broken on XWayland (issue #2217) without `--use-fake-ui-for-media-stream`. The handler alone is not sufficient — the problem is deeper.

### Screen Sharing Architecture

The implementation has two parallel layers:

**Layer 1 — Electron main process (`setDisplayMediaRequestHandler`):** When Teams calls `navigator.mediaDevices.getDisplayMedia()`, the handler intercepts it, shows the `StreamSelector` (`WebContentsView` overlay at the bottom of the window), gets sources via `desktopCapturer.getSources()`, and returns the selected `DesktopCapturerSource` via `callback({ video: selectedSource })`. This bypasses Chromium's built-in screen picker dialog.

**Layer 2 — Renderer injection (`injectedScreenSharing.js`):** A script injected into the Teams page wraps both `getDisplayMedia()` and `getUserMedia()`. Its roles are: (a) force-disable audio in all screen capture constraints to prevent echo feedback on PipeWire/Wayland (#1800), (b) monitor stream lifecycle via track `ended` events, MutationObserver on "Stop sharing" buttons, and periodic polling to fire `screen-sharing-started`/`screen-sharing-stopped` IPC events, and (c) respect the desktopCapturer source ID format (`screen:x:y`) rather than passing the MediaStream UUID, which Wayland's xdg-desktop-portal requires (ADR-001, #1853).

The two layers complement each other. The handler replaced Chromium's dialog; the injected script handles audio safety and lifecycle.

### Why Screen Sharing Breaks on XWayland Without the Flag

The root cause is confirmed via Chromium source code. `DesktopCapturer::IsRunningUnderWayland()` in `desktop_capturer.cc` controls whether PipeWire or X11 is used for screen capture:

```cpp
bool DesktopCapturer::IsRunningUnderWayland() {
  const char* xdg_session_type = getenv("XDG_SESSION_TYPE");
  if (!xdg_session_type || strncmp(xdg_session_type, "wayland", 7) != 0)
    return false;
  if (!(getenv("WAYLAND_DISPLAY")))
    return false;
  return true;
}
```

This function checks only `XDG_SESSION_TYPE` and `WAYLAND_DISPLAY` — it has zero coupling to `--ozone-platform`. On a typical Wayland session both env vars are set and inherited by all child processes, including the Electron process running with `--ozone-platform=x11`. So even under XWayland, `IsRunningUnderWayland()` returns `true`, PipeWire is selected as the screen capture backend, and xdg-desktop-portal authorization is required before `desktopCapturer.getSources()` can return any sources.

Without `--use-fake-ui-for-media-stream` providing auto-authorization, the portal auth never happens and `getSources()` returns empty silently — which is why #2217 reports an empty Screen pane and Window pane. The `StreamSelector` opens correctly but has nothing to show.

The `setDisplayMediaRequestHandler` suppresses Chromium's picker dialog but does not trigger PipeWire portal authorization. These are different things.

### The Real Root Cause of #2169

The PR #2190 commit message contains a crucial detail: "Starting in v2.7.5, camera worked on first launch after clearing Local Storage but crashed on subsequent launches."

The problem is specifically about persisted permissions. When `--use-fake-ui-for-media-stream` bypasses the normal permission dialog, Chromium stores the media permission grant through the fake-ui codepath. On the second and subsequent launches — when those persisted permissions are loaded — the video capture service fails to bind its GPU context provider (`Bind context provider failed`). Clearing Local Storage removes the persisted permissions, which is why a fresh launch works.

This is not a constant GPU failure. It is a permission-persistence problem: the fake-ui permission storage path is incompatible with the video capture service's GPU context initialization on subsequent sessions under XWayland.

### Historical Complications

Screen sharing has gone through several iterations. Each piece of complexity was added to fix a real production bug:

**Audio echo on Wayland/PipeWire (#1800):** Multiple desktop capture sessions from the same source created duplicate audio capture, causing echo feedback. Stream reuse failed because `MediaStream` objects are not serializable over IPC. The fix was to force-disable audio in all screen capture constraints at the injected script level (`audio: false`, `systemAudio: "exclude"`). The commit note explicitly says "Attempt to fix" — the maintainer was not certain whether it fully worked.

**SIGILL crashes on certain hardware (#2058, #2041, #2091):** The original screen picker showed live `getUserMedia()` video previews for every available screen and window. On certain hardware (USB-C docking stations, DisplayLink adapters), this caused illegal hardware instruction crashes from too many simultaneous GPU-accelerated media handles. The fix was to use only static thumbnail images from `desktopCapturer.getSources({ thumbnailSize })`, removing live previews entirely.

**Audio disabled in regular calls (#1871, #1896):** The `getUserMedia()` screen-share detection logic originally checked for `deviceId.exact` in video constraints, which was too broad — Teams also uses `deviceId.exact` to select a specific camera for regular video calls. This caused audio to be disabled in non-screen-sharing calls. The fix narrowed the detection to only match `chromeMediaSource === "desktop"` or `chromeMediaSourceId` constraints.

**Wayland source ID format (#1853):** On Wayland, `xdg-desktop-portal`'s ScreenCast API requires source IDs in the `screen:x:y` or `window:x:y` format. The original implementation sent the MediaStream UUID over IPC, which Wayland rejected. The fix was to store the `DesktopCapturerSource` ID from the main process and send `null` from the renderer so the main process ID is preserved (ADR-001).

**useSystemPicker rejected (ADR-008):** Electron 38 introduced `useSystemPicker: true` for `setDisplayMediaRequestHandler`. Investigation showed it has zero support on Linux Wayland, known toggle-hang bugs on macOS, and requires maintaining two code paths. Rejected.

### Options Considered

**Option A: Re-enable `--use-fake-ui-for-media-stream` on XWayland (PR #2219)**

Fixes #2217 (screen sharing) but reintroduces #2169 (camera GPU context corruption on subsequent launches). Not acceptable.

**Option B: Use `session.setPermissionRequestHandler()` for camera/mic permissions**

Would grant `media` permissions through Electron's permission layer rather than Chromium's fake-ui path. Hypothesis: this might avoid the GPU context corruption. Untested. Even if it works for camera, it does not solve the PipeWire portal auth issue for `desktopCapturer.getSources()` on XWayland.

**Option C: Force X11 screen capture path via environment override**

Confirmed via Chromium source: setting `process.env.XDG_SESSION_TYPE = 'x11'` before Chromium initializes would cause `IsRunningUnderWayland()` to return `false`, routing screen capture through X11. However, this is a blunt instrument — it affects all code in the process that reads `XDG_SESSION_TYPE`, not just screen capture, and could break clipboard, file pickers, or other portal-dependent features.

**Option D: Accept the trade-off and document it**

XWayland: camera works, screen sharing broken. Native Wayland: screen sharing works, GPU issues on some hardware. Users choose their mode. Document both clearly.

**Option E: Defer StreamSelector until after portal auth completes**

The portal auth is not being triggered at all on XWayland without the fake-ui flag — `getSources()` returns empty silently rather than triggering a visible portal dialog. Deferring the picker cannot solve the problem because auth never happens. Low standalone value.

**Option F: `--disable-features=WebRTCPipeWireCapturer` when `isX11Forced` (most promising)**

The Chromium check that selects PipeWire is:

```cpp
if (options.allow_pipewire() && DesktopCapturer::IsRunningUnderWayland())
```

`options.allow_pipewire()` is controlled by the `WebRTCPipeWireCapturer` feature flag. Explicitly disabling it when `isX11Forced` short-circuits the check at the first condition — PipeWire is never selected regardless of `XDG_SESSION_TYPE`. This forces X11 screen capture on XWayland, making `desktopCapturer.getSources()` return results without any portal authorization. Camera and mic permissions are completely unaffected since `--use-fake-ui-for-media-stream` is not involved.

The implementation in `commandLine.js` would be a single line inside the `isX11Forced` branch:

```javascript
app.commandLine.appendSwitch('disable-features', 'WebRTCPipeWireCapturer');
```

This is more targeted than the env var override (Option C) because it only affects the screen capture backend, not clipboard, file pickers, or other portal-dependent features. The only risk is on native Wayland — but this flag would only be applied when `isX11Forced` is true, so native Wayland users are unaffected.

---

## Related Open Issues

**#2217 (screen sharing broken on XWayland):** Directly caused by removing `--use-fake-ui-for-media-stream` from XWayland. Root cause is empty `desktopCapturer.getSources()` results because PipeWire is selected via `XDG_SESSION_TYPE` independently of `--ozone-platform`. Workaround: switch to `--ozone-platform=wayland`.

**#2222 (microphone not working since v2.7.5):** Needs debug logs to determine root cause. Microphone goes through `getUserMedia()`, not `getDisplayMedia()`, so the `setDisplayMediaRequestHandler` does not affect it. The injected script does hook `getUserMedia()` but only modifies constraints for screen-sharing paths — it does not alter audio-only calls.

**#2204 (no thumbnail window when sharing on native Wayland):** User is on `--ozone-platform=wayland`. Under native Wayland, `--use-fake-ui-for-media-stream` IS applied (the `!isX11Forced` guard passes). So screen sharing should work. The missing thumbnail suggests either the `screen-sharing-started` IPC event is not firing, or the preview window creation is failing for another reason. Needs separate investigation.

**#2107 (MQTT screen sharing status):** Depends on `screen-sharing-started`/`screen-sharing-stopped` IPC events fired by `injectedScreenSharing.js`. There is also a pre-existing bug: the injected script calls `electronAPI.sendScreenSharingStarted(null)` (per ADR-001 to preserve the desktopCapturer source ID), but the preload guard in `app/browser/preload.js` rejects `null` with `typeof sourceId === 'string'` — so the `screen-sharing-started` IPC event is currently silently dropped. The MQTT pipeline may already be broken for the `getDisplayMedia` path independent of the Wayland issue.

**#2221 (camera/mic crash):** Crashes on both XWayland and native Wayland — not explained by the `--use-fake-ui-for-media-stream` conflict. Check debug logs for `Bind context provider failed` errors and the startup log lines showing which Wayland path was taken.

---

## Relationship to Issue #2221

The camera/mic crash in #2221 occurs on both native Wayland and XWayland, which suggests the Wayland workarounds are not the direct cause. The most likely explanations are an unrelated Teams web app change or Electron 39 regression, or GPU state inconsistency if `disableGpuExplicitlySet` gets set incorrectly.

Request the user's debug logs and check for `Bind context provider failed` errors, the startup log lines showing which Wayland path was taken ("Running under Wayland with forced X11 mode" vs "Running under Wayland, disabling GPU composition"), and whether the user has any `electronCLIFlags` or `disableGpu` in their config.

---

## Summary of Recommendations

| Flag/Workaround | Action | Rationale |
|-----------------|--------|-----------|
| `--ozone-platform=x11` (package.json) | Keep | Native Wayland GPU still broken upstream |
| GPU auto-disable conditional logic | Keep | Protects users who override to native Wayland |
| `WebRTCPipeWireCapturer` enable-feature | Remove (with #2217 fix) | Default since Chromium 110; remove alongside the `isX11Forced` disable in the same change |
| `--use-fake-ui-for-media-stream` | Do not toggle | Root cause is PipeWire selected via `XDG_SESSION_TYPE` — fix via `--disable-features=WebRTCPipeWireCapturer` when `isX11Forced` |
| `HardwareMediaKeyHandling` disable | Keep | Not Wayland-specific, still needed |

### Immediate Actions

1. Do not merge PR #2219 as-is. Re-enabling `--use-fake-ui-for-media-stream` for XWayland fixes #2217 but reintroduces #2169.
2. Review and merge PR #2207 (removes redundant second `desktopCapturer.getSources()` call in `handleScreenSourceSelection`). Correct improvement, independent of the #2217 fix.
3. Update `electron-40-migration-research.md` to note `WebRTCPipeWireCapturer` is redundant (not just "still valid").

### Near-Term: Test Option F

Add `app.commandLine.appendSwitch('disable-features', 'WebRTCPipeWireCapturer')` in the `isX11Forced` branch of `commandLine.js` and verify on an XWayland system:

1. Add diagnostic logging in `app/screenSharing/service.js` inside `#handleGetDesktopCapturerSources` to count how many sources `getSources()` returns when the picker opens (this is where the empty-sources failure occurs — `handleScreenSourceSelection` is only reached after selection, so it is unreachable in the failure scenario).
2. Confirm `getSources()` returns results with Option F applied and screen sharing works end-to-end.
3. Verify camera works on first and second launch (the `Bind context provider failed` error must not appear on second launch).
4. Verify `screen-sharing-started` IPC fires correctly — and separately investigate the preload guard bug in `sendScreenSharingStarted` that silently drops `null` values (blocking MQTT status for #2107).

If Option F works, `--use-fake-ui-for-media-stream` can be removed entirely and the `WebRTCPipeWireCapturer` enable-feature becomes dead code.

### Medium-Term (When Upstream Stabilizes)

1. Switch from `--ozone-platform=x11` to `--ozone-platform=auto` once Chromium's native Wayland GPU support is reliable. Track via [Chromium issue 350117524](https://issues.chromium.org/issues/350117524) and [Electron baseline Wayland specs #48441](https://github.com/electron/electron/issues/48441).
2. Consider `WebRtcPipeWireCamera` flag for native PipeWire camera support (currently not default, tracked upstream).

---

## References

- [WebRTC `DesktopCapturer::IsRunningUnderWayland()` source](https://chromium.googlesource.com/external/webrtc/+/master/modules/desktop_capture/desktop_capturer.cc)
- [Electron `session.setDisplayMediaRequestHandler()` API docs](https://www.electronjs.org/docs/latest/api/session#sessetdisplaymediarequest-handler-handler)
- [Issue #2221 - Camera/mic crash](https://github.com/IsmaelMartinez/teams-for-linux/issues/2221)
- [Issue #2217 - Screen sharing broken on Wayland/XWayland](https://github.com/IsmaelMartinez/teams-for-linux/issues/2217)
- [Issue #2222 - Microphone not working in v2.7.5](https://github.com/IsmaelMartinez/teams-for-linux/issues/2222)
- [Issue #2204 - No thumbnail window when sharing on native Wayland](https://github.com/IsmaelMartinez/teams-for-linux/issues/2204)
- [Issue #2169 - Camera broken under XWayland with GPU disabled](https://github.com/IsmaelMartinez/teams-for-linux/issues/2169)
- [Issue #2107 - MQTT screen sharing status](https://github.com/IsmaelMartinez/teams-for-linux/issues/2107)
- [Issue #1800 - Audio echo on Wayland/PipeWire](https://github.com/IsmaelMartinez/teams-for-linux/issues/1800)
- [PR #2219 - Screen sharing regression fix (do not merge as-is)](https://github.com/IsmaelMartinez/teams-for-linux/pull/2219)
- [PR #2207 - Remove redundant second getSources() call (open)](https://github.com/IsmaelMartinez/teams-for-linux/pull/2207)
- [PR #2190 - Fix: keep GPU enabled under XWayland](https://github.com/IsmaelMartinez/teams-for-linux/pull/2190)
- [PR #1792 - Feature: improved screen sharing (setDisplayMediaRequestHandler added)](https://github.com/IsmaelMartinez/teams-for-linux/pull/1792)
- [PR #1854 - Attempt to fix audio echo (stream reuse failed, audio disabling used instead)](https://github.com/IsmaelMartinez/teams-for-linux/pull/1854)
- [Electron #37524 - Desktop Capturer not consistently using PipeWire on Wayland](https://github.com/electron/electron/issues/37524)
- [Electron #30652 - Redundant app-created screen share dialog on Linux Wayland](https://github.com/electron/electron/issues/30652)
- [Electron #45198 - desktopCapturer crashing on Linux with XDP when portal is dismissed](https://github.com/electron/electron/issues/45198)
- [Electron #48441 - Baseline Wayland test specs](https://github.com/electron/electron/issues/48441)
- [Electron #48321 - Wayland windows in VMs without GPU](https://github.com/electron/electron/issues/48321)
- [Chromium 350117524 - NVIDIA Wayland GPU broken](https://issues.chromium.org/issues/350117524)
- [Chromium 40284380 - WebRTCPipeWireCapturer flag expired](https://issues.chromium.org/issues/40284380)
- [NixOS/nixpkgs#382612 - Kernel 6.12+ Wayland regression](https://github.com/NixOS/nixpkgs/issues/382612)
- [ADR-001 - desktopCapturer source ID format](../adr/001-desktopcapturer-source-id-format.md)
- [ADR-008 - useSystemPicker rejection](../adr/008-usesystempicker-electron-38.md)
