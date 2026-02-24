---
id: 016-wayland-command-line-flags
---

# ADR 016: Wayland Command-Line Flag Decisions

## Status

✅ Implemented (v2.7.9+)

## Context

Teams for Linux runs on Linux desktops that use either X11 or Wayland display servers. Since Electron 38, the default ozone platform changed from `x11` to `auto`, which caused the app to run as a native Wayland client and introduced widespread regressions. The project applies several Wayland-specific command-line flags to maintain compatibility. This ADR documents each flag decision and the reasoning behind it.

**Implementation:** `app/startup/commandLine.js` — `addSwitchesBeforeConfigLoad()` and `addSwitchesAfterConfigLoad(config)`

The core conflict this ADR resolves: issues [#2217](https://github.com/IsmaelMartinez/teams-for-linux/issues/2217) (screen sharing broken on XWayland) and [#2169](https://github.com/IsmaelMartinez/teams-for-linux/issues/2169) (camera broken on XWayland) directly contradict each other at the `--use-fake-ui-for-media-stream` flag level. The investigation that led to this ADR is documented in the [Wayland Optimizations Audit](../research/wayland-optimizations-audit.md).

---

## Decision

Apply the following Wayland-specific flags with the rationale described below.

### Flag 1: `--ozone-platform=x11` (Force XWayland)

**Applied via:** `package.json` `executableArgs` for Linux and Snap targets.

**Decision:** Force XWayland as the default. Users on Wayland sessions who want native Wayland rendering must manually pass `--ozone-platform=wayland`.

**Rationale:** Native Wayland GPU acceleration is broken for a significant portion of users: NVIDIA cards produce "Unsupported modifier, resource creation failed" errors ([Chromium issue 350117524](https://issues.chromium.org/issues/350117524)), AMD cards on Fedora 42 fall back to software rendering, Kernel 6.12+ configurations fail to start entirely ([NixOS/nixpkgs#382612](https://github.com/NixOS/nixpkgs/issues/382612)), and VMs without GPU show blank windows. Electron has zero dedicated Wayland tests ([electron/electron#48441](https://github.com/electron/electron/issues/48441)). XWayland is stable across all these configurations.

**Trade-off:** Users with fractional scaling on Wayland get blurry text under XWayland. Manual override to `--ozone-platform=wayland` is documented in `docs-site/docs/troubleshooting.md`.

---

### Flag 2: GPU Auto-Disable on Native Wayland

**Applied via:** `commandLine.js` `addSwitchesAfterConfigLoad()` when `XDG_SESSION_TYPE=wayland` and `!isX11Forced`.

**Decision:** Automatically disable GPU (`disableGpu = true`) when running native Wayland, unless the user has explicitly set `disableGpu` in config or the app is in XWayland mode.

**Rationale:** Native Wayland rendering with GPU enabled causes blank windows and crashes on many configurations. The conditional logic — which uses `disableGpuExplicitlySet` to distinguish user intent from the auto-disable — was added after issue #2169 revealed that disabling GPU under XWayland breaks the video capture service and prevents camera from working. The three-way conditional (explicit user setting / XWayland / native Wayland) correctly handles all cases.

---

### Flag 3: `--disable-features=WebRTCPipeWireCapturer` when XWayland

**Applied via:** `commandLine.js` inside the `isX11Forced` branch, merged into the existing `disable-features` switch value.

**Decision:** Explicitly disable `WebRTCPipeWireCapturer` when running under XWayland (`isX11Forced`). This is the fix for issue #2217.

**Rationale (confirmed via Chromium source):** `DesktopCapturer::IsRunningUnderWayland()` in WebRTC's `desktop_capturer.cc` selects the PipeWire capture backend by checking `XDG_SESSION_TYPE` and `WAYLAND_DISPLAY` from the process environment. It has zero coupling to `--ozone-platform`. On a Wayland session, both env vars are set and inherited by all child processes — including the Electron process running with `--ozone-platform=x11`. So even under XWayland, `IsRunningUnderWayland()` returns `true`, PipeWire is selected, and xdg-desktop-portal authorization is required before `desktopCapturer.getSources()` returns any results.

Without `--use-fake-ui-for-media-stream` (which was removed from XWayland in PR #2190 to fix camera), that portal auth never happens and `getSources()` returns empty silently — causing the empty screen picker reported in #2217.

The Chromium check that enables PipeWire is:

```cpp
if (options.allow_pipewire() && DesktopCapturer::IsRunningUnderWayland())
```

Disabling `WebRTCPipeWireCapturer` sets `options.allow_pipewire()` to `false`, short-circuiting the check before the env var is even read. This forces the X11 screengrab path on XWayland, making `getSources()` return results without any portal authorization. Camera and mic permissions are completely unaffected because this flag only controls the screen capture backend, not the `getUserMedia()` permission path.

Note: `WebRTCPipeWireCapturer` has been enabled by default since Chromium 110 (2023). The previous code that explicitly enabled it was dead code — the flag had expired at M120. This change replaces that no-op enable with a targeted disable for the XWayland case.

---

### Flag 4: `--use-fake-ui-for-media-stream` (Native Wayland only)

**Applied via:** `commandLine.js` in the `!isX11Forced` branch (native Wayland only).

**Decision:** Keep `--use-fake-ui-for-media-stream` for native Wayland. Remove it from XWayland (replaced by Flag 3 above).

**Rationale:** On native Wayland, Chromium's internal permission dialog for media devices causes GPU context binding failures. The flag auto-approves all media requests, bypassing that dialog. On XWayland, this flag caused a different problem: permissions stored through the fake-ui codepath corrupt the video capture service's GPU context provider on subsequent launches (issue #2169 — camera worked only on first launch after clearing Local Storage). Flag 3 (`--disable-features=WebRTCPipeWireCapturer`) replaces the need for this flag on XWayland.

---

### Flag 5: `--disable-features=HardwareMediaKeyHandling`

**Applied via:** `commandLine.js` `addSwitchesBeforeConfigLoad()`, unconditionally on all platforms.

**Decision:** Always disable hardware media key handling.

**Rationale:** System media keys (play/pause/stop) conflict with Teams' internal media controls. This flag prevents system media key handlers from intercepting keys that Teams needs to manage calls. Not Wayland-specific.

---

## Consequences

### Positive

- Screen sharing now works on XWayland without `--use-fake-ui-for-media-stream` (fixes #2217)
- Camera continues to work across sessions on XWayland (preserves the #2169 fix)
- The `WebRTCPipeWireCapturer` dead-code enable block and its misleading warning are removed
- Native Wayland users are unaffected — the `--disable-features` flag is only applied when `isX11Forced`

### Negative

- XWayland users no longer get PipeWire screen capture — they get the X11 screengrab path. This is correct behavior (XWayland renders through X11), but it means PipeWire-based features like portal integration for screen capture are not available in XWayland mode.
- Native Wayland still requires `--use-fake-ui-for-media-stream`, which is a blunt flag that auto-approves all media requests. This is acceptable for now but should be revisited if Electron adds a more targeted permission API.

### Neutral

- The `disable-features` switch merge logic reads the existing value before appending, ensuring `HardwareMediaKeyHandling` (set earlier in `addSwitchesBeforeConfigLoad`) is preserved alongside `WebRTCPipeWireCapturer`.
- The `WebRTCPipeWireCapturer` flag name remains correct in Chromium 144 (Electron 40) despite the underlying feature being the default since Chromium 110 — disabling it still works.

## Alternatives Considered

### Option A: Re-enable `--use-fake-ui-for-media-stream` for XWayland (PR #2219)

Fixes #2217 (screen sharing) by restoring the flag to XWayland. Rejected because it directly reintroduces #2169 (camera GPU context corruption on subsequent launches). The flag stores permissions through a path incompatible with the video capture service's GPU context binding when sessions persist.

### Option B: `session.setPermissionRequestHandler()` for camera/mic

Hypothesis: granting `media` permissions through Electron's permission layer rather than Chromium's fake-ui path would avoid the GPU context corruption. Rejected as insufficient on its own — even if it fixes camera persistence, it does not address `getSources()` returning empty on XWayland. Would need to be combined with another fix for screen sharing.

### Option C: Override `XDG_SESSION_TYPE=x11` in process environment

Setting `process.env.XDG_SESSION_TYPE = 'x11'` before Chromium initializes would cause `IsRunningUnderWayland()` to return `false`, routing screen capture through X11. Rejected because it is a broader instrument than needed: it affects all process code that reads `XDG_SESSION_TYPE` (clipboard, file pickers, other portal-dependent features), not just screen capture. Option F achieves the same outcome with a narrower blast radius.

### Option D: Accept the trade-off and document it

XWayland users lose screen sharing, native Wayland users risk GPU issues. Rejected as the permanent solution — Option F provides a clean fix that satisfies both.

### Option E: Defer StreamSelector until after portal auth completes

The portal auth is not triggered at all without `--use-fake-ui-for-media-stream` — `getSources()` returns empty silently rather than showing a portal dialog. Deferring the picker cannot solve the problem because auth never happens.

## Related

- [ADR-001 - DesktopCapturer Source ID Format](001-desktopcapturer-source-id-format.md)
- [ADR-008 - useSystemPicker Rejection](008-usesystempicker-electron-38.md)
- [Wayland Optimizations Audit](../research/wayland-optimizations-audit.md)
- [Issue #2217 - Screen sharing broken on XWayland](https://github.com/IsmaelMartinez/teams-for-linux/issues/2217)
- [Issue #2169 - Camera broken under XWayland with GPU disabled](https://github.com/IsmaelMartinez/teams-for-linux/issues/2169)
- [PR #2190 - Fix: keep GPU enabled under XWayland](https://github.com/IsmaelMartinez/teams-for-linux/pull/2190)
- [WebRTC `DesktopCapturer::IsRunningUnderWayland()` source](https://chromium.googlesource.com/external/webrtc/+/master/modules/desktop_capture/desktop_capturer.cc)
