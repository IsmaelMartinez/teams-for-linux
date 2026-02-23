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

**What it does:** Bypasses Chromium's internal media permission dialog, auto-granting camera/microphone access without user interaction. Only applied on native Wayland (not XWayland).

**Why it was added:** On native Wayland, the normal Chromium permission dialog had issues with GPU context binding for video capture. The fake UI avoids that codepath.

**Still needed?** **Questionable.** This flag only applies when running native Wayland (the `!isX11Forced` check on line 69 correctly skips it for XWayland). Since the default is now XWayland, this flag rarely activates in practice. When it does activate (user overrides to native Wayland), there are concerns:

- It auto-grants camera/mic permissions without user consent, which is a security/privacy concern
- The better Electron pattern is `session.setPermissionRequestHandler()` to programmatically handle permissions
- The GPU context binding issues it works around may no longer apply on Chromium 142+

**Recommendation:** **Keep for now, but flag for future removal.** It only fires on native Wayland (rare path), and users who override to native Wayland are already opting into a less-stable experience. Consider replacing with `session.setPermissionRequestHandler()` when migrating to native Wayland as default.

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
| `WebRTCPipeWireCapturer` enable-feature | **Remove** | Default since Chromium 110, flag expired at M120 |
| `--use-fake-ui-for-media-stream` | **Keep (flag for future)** | Rare path, but safety net for native Wayland users |
| `HardwareMediaKeyHandling` disable | **Keep** | Not Wayland-specific, still needed |

### Immediate Action

1. **Remove `WebRTCPipeWireCapturer`** flag and its associated warning logic from `commandLine.js` lines 50-62. This is safe cleanup.
2. **Update `electron-40-migration-research.md`** line 168 to note the flag is redundant (not just "still valid").

### Medium-Term (When Upstream Stabilizes)

1. **Switch from `--ozone-platform=x11` to `--ozone-platform=auto`** once Chromium's native Wayland GPU support is reliable. Track via [Chromium issue 350117524](https://issues.chromium.org/issues/350117524) and [Electron baseline Wayland specs #48441](https://github.com/electron/electron/issues/48441).
2. **Replace `--use-fake-ui-for-media-stream`** with `session.setPermissionRequestHandler()` for proper programmatic permission handling.
3. **Consider `WebRtcPipeWireCamera`** flag for native PipeWire camera support (currently not default, tracked upstream).
4. **Consider screen sharing modernization**: Migrate from `desktopCapturer.getSources()` to `navigator.mediaDevices.getDisplayMedia()` with `session.setDisplayMediaRequestHandler()`, as other Electron apps (Jitsi Meet) have done.

---

## References

- [Issue #2221 - Camera/mic crash](https://github.com/IsmaelMartinez/teams-for-linux/issues/2221)
- [Issue #2169 - Camera broken under XWayland with GPU disabled](https://github.com/IsmaelMartinez/teams-for-linux/issues/2169)
- [PR #2190 - Fix: keep GPU enabled under XWayland](https://github.com/IsmaelMartinez/teams-for-linux/pull/2190)
- [Electron 38.0.0 Release (ozone-platform auto default)](https://www.electronjs.org/blog/electron-38-0)
- [Electron 39.0.0 Release](https://www.electronjs.org/blog/electron-39-0)
- [Electron #48441 - Baseline Wayland test specs](https://github.com/electron/electron/issues/48441)
- [Electron #48321 - Wayland windows in VMs without GPU](https://github.com/electron/electron/issues/48321)
- [Chromium 350117524 - NVIDIA Wayland GPU broken](https://issues.chromium.org/issues/350117524)
- [Chromium 40284380 - WebRTCPipeWireCapturer flag expired](https://issues.chromium.org/issues/40284380)
- [NixOS/nixpkgs#382612 - Kernel 6.12+ Wayland regression](https://github.com/NixOS/nixpkgs/issues/382612)
- [ADR-008 - useSystemPicker rejection](../adr/008-usesystempicker-electron-38.md)
