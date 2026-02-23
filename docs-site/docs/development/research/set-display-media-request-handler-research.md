# setDisplayMediaRequestHandler Research

:::warning Not a Simple Fix
`session.setDisplayMediaRequestHandler()` is already implemented in the codebase. Screen sharing on XWayland is broken for a deeper reason that the handler alone does not solve. Read the full investigation below before making any changes.
:::

**Date:** 2026-02-23
**Current Version:** Electron 39.5.1 (Chromium 142)
**Related Issues:** [#2169](https://github.com/IsmaelMartinez/teams-for-linux/issues/2169), [#2217](https://github.com/IsmaelMartinez/teams-for-linux/issues/2217), [#2222](https://github.com/IsmaelMartinez/teams-for-linux/issues/2222), [#2204](https://github.com/IsmaelMartinez/teams-for-linux/issues/2204), [#2107](https://github.com/IsmaelMartinez/teams-for-linux/issues/2107)
**Related Audit:** [Wayland Optimizations Audit](wayland-optimizations-audit.md)
**Related ADRs:** [ADR-001](../adr/001-desktopcapturer-source-id-format.md), [ADR-008](../adr/008-usesystempicker-electron-38.md)

---

## Key Finding: The Handler Is Already There

`session.setDisplayMediaRequestHandler()` is **already implemented** at `app/mainAppWindow/index.js:264`. It shows the custom `StreamSelector` picker and returns a `DesktopCapturerSource` directly to Teams. This is not a future improvement — it has been in the codebase since the screen sharing modernization in PR #1792 (v2.5.x).

```javascript
// app/mainAppWindow/index.js:264
window.webContents.session.setDisplayMediaRequestHandler(
  (_request, callback) => {
    streamSelector.show((source) => {
      if (source) {
        handleScreenSourceSelection(source, callback);  // callback({ video: selectedSource })
      } else {
        setImmediate(() => { try { callback({}); } catch { } });
      }
    });
  }
);
```

This handler already does what ADR-008 described as the `setDisplayMediaRequestHandler` pattern, and it was explicitly chosen over `useSystemPicker: true` (rejected in ADR-008 because Linux Wayland has zero support for it).

Despite the handler being registered, screen sharing is **still broken on XWayland** (issue #2217) without `--use-fake-ui-for-media-stream`. This means the handler alone is not sufficient. The problem is deeper.

---

## The Actual Architecture

The screen sharing implementation has two parallel layers that serve different roles:

**Layer 1 — Electron main process (`setDisplayMediaRequestHandler`):**

When Teams calls `navigator.mediaDevices.getDisplayMedia()`, the Electron handler intercepts it, shows the `StreamSelector` (`WebContentsView` overlay at the bottom of the window), gets sources via `desktopCapturer.getSources()`, and returns the selected `DesktopCapturerSource` via `callback({ video: selectedSource })`. This bypasses Chromium's built-in screen picker dialog.

**Layer 2 — Renderer injection (`injectedScreenSharing.js`):**

A script injected into the Teams page wraps both `getDisplayMedia()` and `getUserMedia()`. Its roles are: (a) force-disable audio in all screen capture constraints to prevent echo feedback on PipeWire/Wayland (#1800), (b) monitor stream lifecycle via track `ended` events, MutationObserver on "Stop sharing" buttons, and periodic polling to fire `screen-sharing-started`/`screen-sharing-stopped` IPC events, and (c) respect the desktopCapturer source ID format (`screen:x:y`) rather than passing the MediaStream UUID, which Wayland's xdg-desktop-portal requires (ADR-001, #1853).

The two layers complement each other. The handler replaced Chromium's dialog; the injected script handles audio safety and lifecycle.

---

## Why Screen Sharing Breaks on XWayland Without the Flag

The `--use-fake-ui-for-media-stream` flag does more than suppress Chromium's permission bubble. Under XWayland (`--ozone-platform=x11`) with `WebRTCPipeWireCapturer` as the default (since Chromium 110), Chromium routes screen capture through PipeWire even though the rendering layer is X11. The PipeWire path requires xdg-desktop-portal authorization before `desktopCapturer.getSources()` can return any sources.

Without `--use-fake-ui-for-media-stream`, that portal authorization either does not happen or triggers a separate portal dialog. The result is that `desktopCapturer.getSources()` returns empty — which is why issue #2217 reports "a new bar at the bottom showing **empty** Screen pane and Window pane". The `StreamSelector` opens correctly, but it has nothing to show. Selecting from empty panes does nothing, and the share button hangs.

The `setDisplayMediaRequestHandler` correctly suppresses Chromium's **picker** dialog, but it does not suppress the PipeWire **portal authorization** step that `desktopCapturer.getSources()` needs. These are different things.

**Root cause confirmed via Chromium source code.** WebRTC's `DesktopCapturer::IsRunningUnderWayland()` in `desktop_capturer.cc` controls whether PipeWire or X11 is used for screen capture. Its implementation reads only `XDG_SESSION_TYPE` and `WAYLAND_DISPLAY` from the process environment — it has zero coupling to the ozone platform:

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

On a typical Wayland session, both `XDG_SESSION_TYPE=wayland` and `WAYLAND_DISPLAY` are set and inherited by all child processes — including the Electron process running with `--ozone-platform=x11`. So even under XWayland, `IsRunningUnderWayland()` returns `true`, PipeWire is selected as the capture backend, and portal authorization is required. The rendering layer and the capture layer are completely decoupled.

---

## The Real Root Cause of #2169

The PR #2190 commit message contains a crucial detail that the initial analysis missed:

> "Starting in v2.7.5, camera worked on **first launch after clearing Local Storage** but crashed on subsequent launches."

The problem is specifically about **persisted permissions**. When `--use-fake-ui-for-media-stream` bypasses the normal permission dialog, Chromium stores the media permission grant through the fake-ui codepath. On the second and subsequent launches — when those persisted permissions are loaded — the video capture service's GPU context provider fails to bind (`Bind context provider failed`). Clearing Local Storage removes the persisted permissions, which is why a fresh launch works.

This is not a constant GPU failure. It is a permission-persistence problem: the fake-ui permission storage path is incompatible with the video capture service's GPU context binding on subsequent sessions under XWayland.

This matters because: `session.setPermissionRequestHandler()` granting permissions programmatically would store them through Electron's permission system, not through Chromium's fake-ui path. This **might** avoid the GPU context corruption. But it is untested and uncertain, and camera was a third-party fix (PR #2190 from contributor grzegorz.kozub) that the maintainer hasn't been able to verify end-to-end.

---

## The Historical Complications

Screen sharing has gone through several iterations to reach its current state. Each piece of complexity was added to fix a real production bug:

**Audio echo on Wayland/PipeWire (#1800):** Multiple desktop capture sessions from the same source created duplicate audio capture, causing echo feedback. The first attempted fix was stream reuse — share the main Teams `getDisplayMedia()` stream with the preview window via IPC. This failed because `MediaStream` objects are not serializable over IPC. The final solution was to force-disable audio in all screen capture constraints at the injected script level (`audio: false`, `systemAudio: "exclude"`), on both `getDisplayMedia()` and the screen-sharing path of `getUserMedia()`. The commit note explicitly says "Attempt to fix" — the maintainer was not certain whether it fully worked.

**SIGILL crashes on certain hardware (#2058, #2041, #2091):** The original screen picker showed live `getUserMedia()` video previews for every available screen and window. On certain hardware (USB-C docking stations, DisplayLink adapters), this caused illegal hardware instruction crashes from too many simultaneous GPU-accelerated media handles. The fix was to abandon live previews entirely and use only static thumbnail images from `desktopCapturer.getSources({ thumbnailSize })`. This eliminated the crash class but removed the live preview from the picker.

**Audio disabled in regular calls (#1871, #1896):** The `getUserMedia()` screen-share detection logic originally checked for `deviceId.exact` in video constraints, which was too broad — Teams also uses `deviceId.exact` to select a specific camera for regular video calls. This caused audio to be disabled in non-screen-sharing calls. The fix narrowed the detection to only match `chromeMediaSource === "desktop"` or `chromeMediaSourceId` constraints.

**Wayland source ID format (#1853):** On Wayland, `xdg-desktop-portal`'s ScreenCast API requires source IDs in the `screen:x:y` or `window:x:y` format. The original implementation sent the MediaStream UUID over IPC, which Wayland rejected. The fix was to store the `DesktopCapturerSource` ID from the main process (which is always in the correct format) and send `null` from the renderer instead of `stream.id`, so the main process ID is preserved (ADR-001).

**useSystemPicker rejected (ADR-008):** Electron 38 introduced `useSystemPicker: true` for `setDisplayMediaRequestHandler`. Investigation showed it has zero support on Linux Wayland (the primary platform), known toggle-hang bugs on macOS, and requires maintaining two code paths. Rejected.

---

## The Conflict Summary

The core tension is that `--use-fake-ui-for-media-stream` solves two different problems in one blunt flag:

**For screen sharing on XWayland:** The flag provides portal authorization for `desktopCapturer.getSources()` when PipeWire is active under XWayland. Without it, `getSources()` returns empty. The `setDisplayMediaRequestHandler` does not solve this because portal authorization is a capture-layer concern, not a dialog-suppression concern.

**For camera on XWayland:** The flag causes GPU context corruption in the video capture service when permissions persist across sessions. Without it, camera permissions flow through Chromium's normal path and store correctly.

These two requirements directly contradict each other when approached through the fake-ui flag. However, since `IsRunningUnderWayland()` is gated by `options.allow_pipewire()` before the env var check, explicitly disabling `WebRTCPipeWireCapturer` when `isX11Forced` short-circuits the PipeWire backend selection entirely — forcing X11 screen capture without touching the camera/mic permission path at all. See Option F below.

---

## Related Open Issues

**#2217 (screen sharing broken on XWayland):** Directly caused by removing `--use-fake-ui-for-media-stream` from XWayland. Root cause is empty `desktopCapturer.getSources()` results due to missing PipeWire portal auth. Workaround: switch to `--ozone-platform=wayland`.

**#2222 (microphone not working since v2.7.5):** Needs debug logs to determine root cause. Microphone goes through `getUserMedia()`, not `getDisplayMedia()`, so the `setDisplayMediaRequestHandler` does not affect it. The injected script in `injectedScreenSharing.js` does hook `getUserMedia()` but only modifies constraints for screen-sharing paths — it does not alter audio-only calls. Whether the normal Chromium permission dialog appears and works correctly on XWayland without `--use-fake-ui-for-media-stream` is unverified.

**#2204 (no thumbnail window when sharing on native Wayland):** User is on `--ozone-platform=wayland`. Under native Wayland, `--use-fake-ui-for-media-stream` IS applied (the `!isX11Forced` guard passes). So screen sharing should work. The missing thumbnail suggests either the `screen-sharing-started` IPC event is not firing, or the preview window creation is failing for another reason. Needs separate investigation.

**#2107 (MQTT screen sharing status):** Depends on `screen-sharing-started`/`screen-sharing-stopped` IPC events fired by `injectedScreenSharing.js`. Any changes to screen sharing that bypass the injected script would break MQTT status. There is also a pre-existing bug: `injectedScreenSharing.js` calls `electronAPI.sendScreenSharingStarted(null)` (per ADR-001 to preserve the desktopCapturer source ID), but the preload guard in `app/browser/preload.js` rejects `null` with `typeof sourceId === 'string'` — so the `screen-sharing-started` IPC event is currently silently dropped. The MQTT pipeline may already be broken for the `getDisplayMedia` path independent of the Wayland issue.

**#2221 (camera/mic crash):** Crashes on both XWayland and native Wayland. Not explained by the `--use-fake-ui-for-media-stream` conflict. Needs debug logs.

---

## Options Considered

**Option A: Re-enable `--use-fake-ui-for-media-stream` on XWayland (PR #2219)**

Fixes #2217 (screen sharing) but reintroduces #2169 (camera GPU context corruption on subsequent launches). Not acceptable.

**Option B: Use `session.setPermissionRequestHandler()` for camera/mic permissions**

Would grant `media` permissions through Electron's permission layer rather than Chromium's fake-ui path. Hypothesis: this might avoid the GPU context corruption. Untested. Even if it works for camera, it does not solve the PipeWire portal auth issue for `desktopCapturer.getSources()` on XWayland.

**Option C: Force X11 screen capture path via environment override**

Confirmed via Chromium source: `DesktopCapturer::IsRunningUnderWayland()` checks `XDG_SESSION_TYPE` and `WAYLAND_DISPLAY` independently of `--ozone-platform`. Setting `process.env.XDG_SESSION_TYPE = 'x11'` (or unsetting `WAYLAND_DISPLAY`) before Chromium initializes would cause `IsRunningUnderWayland()` to return `false`, routing screen capture through X11. However, this is a blunt instrument — it affects all code in the process that reads `XDG_SESSION_TYPE`, not just screen capture, and could break clipboard, file pickers, or other portal-dependent features.

**Option D: Accept the trade-off and document it**

XWayland: camera works, screen sharing broken. Native Wayland: screen sharing works, GPU issues on some hardware. Users choose their mode. Document both clearly.

**Option E: Investigate whether `desktopCapturer.getSources()` can be called before any portal auth**

The portal auth is not being triggered at all on XWayland without the fake-ui flag — it returns empty silently rather than showing a portal dialog that times out. Deferring the picker cannot solve the problem because the issue is that auth never happens. Low standalone value.

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

## Recommendation

Do not merge PR #2219 (re-enabling `--use-fake-ui-for-media-stream` for XWayland). It fixes one regression (#2217) by reintroducing another (#2169).

The root cause of the `getSources()` empty-result problem is now confirmed: `DesktopCapturer::IsRunningUnderWayland()` selects PipeWire based on `XDG_SESSION_TYPE` and `WAYLAND_DISPLAY` independently of `--ozone-platform`. The most targeted fix is **Option F**: explicitly disable `WebRTCPipeWireCapturer` when `isX11Forced` to force the X11 capture backend on XWayland.

Also review [PR #2207](https://github.com/IsmaelMartinez/teams-for-linux/pull/2207), which independently removes the redundant second `desktopCapturer.getSources()` call in `handleScreenSourceSelection` — a correct improvement that should be merged regardless of how the #2217 conflict resolves.

Concrete next steps:

1. Add diagnostic logging in `app/screenSharing/service.js` inside `#handleGetDesktopCapturerSources` to count how many sources `getSources()` returns when the picker opens (this is where the empty-sources failure actually occurs — `handleScreenSourceSelection` is only reached after a source is selected, so it is unreachable in the failure scenario).
2. On an XWayland system without `--use-fake-ui-for-media-stream`, confirm whether `getSources()` returns zero sources or non-empty sources with empty thumbnails.
3. Test Option F: add `app.commandLine.appendSwitch('disable-features', 'WebRTCPipeWireCapturer')` in the `isX11Forced` branch of `commandLine.js`. Verify that `getSources()` returns results and screen sharing works end-to-end without `--use-fake-ui-for-media-stream`.
4. Verify camera works on first and second launch with Option F applied (the `Bind context provider failed` error must not appear on second launch).
5. Verify `screen-sharing-started` IPC fires correctly end-to-end — and separately investigate the preload guard bug in `sendScreenSharingStarted` that silently drops `null` values (blocking MQTT status for issue #2107).

---

## References

- [Electron `session.setDisplayMediaRequestHandler()` API docs](https://www.electronjs.org/docs/latest/api/session#sessetdisplaymediarequest-handler-handler)
- [Electron `session.setPermissionRequestHandler()` API docs](https://www.electronjs.org/docs/latest/api/session#sessetpermissionrequesthandlerhandler)
- [WebRTC `DesktopCapturer::IsRunningUnderWayland()` source](https://chromium.googlesource.com/external/webrtc/+/master/modules/desktop_capture/desktop_capturer.cc)
- [Issue #2217 - Screen sharing broken on Wayland/XWayland](https://github.com/IsmaelMartinez/teams-for-linux/issues/2217)
- [Issue #2222 - Microphone not working in v2.7.5](https://github.com/IsmaelMartinez/teams-for-linux/issues/2222)
- [Issue #2204 - No thumbnail window when sharing on native Wayland](https://github.com/IsmaelMartinez/teams-for-linux/issues/2204)
- [Issue #2169 - Camera broken under XWayland with GPU disabled](https://github.com/IsmaelMartinez/teams-for-linux/issues/2169)
- [Issue #1800 - Audio echo on Wayland/PipeWire](https://github.com/IsmaelMartinez/teams-for-linux/issues/1800)
- [Issue #2107 - MQTT screen sharing status](https://github.com/IsmaelMartinez/teams-for-linux/issues/2107)
- [PR #2219 - Screen sharing regression fix (do not merge as-is)](https://github.com/IsmaelMartinez/teams-for-linux/pull/2219)
- [PR #2207 - Remove redundant second getSources() call in handleScreenSourceSelection](https://github.com/IsmaelMartinez/teams-for-linux/pull/2207)
- [PR #2190 - Fix: keep GPU enabled under XWayland](https://github.com/IsmaelMartinez/teams-for-linux/pull/2190)
- [PR #1792 - Feature: improved screen sharing (setDisplayMediaRequestHandler added)](https://github.com/IsmaelMartinez/teams-for-linux/pull/1792)
- [PR #1854 - Attempt to fix audio echo (stream reuse failed, audio disabling used instead)](https://github.com/IsmaelMartinez/teams-for-linux/pull/1854)
- [Electron #37524 - Desktop Capturer not consistently using PipeWire on Wayland](https://github.com/electron/electron/issues/37524)
- [Electron #30652 - Redundant app-created screen share dialog on Linux Wayland](https://github.com/electron/electron/issues/30652)
- [Electron #45198 - desktopCapturer crashing on Linux with XDP when portal is dismissed](https://github.com/electron/electron/issues/45198)
- [Chromium 40284380 - WebRTCPipeWireCapturer flag expired](https://issues.chromium.org/issues/40284380)
- [Wayland Optimizations Audit](wayland-optimizations-audit.md)
- [ADR-001 - desktopCapturer source ID format](../adr/001-desktopcapturer-source-id-format.md)
- [ADR-008 - useSystemPicker rejection](../adr/008-usesystempicker-electron-38.md)
