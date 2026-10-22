---
id: 033-native-wayland-default
---

# ADR 033: Native Wayland by Default on deb, rpm and AppImage

## Status

🚧 Proposed (2026-10-22)

Supersedes [ADR-031](031-ozone-platform-x11-default.md) for the deb, rpm and AppImage targets. ADR-031 stays in force for snap.

## Context

ADR-031 kept `--ozone-platform=x11` as the shipped default and listed four conditions for reopening the question. This record goes through them one by one, because the answer has moved on three of the four and the fourth can be sidestepped by scope.

**The Electron baseline.** [PR #2601](https://github.com/IsmaelMartinez/teams-for-linux/pull/2601) was tested on Electron 42.3.0. Main moved to Electron 43.7.0 in [PR #2975](https://github.com/IsmaelMartinez/teams-for-linux/pull/2975) and to 44.9.0 in [PR #2995](https://github.com/IsmaelMartinez/teams-for-linux/pull/2995), two major versions past that baseline. The Flathub beta, which ships no flag and therefore runs native Wayland, reported in [#3018](https://github.com/IsmaelMartinez/teams-for-linux/issues/3018) that on 2.27.0 with Electron 44.9.0 the maximised title bar is back and the tray registers cleanly; those were the two live Flatpak window-management complaints of September.

**The snap gate.** ADR-031 wanted the snap on a production core24 base before any default moved. That migration was reverted in [PR #2906](https://github.com/IsmaelMartinez/teams-for-linux/pull/2906) and is not close. This ADR does not touch the snap: its own `executableArgs` block keeps `--ozone-platform=x11`, so the snap's blast radius is exactly what it was. The deb, rpm and AppImage never depended on the snap base, and gating them on it only coupled two unrelated rollouts.

**What XWayland costs today.** Three defects are structural to running an X11 client on a Wayland session and no app code can fix them:

- Links do not raise the browser. Chromium hands the launched browser an `XDG_ACTIVATION_TOKEN` only when it runs on the Wayland backend; under XWayland it can only set `DESKTOP_STARTUP_ID`, which Wayland-native browsers (Firefox, Chromium, GNOME Web) ignore. KWin and Mutter then treat the browser's raise as focus stealing and leave it behind Teams. Verified on KDE Plasma 6.7.5: the same 2.26.0 rpm raises Firefox when launched with `--ozone-platform=wayland` and does not when launched as packaged.
- Fractional scaling is blurry under XWayland ([#1787](https://github.com/IsmaelMartinez/teams-for-linux/issues/1787)); native Wayland renders at the real scale.
- Whole-screen sharing is black under XWayland because the X11 capturer only sees X11 windows ([#3066](https://github.com/IsmaelMartinez/teams-for-linux/issues/3066)); native Wayland goes through the PipeWire portal, which `#configureWayland` already enables.

Each of these has a troubleshooting entry telling the user to edit their `.desktop` file, an edit that a package update silently reverts unless they also know to copy the file to `~/.local/share/applications`.

**Field data.** ADR-031 recorded that the Flathub package, with no flag, had run native Wayland across roughly a million installs without a comparable flood of Wayland-specific reports. The tar.gz build has done the same. The one open native-Wayland window report, [#2959](https://github.com/IsmaelMartinez/teams-for-linux/issues/2959) (Flatpak on GNOME, window shrinks during a call on focus loss, 2.18.1), is the same shape as the regression that closed #2601 and has not been retested on Electron 44. It is the honest risk in this decision and the reason the status is Proposed rather than Accepted.

## Decision

Remove `executableArgs` from the shared `linux` block in `package.json`, so the deb, rpm and AppImage `.desktop` entries carry no `--ozone-platform` flag and Chromium selects the backend per session: native Wayland on a Wayland session, X11 on an X11 session. Keep `--ozone-platform=x11` in the `snap` block unchanged.

`app/startup/commandLine.js` is untouched. Its `#configureWayland` already treats an unflagged Wayland session as native Wayland, which is the branch Flatpak and tar.gz users have exercised since v2.7.4. Users who need XWayland pass `--ozone-platform=x11`, and the `wayland.xwaylandOptimizations` opt-in keeps working for them because it keys on that explicit flag.

The cross-distro matrix (ADR-016) is updated so the XWayland scenario passes `--ozone-platform=x11` itself instead of relying on the packaged flag; the X11 and Wayland scenarios are unchanged.

Acceptance of this ADR is tied to the PR that carries it: the nine-configuration smoke matrix on the PR's AppImage, and at least one multi-monitor report each from GNOME and KDE on the PR build, maximise then focus another monitor, with no shrink. If GNOME still shrinks on Electron 44, the fallback is not to revert this ADR but to narrow it: keep the flag off and document GNOME multi-monitor as the one known case for a `.desktop` override, since Flatpak users on GNOME are already in that position.

## Consequences

### Positive

Links raise the browser, fractional scaling is sharp, and whole-screen sharing works on the three packages most users install, with no per-user `.desktop` surgery. The deb, rpm and AppImage now behave like Flatpak and tar.gz, so Wayland reports stop splitting by package format and the troubleshooting page loses three "edit your Exec line" entries.

### Negative

Any native Wayland regression in a future Electron lands on deb, rpm and AppImage users at once instead of only on Flatpak and tar.gz. The rollback is a one-line restore of the `executableArgs` block, the same change in reverse, and release-please keeps it to a single patch release. GNOME multi-monitor users may need the `--ozone-platform=x11` override until the Chromium side settles; the troubleshooting entry for #2094 says so.

### Neutral

The snap keeps the old default and the old troubleshooting advice. The two `executableArgs` blocks now differ on purpose, which the comment in ADR-031's Neutral section about moving them together no longer applies to.

## Alternatives Considered

### Wait for the snap core24 migration

Rejected: it couples the deb, rpm and AppImage default to a snap packaging problem that has no bearing on how Chromium picks a backend for them, and the migration has no date.

### Per-desktop detection in a wrapper script

A shell wrapper in `Exec=` that picks Wayland on KDE and X11 elsewhere. Rejected for the reason ADR-031 gave: it forks a process purely to choose a flag, adds a packaging surface, and encodes a compositor allowlist that goes stale.

### Fix the link activation under XWayland in the app

Open links through the `org.freedesktop.portal.OpenURI` portal with the Teams window as parent. Not pursued: unverified whether the KDE and GNOME portal backends grant activation for an X11 parent, and it addresses one of the three XWayland defects.

## Related

- [ADR-031](031-ozone-platform-x11-default.md): the decision this supersedes for deb, rpm and AppImage, including the full history of #2506, #2600 and #2601
- [ADR-016](016-cross-distro-testing-environment.md): the nine-configuration matrix used for validation
- [PR #2975](https://github.com/IsmaelMartinez/teams-for-linux/pull/2975), [PR #2995](https://github.com/IsmaelMartinez/teams-for-linux/pull/2995): Electron 43.7.0 and 44.9.0
- [#3018](https://github.com/IsmaelMartinez/teams-for-linux/issues/3018): Flatpak title bar and tray on Electron 44.9.0; [#2959](https://github.com/IsmaelMartinez/teams-for-linux/issues/2959): the open GNOME shrink report
- [#1787](https://github.com/IsmaelMartinez/teams-for-linux/issues/1787), [#3066](https://github.com/IsmaelMartinez/teams-for-linux/issues/3066): fractional scaling and whole-screen sharing under XWayland
