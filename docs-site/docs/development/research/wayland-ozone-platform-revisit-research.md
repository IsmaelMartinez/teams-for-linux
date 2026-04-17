# Wayland Ozone Platform Revisit Research

**Status:** Research complete, ready for implementation validation
**Created:** 2026-04-17
**Related Issues:** [#1604](https://github.com/IsmaelMartinez/teams-for-linux/issues/1604), [#1494](https://github.com/IsmaelMartinez/teams-for-linux/issues/1494), [#519](https://github.com/IsmaelMartinez/teams-for-linux/issues/519), [#504](https://github.com/IsmaelMartinez/teams-for-linux/issues/504), [#2094](https://github.com/IsmaelMartinez/teams-for-linux/issues/2094), [#1787](https://github.com/IsmaelMartinez/teams-for-linux/issues/1787), [#1943](https://github.com/IsmaelMartinez/teams-for-linux/issues/1943), [#2345](https://github.com/IsmaelMartinez/teams-for-linux/issues/2345), [#2335](https://github.com/IsmaelMartinez/teams-for-linux/issues/2335), [#2169](https://github.com/IsmaelMartinez/teams-for-linux/issues/2169)

## Context

Since v2.7.4, Teams for Linux forces X11 rendering mode via `--ozone-platform=x11` baked into `executableArgs` in `package.json`. This decision was made to sidestep severe Electron 38+ native Wayland regressions (blank/black windows, window sizing bugs, screen-sharing failures).

With v2.8.0 bumping to Electron 41.2.0 (Chromium 146, Node.js 24), upstream Ozone/Wayland improvements may have resolved the blockers. This research evaluates whether Teams for Linux should:

1. Keep the forced X11 default (status quo)
2. Ship separate X11 and Wayland builds
3. Ship a single build with multiple `.desktop` launchers
4. Switch the default to `--ozone-platform=auto` and let Electron detect

## Current State Analysis

### How the X11 default is enforced

The flag is baked into the `.desktop` file's `Exec=` line via `electron-builder`:

- `package.json:102-104` — `build.linux.executableArgs: ["--ozone-platform=x11"]` applies to deb/rpm/tar.gz/AppImage
- `package.json:146-148` — `build.snap.executableArgs: ["--ozone-platform=x11"]` applies to snap

**Critical constraint**: `--ozone-platform` must be set **before** Electron initializes. JS code loading after process start cannot override it. This is why the flag is baked at build time, not detected at runtime.

### Runtime Wayland detection (`app/startup/commandLine.js`)

The app already detects Wayland sessions at runtime (line 28: `process.env.XDG_SESSION_TYPE === "wayland"`) and applies platform-specific tweaks:

- PipeWire enabled (required for Wayland screen sharing)
- GPU auto-disabled to prevent blank windows (overridable via `disableGpu` config)
- Fake media UI flag for screen sharing (skippable via `wayland.xwaylandOptimizations`)
- XWayland detection (when forced X11 runs on a Wayland session)

This logic continues to work regardless of the ozone-platform value — it only governs the non-ozone flags.

### Open issues mapped to display mode

| Issue | Bug | Caused by |
|-------|-----|-----------|
| #1604, #1494, #519, #504 | Blank/black window | Native Wayland under Electron 38+ |
| #2094 | Maximized window has gaps / resizes on focus loss | Native Wayland under Electron 38+ |
| #1943 | CSD window sizing on GNOME/Wayland | Native Wayland (Electron 38+, possibly fixed in 41) |
| #2345 | Incoming call crash | Untested, possibly Wayland-related |
| #2335 | Fedora typing issues | Untested, possibly Wayland-related |
| #1787 | Blurry UI with fractional scaling | **X11 mode** — X11 does not honor Wayland fractional scaling |
| #2169 | Camera broken under XWayland | XWayland-specific, mitigated via `wayland.xwaylandOptimizations` |

## Options Considered

### Option A: Parallel package tracks (`teams-for-linux` + `teams-for-linux-wayland`)

Two fully separate packages with different `appId`, `executableName`, and artifact names. Users install one or the other.

**Pros:** Clear separation; side-by-side install possible.
**Cons:**

- Doubles CI build time and artifact storage (linux_x64/arm64/armv7l × 4 formats)
- Separate snap store listing required (strict confinement doesn't support variants on one listing)
- `electron-updater` needs separate publish channels per variant
- Users switching between sessions lose data (separate user data directories)
- No new capability vs. current setup — just a flag difference

**Verdict:** Rejected. Cost is high, benefit is marginal.

### Option B: Single package, dual `.desktop` entries

One binary, one package, but ship two `.desktop` files:

```ini
# teams-for-linux.desktop
Exec=/usr/bin/teams-for-linux --ozone-platform=x11 %U
Name=Teams for Linux

# teams-for-linux-wayland.desktop
Exec=/usr/bin/teams-for-linux --ozone-platform=wayland %U
Name=Teams for Linux (Wayland)
```

**Pros:**

- No binary duplication, no separate update channels, no user data fork
- Wayland users can opt in without editing files
- Implementable via existing `scripts/afterpack.js` hook

**Cons:**

- AppImage format integrates only the first `.desktop` file — Wayland variant reachable only via CLI on that format
- Snap requires a second `apps:` entry (`teams-for-linux.wayland`) — schema change to snap config
- Users who pick the Wayland entry and hit bugs have no safety net
- Extra launcher visible in every user's menu (some find that noise)

**Verdict:** Viable middle ground, but only worth shipping if native Wayland on Electron 41 is mostly stable.

### Option C: Session-detecting wrapper script

A shell wrapper that checks `XDG_SESSION_TYPE` and picks the ozone flag:

```bash
#!/bin/sh
if [ "$XDG_SESSION_TYPE" = "wayland" ]; then
    exec /opt/teams-for-linux/teams-for-linux-bin --ozone-platform=wayland "$@"
else
    exec /opt/teams-for-linux/teams-for-linux-bin --ozone-platform=x11 "$@"
fi
```

**Pros:** Zero user action; automatic correct mode.
**Cons:**

- Removes the "safe X11 default" for existing users who depend on it
- Awkward for snap (confinement + command: field)
- All-or-nothing — a Wayland user hitting a bug has no X11 fallback from the launcher

**Verdict:** Not recommended unless paired with a `wayland.autoDetect` opt-in config flag (adds complexity for little gain).

### Option D: Switch default to `--ozone-platform=auto`

Single-line change: `executableArgs: ["--ozone-platform=auto"]` in both `linux` and `snap` blocks. Electron's Ozone layer picks Wayland when `XDG_SESSION_TYPE=wayland` is set, X11 otherwise.

**Pros:**

- Simplest possible change — no packaging, `.desktop`, or CI changes
- Matches Electron's upstream recommended default
- Fractional scaling (#1787) works natively
- Users don't need to know about any flags
- Reverts easily if regressions appear

**Cons:**

- Depends on Electron 41's native Wayland being actually stable on the issues listed above
- Requires validation before shipping (blank windows, window management, screen sharing, calls)
- Users on X11 sessions see no change; users on Wayland sessions see behavior change

**Verdict:** Preferred if validation passes.

## Recommendation

**Proceed with Option D (switch default to `auto`), gated on validation.**

The cost of D is ~30 characters in `package.json`. The cost of being wrong is regressing every Wayland user back to blank windows. Therefore: do not ship D without validation.

If validation fails on 1–2 issues that can't be worked around, fall back to **Option B** (dual `.desktop`) so Wayland users can opt in while the safe X11 default protects existing users.

Option A (parallel packages) and Option C (session-detecting wrapper) are not recommended.

## Implementation Plan

### Phase 1 — Validation

Run the validation plan documented at [`wayland-electron41-validation.md`](../plan/wayland-electron41-validation.md). Three phases:

1. **Automated smoke tests** on the three Wayland cross-distro containers (`ubuntu-wayland`, `fedora-wayland`, `debian-wayland`). Already configured with `--ozone-platform=wayland`.
2. **Manual interactive testing** of 10 specific scenarios (window render, maximize, CSD sizing, fractional scaling, typing, screen sharing, incoming call, camera, tray, notifications) mapped to the open issues.
3. **XWayland regression check** to ensure switching from forced X11 to auto doesn't break existing XWayland users (especially camera per #2169).

### Phase 2 — Decision

Based on validation results:

| Outcome | Action |
|---------|--------|
| All phases pass | Change `executableArgs` to `["--ozone-platform=auto"]` in `package.json` (both `linux` and `snap` blocks) |
| Most pass, screen-share or calls regress | Keep X11 forced, ship Option B (dual `.desktop` via `afterpack.js`) for opt-in |
| Multiple failures | Keep forced X11, re-validate on next Electron upgrade |

### Phase 3 — Implementation (if Option D)

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

Also update:

- `docs-site/docs/troubleshooting.md` — update "Wayland / Display Issues" section (remove the "since v2.7.4, X11 is forced" note; document how users can force X11 if needed via `--ozone-platform=x11`)
- `docs-site/docs/configuration.md` — update Wayland section
- `tests/cross-distro/scripts/entrypoint.sh:79-81` — update the comment explaining the override logic (will still be valid for the XWayland case, but no longer applies to Wayland containers)
- Create an ADR capturing the decision (`docs-site/docs/development/adr/020-ozone-platform-default-revision.md` or similar)

### Phase 3 alternative — Implementation (if Option B)

More involved. Changes needed:

- `scripts/afterpack.js`: emit a second `.desktop` file for deb/rpm/tar.gz targets
- AppImage: document that Wayland variant requires CLI flag (AppImage spec ships only one `.desktop`)
- Snap: add second `apps:` entry in generated snapcraft.yaml (requires `electron-builder` snap extraConfig)
- Post-install tests: verify both launchers appear in menu on deb/rpm

## Success Criteria

**Option D (preferred):**

- All Phase 1 smoke tests pass on 3 Wayland distros
- All Phase 2 interactive tests pass on Ubuntu Wayland
- No regression in Phase 3 XWayland tests vs. current forced-X11 behavior
- Post-release: no spike in Wayland-related issues within 2 weeks of v2.9.0

**Option B (fallback):**

- Both `.desktop` entries installed on deb/rpm/tar.gz
- Both entries launch the app with the correct ozone flag
- Documentation clearly explains which to pick

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Electron 41 Wayland is still buggy for Microsoft Teams specifically | Phase 2 interactive testing catches this before shipping |
| Users on distros we don't test (Arch, openSUSE, etc.) see regressions | Document the `--ozone-platform=x11` CLI override prominently in troubleshooting |
| Rolling back requires a new release | `executableArgs` change is a one-line revert; patch release is fast |
| Snap store update lag means snap users get the change later | No mitigation needed; behavior is consistent once delivered |

## Related Work

- [Validation plan](../plan/wayland-electron41-validation.md) — the test procedure for gating the decision
- [ADR-008](../adr/008-usesystempicker-electron-38.md) — context on Linux Wayland/PipeWire limitations in Electron
- [Electron 40 migration research](electron-40-migration-research.md) — prior Electron upgrade analysis
- [Cross-distro testing environment (ADR-016)](../adr/016-cross-distro-testing-environment.md) — the infrastructure this validation relies on

## Historical Context

| Version | Change | Rationale |
|---------|--------|-----------|
| pre-v2.7.4 | Ozone platform not explicitly set; Electron default | Worked acceptably on Electron 37 and earlier |
| v2.7.4 | `--ozone-platform=x11` forced via `executableArgs` | Electron 38+ native Wayland regressions |
| v2.8.0 | Electron 41.2.0 adopted; X11 default retained | Safer to keep during major dependency upgrade |
| v2.9.0 (proposed) | Validate native Wayland, switch to `auto` if stable | Native Wayland improvements in Electron 41 |
