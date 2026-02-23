# Wayland Optimizations Audit

:::info Analysis
Research into current Wayland workarounds, their continued necessity, and recommendations for simplification. Prompted by [Issue #2221](https://github.com/IsmaelMartinez/teams-for-linux/issues/2221) (camera/mic crash on Wayland).
:::

**Date:** 2026-02-23
**Current Version:** Electron 39.5.1 (Chromium 142)
**Upcoming Version:** Electron 40.4.0 (Chromium 144)

---

## Context: Issue #2221

[Issue #2221](https://github.com/IsmaelMartinez/teams-for-linux/issues/2221) reports a crash when using camera or microphone during meetings on v2.7.7 (AUR -bin package, Wayland session). The reporter tested both native Wayland and XWayland modes with identical results. The issue persists in v2.7.8.

This crash is distinct from [Issue #2169](https://github.com/IsmaelMartinez/teams-for-linux/issues/2169) (camera broken due to GPU being disabled under XWayland), which was fixed in PR #2190. The #2221 crash occurs regardless of display mode, suggesting the root cause may not be Wayland-specific but could be exacerbated by the Wayland workarounds.

---

## Current Wayland Workarounds Inventory

The project applies several Wayland-specific flags and workarounds. Here is an audit of each one.

### 1. `--ozone-platform=x11` (Force XWayland)

**Location:** `package.json` lines 98-100 (Linux) and 142-144 (Snap) via `executableArgs`

**What it does:** Forces the app to run through XWayland instead of native Wayland, even on Wayland sessions.

**Why it was added (v2.7.4):** Electron 38 changed the default ozone platform from `x11` to `auto`, causing the app to run as a native Wayland client. This triggered widespread regressions: blank/black windows ([#1604](https://github.com/IsmaelMartinez/teams-for-linux/issues/1604), [#1494](https://github.com/IsmaelMartinez/teams-for-linux/issues/1494)), window sizing issues ([#2094](https://github.com/IsmaelMartinez/teams-for-linux/issues/2094)), and GPU rendering failures.

**Still needed?** **Yes.** Native Wayland GPU acceleration remains broken upstream:

- NVIDIA + native Wayland: GPU acceleration does not work ([Chromium issue 350117524](https://issues.chromium.org/issues/350117524)), producing "Unsupported modifier, resource creation failed" errors.
- AMD + native Wayland: Fedora 42 users report broken GPU acceleration with only software rendering available.
- Kernel 6.12+ regression: Electron apps fail to start on Wayland entirely on some configurations ([NixOS/nixpkgs#382612](https://github.com/NixOS/nixpkgs/issues/382612)).
- VMs without GPU: Wayland windows don't appear at all ([electron/electron#48321](https://github.com/electron/electron/issues/48321)).
- Electron has **zero dedicated Wayland tests** ([electron/electron#48441](https://github.com/electron/electron/issues/48441)) -- the baseline test spec initiative is still in early discussion.

**Recommendation:** **Keep.** Removing this prematurely would break the app for a large portion of users. Revisit when Chromium's Wayland GPU story stabilizes and Electron adds baseline Wayland test coverage.

**Trade-off:** Users with fractional scaling on Wayland get blurry text under XWayland ([#1787](https://github.com/IsmaelMartinez/teams-for-linux/issues/1787)). They can override to `--ozone-platform=wayland` manually, which is documented in `docs-site/docs/troubleshooting.md`.

---

### 2. GPU Auto-Disable on Native Wayland

**Location:** `app/startup/commandLine.js` lines 28-48

**What it does:** When running on Wayland (`XDG_SESSION_TYPE=wayland`):

- If user explicitly set `disableGpu` via CLI or config: respect that choice
- If X11 is forced (`--ozone-platform=x11`): keep GPU **enabled** (XWayland handles GPU correctly)
- If native Wayland (no X11 force): set `config.disableGpu = true` to avoid blank window / crash

**Why it was added:** Native Wayland rendering with GPU enabled caused blank windows and crashes. Disabling GPU was the workaround. Issue #2169 then revealed that GPU must stay enabled under XWayland for camera to work, leading to the current conditional logic.

**Still needed?** **Partially.** Since the default is now `--ozone-platform=x11`, the native Wayland GPU disable path only triggers when a user manually overrides to `--ozone-platform=wayland` or `--ozone-platform=auto`. In that case, GPU issues on native Wayland are still real (see section 1 above), so the fallback is valuable.

**Recommendation:** **Keep the conditional logic.** It correctly handles the three scenarios (user explicit, XWayland, native Wayland) and protects users who override to native Wayland. The `disableGpuExplicitlySet` tracking in `app/config/index.js:595-599` is well-designed.

---

### 3. `--enable-features=WebRTCPipeWireCapturer`

**Location:** `app/startup/commandLine.js` lines 50-62

**What it does:** Enables PipeWire-based screen capture when running under Wayland.

**Why it was added:** PipeWire is the standard screen capture mechanism on Wayland. Without it, screen sharing fails entirely on Wayland sessions.

**Still needed?** **No.** `WebRTCPipeWireCapturer` has been **enabled by default since Chromium 110** (early 2023). The `chrome://flags` entry for this flag **expired around Chromium 120** ([Chromium issue 40284380](https://issues.chromium.org/issues/40284380)). On Chromium 142 (Electron 39), passing the flag is harmless but entirely redundant -- the feature is baked into default behavior.

**Note:** The Electron 40 migration research doc (`electron-40-migration-research.md:168`) states this flag is "still valid in Chromium 144." This is technically true (the flag name compiles), but the feature it controls has been the default for 30+ Chromium versions. Passing it has no effect.

**Recommendation:** **Remove.** This is dead code. Removing it simplifies the startup logic and eliminates the misleading warning about adding `WebRTCPipeWireCapturer` to custom feature lists (lines 54-58), which could confuse users into thinking they need to do something they don't.

**Important distinction:** There is a *different* flag called `WebRtcPipeWireCamera` for PipeWire **camera** support (not screen sharing). This flag is NOT enabled by default and its expiry keeps being extended (currently milestone 150+). The project does not currently use this flag.

---

### 4. `--use-fake-ui-for-media-stream`

**Location:** `app/startup/commandLine.js` lines 64-71

**What it does:** Tells Chromium's `MediaStreamUIController` to auto-approve all media device requests (camera, microphone, display capture) without showing any UI. Currently only applied on native Wayland (the `!isX11Forced` guard on line 69).

**Why it was added:** On native Wayland, Chromium's internal permission dialog caused GPU context binding failures in the video capture service. The flag bypasses that dialog entirely.

**Why it was restricted to native Wayland (v2.7.x):** [Issue #2169](https://github.com/IsmaelMartinez/teams-for-linux/issues/2169) revealed that applying this flag on XWayland causes the video capture service to fail to bind its GPU context provider (`Bind context provider failed`), breaking camera in meetings. The `!isX11Forced` guard was added in PR #2190 to fix this.

**The conflict with issue #2217:** [Issue #2217](https://github.com/IsmaelMartinez/teams-for-linux/issues/2217) reports screen sharing is broken on XWayland since v2.7.7. The cause is precisely the `!isX11Forced` guard: without the flag, Chromium shows its own internal dialog for `getDisplayMedia()` on XWayland, which either fails silently or triggers duplicate xdg-desktop-portal requests on top of the app's custom source picker. [PR #2219](https://github.com/IsmaelMartinez/teams-for-linux/pull/2219) proposes re-enabling the flag for XWayland to fix this — but that would directly reintroduce the #2169 camera regression.

**Root cause of the conflict (confirmed):** WebRTC's `DesktopCapturer::IsRunningUnderWayland()` in Chromium source checks only `XDG_SESSION_TYPE` and `WAYLAND_DISPLAY` — it has zero coupling to `--ozone-platform`. On a Wayland session both env vars are inherited by the Electron process, so even under `--ozone-platform=x11` (XWayland), Chromium selects PipeWire as the screen capture backend and portal authorization is required. The flag is a blunt instrument that applies to every media request — `getUserMedia()` (camera/mic) and `getDisplayMedia()` (screen sharing) alike.

**Recommendation:** **Do not toggle this flag back and forth.** The most targeted fix is to explicitly disable `WebRTCPipeWireCapturer` when running under XWayland (`isX11Forced`), which short-circuits the PipeWire backend selection before `IsRunningUnderWayland()` is even called. This forces X11 screen capture on XWayland without affecting camera/mic permissions. See the [setDisplayMediaRequestHandler research](set-display-media-request-handler-research.md) for the full investigation including the `--disable-features=WebRTCPipeWireCapturer` approach.

---

### 5. `--disable-features=HardwareMediaKeyHandling`

**Location:** `app/startup/commandLine.js` lines 14-24

**What it does:** Prevents system media keys (play/pause/stop) from conflicting with Teams' internal media controls.

**Not Wayland-specific.** This flag is applied unconditionally on all platforms.

**Still needed?** **Yes.** This is still valid in Chromium 144 and prevents a real conflict between system media key handlers and Teams' own media controls.

**Recommendation:** **Keep.** Not related to the Wayland audit.

---

### 6. `--try-supported-channel-layouts`

**Location:** `app/startup/commandLine.js` line 6

**What it does:** Helps audio playback find a working channel layout.

**Not Wayland-specific.** Applied unconditionally.

**Recommendation:** **Keep.** Not related to the Wayland audit.

---

### 7. `--autoplay-policy=no-user-gesture-required`

**Location:** `app/startup/commandLine.js` lines 8-12

**What it does:** Allows audio playback without a prior user gesture. Needed for notification sounds.

**Not Wayland-specific.** Applied unconditionally.

**Recommendation:** **Keep.** Not related to the Wayland audit.

---

## Relationship to Issue #2221

The camera/mic crash in #2221 occurs on **both** native Wayland and XWayland, which suggests the Wayland workarounds are not the direct cause. Possible explanations:

1. **Not a Wayland-specific bug:** The crash may be caused by something else entirely (Teams web app changes, Electron 39 regression, etc.). The user's system happens to be Wayland but the bug manifests on both display modes.

2. **The `WebRTCPipeWireCapturer` flag interference:** Though unlikely, explicitly enabling an already-default feature flag *could* theoretically interact poorly with other `--enable-features` flags the user passes. Removing the redundant flag (recommendation 3 above) would eliminate this possibility.

3. **GPU state inconsistency:** If the user's configuration triggers an unexpected path through the GPU disable logic (e.g., `disableGpuExplicitlySet` gets set incorrectly), GPU could be disabled under XWayland, reproducing the #2169 camera failure. Worth investigating the user's debug logs for GPU-related errors.

**Action for #2221:** Request the user's debug logs and check for:

- `Bind context provider failed` errors (GPU disabled under XWayland, as in #2169)
- The startup log lines showing which Wayland path was taken ("Running under Wayland with forced X11 mode" vs "Running under Wayland, disabling GPU composition")
- Whether the user has any `electronCLIFlags` or `disableGpu` in their config

---

## Summary of Recommendations

| Flag/Workaround | Action | Rationale |
|-----------------|--------|-----------|
| `--ozone-platform=x11` (package.json) | **Keep** | Native Wayland GPU still broken upstream |
| GPU auto-disable conditional logic | **Keep** | Protects users who override to native Wayland |
| `WebRTCPipeWireCapturer` enable-feature | **Remove** (after #2217 resolved) | Default since Chromium 110, flag expired at M120; remove after #2217 fix is confirmed to avoid changing two variables simultaneously |
| `--use-fake-ui-for-media-stream` | **Do not toggle** | Conflicts with #2169 (camera) and #2217 (screen sharing) — proper fix is `--disable-features=WebRTCPipeWireCapturer` when `isX11Forced` |
| `HardwareMediaKeyHandling` disable | **Keep** | Not Wayland-specific, still needed |

### Immediate Action

1. **Do not merge PR #2219 as-is.** Re-enabling `--use-fake-ui-for-media-stream` for XWayland fixes #2217 (screen sharing) but reintroduces #2169 (camera broken).
2. **Update `electron-40-migration-research.md`** to note `WebRTCPipeWireCapturer` is redundant (not just "still valid").

### Near-Term Priority

**Test `--disable-features=WebRTCPipeWireCapturer` when `isX11Forced`** as the fix for the #2169 vs #2217 conflict. `DesktopCapturer::IsRunningUnderWayland()` (confirmed via Chromium source) selects PipeWire based on `XDG_SESSION_TYPE` and `WAYLAND_DISPLAY` — completely independently of `--ozone-platform`. Disabling the feature flag short-circuits PipeWire selection before the env var check, forcing X11 screen capture on XWayland without affecting camera/mic permissions. If this works, `--use-fake-ui-for-media-stream` can be removed entirely and the `WebRTCPipeWireCapturer` enable-feature becomes dead code.

Note: `session.setDisplayMediaRequestHandler()` is **already implemented** at `app/mainAppWindow/index.js:264` — it is not a fix to implement. See the [setDisplayMediaRequestHandler research](set-display-media-request-handler-research.md) for the full investigation.

### Medium-Term (When Upstream Stabilizes)

1. **Switch from `--ozone-platform=x11` to `--ozone-platform=auto`** once Chromium's native Wayland GPU support is reliable. Track via [Chromium issue 350117524](https://issues.chromium.org/issues/350117524) and [Electron baseline Wayland specs #48441](https://github.com/electron/electron/issues/48441).
2. **Consider `WebRtcPipeWireCamera`** flag for native PipeWire camera support (currently not default, tracked upstream).

---

## References

- [Issue #2221 - Camera/mic crash](https://github.com/IsmaelMartinez/teams-for-linux/issues/2221)
- [Issue #2217 - Screen sharing broken on Wayland/XWayland](https://github.com/IsmaelMartinez/teams-for-linux/issues/2217)
- [Issue #2169 - Camera broken under XWayland with GPU disabled](https://github.com/IsmaelMartinez/teams-for-linux/issues/2169)
- [PR #2190 - Fix: keep GPU enabled under XWayland](https://github.com/IsmaelMartinez/teams-for-linux/pull/2190)
- [PR #2207 - Remove redundant second getSources() call (open)](https://github.com/IsmaelMartinez/teams-for-linux/pull/2207)
- [PR #2219 - Screen sharing regression fix (do not merge as-is)](https://github.com/IsmaelMartinez/teams-for-linux/pull/2219)
- [WebRTC `DesktopCapturer::IsRunningUnderWayland()` source](https://chromium.googlesource.com/external/webrtc/+/master/modules/desktop_capture/desktop_capturer.cc)
- [Electron #37524 - Desktop Capturer not consistently using PipeWire on Wayland](https://github.com/electron/electron/issues/37524)
- [setDisplayMediaRequestHandler Research](set-display-media-request-handler-research.md)
- [Electron 38.0.0 Release (ozone-platform auto default)](https://www.electronjs.org/blog/electron-38-0)
- [Electron 39.0.0 Release](https://www.electronjs.org/blog/electron-39-0)
- [Electron #48441 - Baseline Wayland test specs](https://github.com/electron/electron/issues/48441)
- [Electron #48321 - Wayland windows in VMs without GPU](https://github.com/electron/electron/issues/48321)
- [Chromium 350117524 - NVIDIA Wayland GPU broken](https://issues.chromium.org/issues/350117524)
- [Chromium 40284380 - WebRTCPipeWireCapturer flag expired](https://issues.chromium.org/issues/40284380)
- [NixOS/nixpkgs#382612 - Kernel 6.12+ Wayland regression](https://github.com/NixOS/nixpkgs/issues/382612)
- [ADR-008 - useSystemPicker rejection](../adr/008-usesystempicker-electron-38.md)
