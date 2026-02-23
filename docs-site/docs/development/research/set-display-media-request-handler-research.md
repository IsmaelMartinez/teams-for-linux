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

These two requirements directly contradict each other. There is no known Electron/Chromium API that provides portal authorization for `desktopCapturer.getSources()` without also going through the fake-ui permission path.

---

## Related Open Issues

**#2217 (screen sharing broken on XWayland):** Directly caused by removing `--use-fake-ui-for-media-stream` from XWayland. Root cause is empty `desktopCapturer.getSources()` results due to missing PipeWire portal auth. Workaround: switch to `--ozone-platform=wayland`.

**#2222 (microphone not working since v2.7.5):** May have the same root cause as #2217. Without `--use-fake-ui-for-media-stream`, Chromium's normal permission dialog handles microphone. If that dialog fails silently or its permission grants interact badly with XWayland, microphone fails. Microphone goes through `getUserMedia()`, not `getDisplayMedia()`, so the `setDisplayMediaRequestHandler` does not affect it.

**#2204 (no thumbnail window when sharing on native Wayland):** User is on `--ozone-platform=wayland`. Under native Wayland, `--use-fake-ui-for-media-stream` IS applied (the `!isX11Forced` guard passes). So screen sharing should work. The missing thumbnail suggests either the `screen-sharing-started` IPC event is not firing, or the preview window creation is failing for another reason. Needs separate investigation.

**#2107 (MQTT screen sharing status):** Depends on `screen-sharing-started`/`screen-sharing-stopped` IPC events fired by `injectedScreenSharing.js`. Any changes to screen sharing that bypass the injected script would break MQTT status.

**#2221 (camera/mic crash):** Crashes on both XWayland and native Wayland. Not explained by the `--use-fake-ui-for-media-stream` conflict. Needs debug logs.

---

## Options Considered

**Option A: Re-enable `--use-fake-ui-for-media-stream` on XWayland (PR #2219)**

Fixes #2217 (screen sharing) but reintroduces #2169 (camera GPU context corruption on subsequent launches). Not acceptable.

**Option B: Use `session.setPermissionRequestHandler()` for camera/mic permissions**

Would grant `media` permissions through Electron's permission layer rather than Chromium's fake-ui path. Hypothesis: this might avoid the GPU context corruption. Untested. Even if it works for camera, it does not solve the PipeWire portal auth issue for `desktopCapturer.getSources()` on XWayland.

**Option C: Force X11 screen capture path despite PipeWire default**

Under `--ozone-platform=x11`, the rendering is X11. In theory, `desktopCapturer.getSources()` should use the X11 screen capture path, not PipeWire. The fact that it appears to use PipeWire anyway when `WebRTCPipeWireCapturer` is the default suggests Chromium's capture layer checks `XDG_SESSION_TYPE=wayland` independently of `--ozone-platform`. Possible mitigation: unset `XDG_SESSION_TYPE` before launch, or set it to `x11` in the Electron app process. This would bypass the Wayland-specific code paths in `commandLine.js` entirely and may break other things. Needs investigation.

**Option D: Accept the trade-off and document it**

XWayland: camera works, screen sharing broken. Native Wayland: screen sharing works, GPU issues on some hardware. Users choose their mode. Document both clearly.

**Option E: Investigate whether `desktopCapturer.getSources()` can be called before any portal auth**

Electron's `desktopCapturer.getSources()` might have different behavior depending on whether it's called from the main process or renderer, and whether the session has already authorized the portal. If the first call to `getSources()` triggers portal auth, a portal auth dialog should appear before the custom picker. The `StreamSelector` could be deferred until portal auth completes. This would require understanding the exact timing of portal auth in Chromium's screen capturer.

---

## Recommendation

Do not merge PR #2219 (re-enabling `--use-fake-ui-for-media-stream` for XWayland). It fixes one regression (#2217) by reintroducing another (#2169).

The correct next step is **investigation, not implementation**. The specific unknown is: why does `desktopCapturer.getSources()` return empty on XWayland without `--use-fake-ui-for-media-stream`, given that `--ozone-platform=x11` should route capture through X11 rather than PipeWire? Understanding this is prerequisite to any fix.

Concrete investigation steps:

1. Add logging in `handleScreenSourceSelection` to count sources returned by `desktopCapturer.getSources()` before the picker opens.
2. On a XWayland system without `--use-fake-ui-for-media-stream`, check whether `getSources()` returns zero sources or non-empty sources with empty thumbnails.
3. Check whether the PipeWire portal auth dialog appears (in the compositor/notification tray) when screen sharing is initiated.
4. Test whether unsetting `XDG_SESSION_TYPE` (so the Wayland code paths in `commandLine.js` are skipped entirely) restores screen sharing on XWayland.
5. Verify whether `session.setPermissionRequestHandler()` granting `media` permissions prevents the camera GPU context corruption, as a precursor to evaluating option B.

---

## References

- [Electron `session.setDisplayMediaRequestHandler()` API docs](https://www.electronjs.org/docs/latest/api/session#sessetdisplaymediarequest-handler-handler)
- [Electron `session.setPermissionRequestHandler()` API docs](https://www.electronjs.org/docs/latest/api/session#sessetpermissionrequesthandlerhandler)
- [Issue #2217 - Screen sharing broken on Wayland/XWayland](https://github.com/IsmaelMartinez/teams-for-linux/issues/2217)
- [Issue #2222 - Microphone not working in v2.7.5](https://github.com/IsmaelMartinez/teams-for-linux/issues/2222)
- [Issue #2204 - No thumbnail window when sharing on native Wayland](https://github.com/IsmaelMartinez/teams-for-linux/issues/2204)
- [Issue #2169 - Camera broken under XWayland with GPU disabled](https://github.com/IsmaelMartinez/teams-for-linux/issues/2169)
- [Issue #1800 - Audio echo on Wayland/PipeWire](https://github.com/IsmaelMartinez/teams-for-linux/issues/1800)
- [Issue #2107 - MQTT screen sharing status](https://github.com/IsmaelMartinez/teams-for-linux/issues/2107)
- [PR #2219 - Screen sharing regression fix (do not merge as-is)](https://github.com/IsmaelMartinez/teams-for-linux/pull/2219)
- [PR #2190 - Fix: keep GPU enabled under XWayland](https://github.com/IsmaelMartinez/teams-for-linux/pull/2190)
- [PR #1792 - Feature: improved screen sharing (setDisplayMediaRequestHandler added)](https://github.com/IsmaelMartinez/teams-for-linux/pull/1792)
- [PR #1854 - Attempt to fix audio echo (stream reuse failed, audio disabling used instead)](https://github.com/IsmaelMartinez/teams-for-linux/pull/1854)
- [Wayland Optimizations Audit](wayland-optimizations-audit.md)
- [ADR-001 - desktopCapturer source ID format](../adr/001-desktopcapturer-source-id-format.md)
- [ADR-008 - useSystemPicker rejection](../adr/008-usesystempicker-electron-38.md)
