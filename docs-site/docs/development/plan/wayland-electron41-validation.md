# Wayland Native Mode Validation — Electron 41

## Goal

Determine whether Electron 41 (Chromium 146) is stable enough under native Wayland (`--ozone-platform=wayland`) to replace the forced X11 default (`--ozone-platform=x11`) with auto-detection (`--ozone-platform=auto`).

If validation passes, the single-line change in `package.json` (`executableArgs: ["--ozone-platform=auto"]`) eliminates the need for separate X11/Wayland builds, desktop file edits, or CLI overrides.

## Background

Since v2.7.4, Teams for Linux forces X11 mode to avoid Electron 38+ native Wayland regressions (blank windows, resize bugs, screen-sharing failures). Electron 41.2.0 shipped in v2.8.0 with upstream Ozone/Wayland improvements, but the forced X11 default was kept because no native-Wayland validation was performed.

**Related issues to validate against:**

| Issue | Bug | Introduced | Fixed by X11 forcing? |
|-------|-----|-----------|----------------------|
| [#1604](https://github.com/IsmaelMartinez/teams-for-linux/issues/1604) | Blank/black window on Wayland | Electron 38 | Yes |
| [#1494](https://github.com/IsmaelMartinez/teams-for-linux/issues/1494) | Blank window variant | Electron 38 | Yes |
| [#2094](https://github.com/IsmaelMartinez/teams-for-linux/issues/2094) | Maximized window has gaps / resizes on focus loss | Electron 38 | Yes |
| [#1943](https://github.com/IsmaelMartinez/teams-for-linux/issues/1943) | CSD window sizing on GNOME/Wayland | Electron 38+ | Untested |
| [#1787](https://github.com/IsmaelMartinez/teams-for-linux/issues/1787) | Blurry UI with fractional scaling | X11 mode causes this | N/A (X11 limitation) |
| [#2345](https://github.com/IsmaelMartinez/teams-for-linux/issues/2345) | Incoming call crash | Unknown | Untested |
| [#2335](https://github.com/IsmaelMartinez/teams-for-linux/issues/2335) | Fedora typing issues | Unknown | Untested |
| [#2169](https://github.com/IsmaelMartinez/teams-for-linux/issues/2169) | Camera broken under XWayland | Electron 38+ | Mitigated via `wayland.xwaylandOptimizations` |

## Phase 1: Automated smoke tests (cross-distro infrastructure)

Uses the existing Docker-based cross-distro test infrastructure. No code changes needed — just run the Wayland containers and observe.

### Prerequisites

- Docker and Docker Compose installed
- Cross-distro images built: `cd tests/cross-distro && docker compose build`

### Steps

**1. Run smoke tests on all three Wayland containers:**

```bash
cd tests/cross-distro

# Start the three native-Wayland containers (uses --ozone-platform=wayland via start-wayland.sh)
docker compose up -d ubuntu-wayland fedora-wayland debian-wayland

# Wait for startup, then run smoke checks
./scripts/smoke-check.sh cross-distro-ubuntu-wayland-1 120
./scripts/smoke-check.sh cross-distro-fedora-wayland-1 120
./scripts/smoke-check.sh cross-distro-debian-wayland-1 120
```

**2. Record results:**

| Container | Smoke result | Log size | Crash signatures? |
|-----------|-------------|----------|-------------------|
| ubuntu-wayland | | | |
| fedora-wayland | | | |
| debian-wayland | | | |

**3. Check for blank-window regression (#1604/#1494):**

Open each container's noVNC in a browser and verify the app window is visible (not blank/black/white):

- Ubuntu Wayland: `http://localhost:6082/vnc.html`
- Fedora Wayland: `http://localhost:6085/vnc.html`
- Debian Wayland: `http://localhost:6088/vnc.html`

| Container | Window visible? | Login page renders? |
|-----------|----------------|-------------------|
| ubuntu-wayland | | |
| fedora-wayland | | |
| debian-wayland | | |

### Phase 1 pass criteria

All three containers must:

- Pass smoke check (log > 500 bytes, no crash signatures)
- Show a visible, non-blank app window in noVNC

If any container fails Phase 1, **stop here** — native Wayland is not ready and forced X11 should remain.

## Phase 2: Manual interactive testing

Requires an authenticated Microsoft account. Uses the cross-distro login flow.

### Steps

**1. Create a login session (pick one distro):**

```bash
cd tests/cross-distro
./run.sh ubuntu wayland --login
```

Open noVNC (`http://localhost:6082/vnc.html`), log into Teams, wait for full load, then Ctrl+C to save the session.

**2. Test each issue manually:**

| Test | How to verify | Pass? | Notes |
|------|--------------|-------|-------|
| **Window renders** (#1604/#1494) | App window shows Teams UI, not blank/black | | |
| **Maximize** (#2094) | Click maximize — window fills screen, no gaps. Alt-tab away and back — window stays maximized | | |
| **CSD sizing** (#1943) | On GNOME: resize window by dragging edges. Title bar decorations align correctly | | |
| **Fractional scaling** (#1787) | Set display to 125% scaling. Text and UI should be sharp, not blurry | | |
| **Typing** (#2335) | Type a message in a chat. All keystrokes register, no dropped/duplicated characters | | |
| **Screen sharing** | Start a call, share screen. Desktop picker appears via PipeWire, shared content visible to other party | | |
| **Incoming call** (#2345) | Receive a call. Notification appears, accepting the call works without crash | | |
| **Camera** (#2169) | In a call, toggle camera on. Video preview shows correctly | | |
| **Tray icon** | Tray icon appears and updates with unread count | | |
| **Notifications** | Receive a message while minimized. Desktop notification appears | | |

### Phase 2 pass criteria

- All tests in the table above must pass on at least Ubuntu Wayland
- Fedora and Debian are stretch goals (nice to validate, not blockers)
- If **screen sharing** or **incoming call** fails, native Wayland is not ready for default — keep X11, consider Option B (dual .desktop)

## Phase 3: XWayland regression check

Switching to `--ozone-platform=auto` means XWayland sessions (where Wayland session + X11 rendering was the norm) will now get native Wayland instead. Verify this doesn't break existing XWayland users.

```bash
cd tests/cross-distro
./run.sh ubuntu xwayland --login
```

Repeat the Phase 2 test table for XWayland. Pay special attention to camera (#2169) since XWayland optimizations were specifically added for that path.

## Decision matrix

| Phase 1 | Phase 2 | Phase 3 | Decision |
|---------|---------|---------|----------|
| All pass | All pass | All pass | Switch `executableArgs` to `["--ozone-platform=auto"]` |
| All pass | Most pass, screen-share or calls fail | - | Keep X11 default, ship dual `.desktop` (Option B) so Wayland users can opt in |
| Any fail | - | - | Keep forced X11, revisit on next Electron upgrade |

## Implementation (if validation passes)

Single change in `package.json`:

```diff
 "linux": {
   "executableArgs": [
-    "--ozone-platform=x11"
+    "--ozone-platform=auto"
   ],
```

```diff
 "snap": {
   "executableArgs": [
-    "--ozone-platform=x11"
+    "--ozone-platform=auto"
   ],
```

The runtime Wayland detection in `app/startup/commandLine.js` (PipeWire, GPU handling, fake media UI) continues to work as-is — it already checks `XDG_SESSION_TYPE` and `ozone-platform` switch value at runtime.

Also update:

- `docs-site/docs/troubleshooting.md` — remove/update the "forced X11 since v2.7.4" info box
- `docs-site/docs/configuration.md` — update Wayland section
- `tests/cross-distro/scripts/entrypoint.sh` — update comment at line 79-81
