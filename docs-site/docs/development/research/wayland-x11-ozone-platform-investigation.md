# Wayland/X11 Ozone Platform Investigation

**Issue:** Multiple — see [Related Issues](#related-issues)
**Investigation Date:** 2026-02-10
**Status:** Research Complete — Fix Implemented

## Executive Summary

Starting with Electron 38, Chromium changed its default ozone platform behavior to `auto`, meaning Electron apps now run as **native Wayland clients by default** when `XDG_SESSION_TYPE=wayland`. In Electron 39 (our current version, v39.5.1), the `ELECTRON_OZONE_PLATFORM_HINT` environment variable was fully removed. This change has caused widespread regressions across Electron apps on Linux, including blank/black windows, incorrect multi-monitor positioning, maximize/focus bugs, and crashes on certain compositors.

**Key Finding:** Forcing `--ozone-platform=x11` by default is the safest approach. The snap build already did this via `executableArgs`, but deb, rpm, AppImage, and tar.gz builds did not — leaving the majority of users exposed to Wayland regressions. The fix moves `executableArgs` to the shared `linux` configuration so all packaging formats benefit.

**Key Constraint:** The `--ozone-platform` flag **cannot be set at runtime from JavaScript** — it must be passed before the Electron process starts, as Chromium initializes the ozone platform before any application code executes.

## Problem Statement

Multiple open issues report rendering and window management problems that trace back to the Electron 38+ Wayland default change:

- Blank/black windows on Wayland sessions
- Maximized window gaps and focus-loss resizing
- Screen sharing crashes
- Blurry UI with fractional scaling
- Multi-monitor positioning bugs

Users running Wayland (now the default on Ubuntu 22.04+, Fedora 38+, and most modern distros) are affected unless they manually pass `--ozone-platform=x11`.

## What Changed in Electron 38/39

### Timeline

| Version | Change |
|---------|--------|
| Electron < 38 | Default: X11 (XWayland). Apps opt into Wayland via `ELECTRON_OZONE_PLATFORM_HINT=auto` or `--ozone-platform-hint=auto` |
| Electron 38 | Default changed to `auto` (native Wayland when detected). `ELECTRON_OZONE_PLATFORM_HINT` deprecated |
| Electron 39 | `ELECTRON_OZONE_PLATFORM_HINT` env var removed. `--ozone-platform-hint` flag removed. `auto` is the built-in default |

### Upstream Electron Issues

- [electron#48001](https://github.com/electron/electron/issues/48001) — Deprecation and removal of `ELECTRON_OZONE_PLATFORM_HINT`
- [electron#48298](https://github.com/electron/electron/issues/48298) — Electron 38+ does not reliably use Wayland by default (detection bugs)
- [electron#46843](https://github.com/electron/electron/issues/46843) — Multi-monitor input loss on Wayland
- [electron#48749](https://github.com/electron/electron/issues/48749) — Incorrect window positioning on Wayland with multiple displays
- [electron#23063](https://github.com/electron/electron/issues/23063) — Screen sharing crashes under Wayland

## Research Findings

### 1. The `--ozone-platform` flag cannot be set at runtime

This is the critical constraint. The ozone platform is initialized deep in Chromium's startup sequence, **before any Electron JavaScript code executes**. This means:

- `app.commandLine.appendSwitch("ozone-platform", "x11")` in `commandLine.js` would have **no effect** — it runs too late
- The `electronCLIFlags` config mechanism (which calls `app.commandLine.appendSwitch` after config load) also cannot control ozone-platform — this explains [issue #1604](https://github.com/IsmaelMartinez/teams-for-linux/issues/1604) where `["ozone-platform", "wayland"]` in config produced a blank window
- The flag must be passed as a command-line argument to the executable **before** the process starts

This is confirmed by Electron maintainers and other projects (e.g., [VS Code](https://github.com/microsoft/vscode/pull/135191)).

### 2. `executableArgs` in electron-builder

Electron-builder's `executableArgs` option modifies the `Exec=` line in the generated `.desktop` file. This ensures the flag is passed before the Electron process starts.

**Target support:**

| Target | `executableArgs` Support | Mechanism |
|--------|-------------------------|-----------|
| snap | Yes | Wrapper script |
| deb | Yes | `.desktop` file `Exec=` line |
| rpm | Yes | `.desktop` file `Exec=` line |
| AppImage | Yes | `.desktop` file bundled in AppImage |
| tar.gz | Yes | `.desktop` file included in archive |
| Flatpak | Partial | [electron-builder#9523](https://github.com/electron-userland/electron-builder/issues/9523) — fix pending |

### 3. User override mechanisms

If we force X11 by default, users who want native Wayland can override via:

1. **Command line:** `teams-for-linux --ozone-platform=wayland` (last flag wins in Chromium)
2. **Desktop entry edit:** Modify the `Exec=` line in their local `.desktop` file
3. **electron-flags.conf:** Create `~/.config/electron-flags.conf` with `--ozone-platform=wayland`

The `electronCLIFlags` config option **cannot** be used for this because the flag is applied too late (see Finding #1). This should be documented clearly.

### 4. Current state of the codebase

| Component | Status |
|-----------|--------|
| `package.json` snap `executableArgs` | Has `--ozone-platform=x11` |
| `package.json` linux (shared) `executableArgs` | **Missing** — deb/rpm/AppImage/tar.gz unprotected |
| `commandLine.js` Wayland detection | Handles GPU and PipeWire but does not (and cannot) set ozone-platform |
| Documentation | `electronCLIFlags` example shows `["ozone-platform", "wayland"]` which does not actually work |

## Known Wayland Regressions in Electron 38/39

| Regression | Impact | Workaround |
|-----------|--------|------------|
| Blank/black window on launch | App unusable | `--ozone-platform=x11` |
| Multi-monitor input loss | Keyboard/mouse dead on secondary monitors | `--ozone-platform=x11` |
| Incorrect window positioning | Windows appear on wrong monitor | `--ozone-platform=x11` |
| Maximize gaps and focus-loss resizing | Window management broken | `--ozone-platform=x11` |
| Crashes on Hyprland/Sway | SIGILL on certain configurations | `--ozone-platform=x11` |
| NVIDIA driver issues | Segfaults and rendering failures | `--ozone-platform=x11` |
| Blurry UI with fractional scaling | Text and UI elements blurry | `--ozone-platform=wayland` (opposite!) |
| Screen sharing crashes | App crashes on share button | PipeWire + portal configuration |

Note: The blurry UI issue (#1787) is the one case where native Wayland actually helps. Users affected by this specific issue can override to `--ozone-platform=wayland` or `--ozone-platform=auto`.

## Related Issues

### Teams for Linux Issues

| Issue | Title | Status | Related |
|-------|-------|--------|---------|
| [#2094](https://github.com/IsmaelMartinez/teams-for-linux/issues/2094) | Since 2.7.0: Maximized window looks weird | Open | Wayland maximize/focus regression |
| [#2058](https://github.com/IsmaelMartinez/teams-for-linux/issues/2058) | Crashes when clicking share screen button | Closed | Screen sharing on Wayland |
| [#1853](https://github.com/IsmaelMartinez/teams-for-linux/issues/1853) | Screenshare preview does not display image | Closed | Fixed via ADR-001 source ID format |
| [#1787](https://github.com/IsmaelMartinez/teams-for-linux/issues/1787) | Blurry UI on Wayland with fractional scaling | Closed (not planned) | Override to `--ozone-platform=wayland` helps |
| [#1604](https://github.com/IsmaelMartinez/teams-for-linux/issues/1604) | Electron CLI flags give blank window | Open | `electronCLIFlags` cannot set ozone-platform |
| [#1494](https://github.com/IsmaelMartinez/teams-for-linux/issues/1494) | White screen after login | Open | EGL/OpenGL initialization failures |
| [#1323](https://github.com/IsmaelMartinez/teams-for-linux/issues/1323) | Teams doesn't open on Ubuntu 24.04 Wayland | Closed | Wayland connection failures |
| [#891](https://github.com/IsmaelMartinez/teams-for-linux/issues/891) | Cannot launch on Wayland (xdg_wm_base error) | Closed | Wayland protocol errors |
| [#886](https://github.com/IsmaelMartinez/teams-for-linux/issues/886) | Screen sharing crashes under Wayland | Closed | PipeWire requirement |
| [#519](https://github.com/IsmaelMartinez/teams-for-linux/issues/519) | Black window on Wayland | Closed | NVIDIA + Wayland |
| [#504](https://github.com/IsmaelMartinez/teams-for-linux/issues/504) | No main window on native Wayland | Closed | Early Wayland support attempt |

### Upstream Electron Issues

| Issue | Title | Relevance |
|-------|-------|-----------|
| [electron#48001](https://github.com/electron/electron/issues/48001) | Deprecate & remove `ELECTRON_OZONE_PLATFORM_HINT` | Root cause of the default change |
| [electron#48298](https://github.com/electron/electron/issues/48298) | Electron 38+ does not use Wayland by default | Detection bugs in new auto behavior |
| [electron#46843](https://github.com/electron/electron/issues/46843) | Multi-monitor ozone platform hints | Input loss on secondary monitors |
| [electron#48749](https://github.com/electron/electron/issues/48749) | Incorrect window positioning on Wayland | Multi-monitor positioning bugs |
| [electron#23063](https://github.com/electron/electron/issues/23063) | Screen sharing crash under Wayland | Long-standing Wayland screen share issue |

## Implementation

### Decision: Force X11 by default for all Linux targets

The fix adds `--ozone-platform=x11` to the shared `linux.executableArgs` in `package.json`. This ensures all packaging formats (deb, rpm, AppImage, tar.gz) include the flag in their `.desktop` file `Exec=` line, matching the existing snap behavior.

The snap-specific `executableArgs` is removed since it now inherits from the shared `linux` config.

### User override path

Users who want native Wayland can:

1. Launch from terminal: `teams-for-linux --ozone-platform=wayland`
2. Edit their `.desktop` file's `Exec=` line to replace `x11` with `wayland` or `auto`
3. Create `~/.config/electron-flags.conf` with `--ozone-platform=wayland`

### Re-evaluation criteria

Native Wayland should be re-evaluated when:

- Electron upstream fixes the multi-monitor and window positioning regressions
- NVIDIA driver compatibility improves with the Wayland ozone backend
- User feedback indicates Wayland stability has improved sufficiently

Monitor these upstream issues:
- [electron#46843](https://github.com/electron/electron/issues/46843) (multi-monitor)
- [electron#48749](https://github.com/electron/electron/issues/48749) (window positioning)
- [electron#48298](https://github.com/electron/electron/issues/48298) (auto-detection reliability)

## References

- [Electron 38.0.0 Release Notes](https://www.electronjs.org/blog/electron-38-0)
- [Electron Linux Configuration — electron-builder](https://www.electron.build/linux.html)
- [VS Code Wayland/Ozone handling](https://github.com/microsoft/vscode/pull/135191)
- [Arch Linux Electron Package Guidelines](https://wiki.archlinux.org/title/Electron_package_guidelines)
- [ADR-001: DesktopCapturer Source ID Format](../adr/001-desktopcapturer-source-id-format.md) — Related Wayland screen sharing fix
- [ADR-008: useSystemPicker Rejection](../adr/008-usesystempicker-electron-38.md) — Wayland had zero native picker support
