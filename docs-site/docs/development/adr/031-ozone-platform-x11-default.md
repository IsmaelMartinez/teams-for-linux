---
id: 031-ozone-platform-x11-default
---

# ADR 031: Keep the ozone-platform x11 Default on Wayland

## Status

✅ Accepted (2026-09-05)

## Context

Teams for Linux ships every Linux package (deb, rpm, AppImage, tar.gz, snap) with `--ozone-platform=x11` baked into the launcher, forcing Chromium into X11 or XWayland rendering even on a native Wayland session. The flag was added by [PR #2139](https://github.com/IsmaelMartinez/teams-for-linux/pull/2139), merged and released as part of v2.7.4 on 2026-02-12, after Electron 38 introduced native Wayland regressions documented as blank or black windows, multi-monitor maximize bugs, and crashes.

The default has been re-litigated four times since, and every attempt to remove it has failed for a different reason, which is why this decision needed its own record rather than another comment thread. [PR #2509](https://github.com/IsmaelMartinez/teams-for-linux/pull/2509), a documentation-only roadmap update on 2026-05-07, accidentally carried a `package.json` hunk that flipped both `executableArgs` blocks to the invalid value `auto`, breaking every Linux build with a Chromium `FATAL` on an unknown ozone platform; [PR #2511](https://github.com/IsmaelMartinez/teams-for-linux/pull/2511) restored `x11` the next day, and [PR #2547](https://github.com/IsmaelMartinez/teams-for-linux/pull/2547) cleaned up the resulting stale docs a week later, bundled with an unrelated GNOME notification workaround for [#2411](https://github.com/IsmaelMartinez/teams-for-linux/issues/2411).

The real attempt came on 2026-05-30 with [PR #2506](https://github.com/IsmaelMartinez/teams-for-linux/pull/2506), which dropped the flag on the premise that Chromium 140 defaults `--ozone-platform-hint` to `auto` upstream. Main was still on Electron 41 (Chromium roughly 138), before that default existed, so removing the flag just fell back to Chromium's compiled-in choice. The maintainer merged it by mistake, by his own account ("My fat fingers merged this to main, but I want to hold it for a bit longer"), and reverted it the same day in [PR #2600](https://github.com/IsmaelMartinez/teams-for-linux/pull/2600), citing a plan to gate the change behind the pending snap core22 to core24 base migration so each rollout's blast radius stayed small.

Once main reached Electron 42.3.0, [PR #2601](https://github.com/IsmaelMartinez/teams-for-linux/pull/2601) retried the removal. Community testing tracked in [#2508](https://github.com/IsmaelMartinez/teams-for-linux/issues/2508) reproduced a genuine regression on native Wayland: a multi-monitor window that shrinks out of fullscreen the moment focus moves to another monitor, reported independently on Debian 13 GNOME by Clemens12345 and confirmed by akettmann-apic, absent under x11. On 2026-06-18 the maintainer closed #2601 unmerged ("I think is not ready yet to move from ozone x11 to auto, so I will close this and just wait a few electron iterations") and closed #2508 the same day ("After many weeks of testing, it is clear this is not ready from the electron side. Maybe by electron 50 they have fixed wayland").

The gating condition the maintainer named, a snap base migration to core24, was itself attempted in [PR #2758](https://github.com/IsmaelMartinez/teams-for-linux/pull/2758) on 2026-08-20 and reverted five days later in [PR #2906](https://github.com/IsmaelMartinez/teams-for-linux/pull/2906) after core24 snaps crashed on launch with a `Trace/breakpoint trap`; tracking issue [#2590](https://github.com/IsmaelMartinez/teams-for-linux/issues/2590) needs reopening before that path is viable again.

X11 by default is not friction free either. Open reports as of September 2026 include [#2934](https://github.com/IsmaelMartinez/teams-for-linux/issues/2934) (compose box stops accepting keystrokes after a snap auto-update on GNOME Wayland), [#2919](https://github.com/IsmaelMartinez/teams-for-linux/issues/2919) (generic launch errors under `--ozone-platform=wayland`), [#2871](https://github.com/IsmaelMartinez/teams-for-linux/issues/2871) (screen sharing fails on native Ubuntu Wayland because `use-fake-ui-for-media-stream` blocks the PipeWire portal chooser), and [#2713](https://github.com/IsmaelMartinez/teams-for-linux/issues/2713) (screen share source IDs churn between `getSources()` calls under Wayland/PipeWire). None argue for removing the default; the picker and PipeWire questions they raise sit in territory already covered by ADR-001 and ADR-008.

## Decision

Keep `--ozone-platform=x11` as the shipped default on every Linux packaging format. The flag lives in `package.json` in two `executableArgs` blocks under electron-builder's `build` config: the shared `linux` block feeds the `.desktop` file's `Exec=` line for deb, rpm, AppImage and tar.gz, and a separate `snap` block feeds the snap wrapper. Both are baked into the launch command at package time, so the flag reaches Chromium as a real argv entry before any Electron JavaScript runs, which is what lets it win over anything set later.

On top of that default, `app/startup/commandLine.js`'s `#configureWayland` runs whenever `XDG_SESSION_TYPE` is `wayland`. It always enables `WebRTCPipeWireCapturer` for screen sharing, detects XWayland at runtime by checking whether `ozone-platform` actually resolved to `x11` (the same config serves both native Wayland and XWayland), and, unless `wayland.xwaylandOptimizations` is set, disables GPU compositing to avoid blank windows and adds `use-fake-ui-for-media-stream` for screen share. `xwaylandOptimizations` flips both for users who need camera support under XWayland instead ([#2169](https://github.com/IsmaelMartinez/teams-for-linux/issues/2169)).

A user who wants native Wayland can pass `--ozone-platform=wayland` on the command line or edit their `.desktop` file's `Exec=` line, both documented in `troubleshooting.md` and `configuration.md`. Either is a genuine argv override applied at the same point in startup as the shipped default, so it works reliably where a config option could not.

Reopening this decision needs concrete evidence, not a new Electron release alone:

- A snap base that actually ships in production for a full release cycle. Issue #2590 needs reopening and a working core24 (or successor) migration first.
- An Electron or Chromium baseline beyond 42 verified against the exact #2601 regression: multi-monitor fullscreen on GNOME or KDE, shrinking on focus loss to another monitor.
- A validation pass across the full ADR-016 nine-distro, three-display-server matrix on the candidate baseline, not a self-selected subset of GitHub commenters.
- A soak period on the snap and Flatpak beta lanes before the stable default changes, so a regression reaches a smaller audience first.

## Consequences

### Positive

The default matches what most users get without any manual step, avoiding the blank windows and multi-monitor maximize bugs that Electron 38's native Wayland path introduced. The repeated attempts to remove it left a paper trail across #2508, #2600 and #2601 that this ADR consolidates, so the next attempt starts from known failure modes instead of rediscovering them.

### Negative

Users who want native Wayland must opt in per install, and a `.desktop` edit can be silently lost on a package update unless placed in a location documented to shadow the packaged entry. `electronCLIFlags` in `config.json` cannot override this: config is read and applied well after Electron has started, by which point Chromium's ozone backend is already fixed from the real process arguments. Only a genuine command line argument, from packaging, a shell wrapper, or a hand-edited `.desktop` file, can influence it. Wayland-specific reports such as #2871 and #2713 keep accumulating against a fallback many users do not realize they are running, since `XDG_SESSION_TYPE=wayland` alone does not tell them the app launched under XWayland.

### Neutral

`#configureWayland`'s runtime `isXWayland` check reacts to whatever `ozone-platform` value actually reached Chromium, not to an assumption baked into the module, so changing the packaged default only changes which branch most users hit, not the logic itself. The flag is duplicated across two `executableArgs` blocks in `package.json`, one shared by deb, rpm, AppImage and tar.gz and one for snap; both need to move together, the same lesson the snap.yml and snap-release.yml workflow split already taught for architecture pins.

## Alternatives Considered

### Native Wayland by default

Ship no `ozone-platform` flag, or `--ozone-platform=wayland`, and rely on Chromium's own per-session detection. Tried twice, in #2506 and #2601, and reverted both times: #2506 predated Chromium's `auto` default on the running Electron baseline, and #2601 reproduced a reporter-confirmed multi-monitor regression that x11 does not have. This remains the eventual goal, not a rejected direction; the reopen triggers above describe what changes the answer.

### Per-compositor auto-detection in the app

Have Teams for Linux decide the platform itself from `XDG_CURRENT_DESKTOP` or a compositor probe, instead of delegating to Chromium's hint. Rejected because `--ozone-platform` is parsed before any Electron main process JavaScript runs, the same ordering constraint that blocks `electronCLIFlags`; app-level detection cannot act early enough to select it without forking a second process purely to choose a flag.

### A dedicated config toggle

Expose `ozone-platform` as a `config.json` option. Rejected for the same ordering reason: config loads after the ozone backend is already fixed, so the option would silently do nothing. Documenting the CLI and `.desktop` override, as `configuration.md` already does, is more honest about the constraint than shipping a setting that cannot work.

## Related

- [ADR-001](001-desktopcapturer-source-id-format.md): DesktopCapturer Source ID Format
- [ADR-008](008-usesystempicker-electron-38.md): useSystemPicker rejected for Linux Wayland and PipeWire
- [ADR-016](016-cross-distro-testing-environment.md): Cross-Distro Testing Environment, the validation matrix in the reopen triggers
- [PR #2139](https://github.com/IsmaelMartinez/teams-for-linux/pull/2139): introduced the x11 default (v2.7.4)
- [PR #2509](https://github.com/IsmaelMartinez/teams-for-linux/pull/2509) / [#2511](https://github.com/IsmaelMartinez/teams-for-linux/pull/2511) / [#2547](https://github.com/IsmaelMartinez/teams-for-linux/pull/2547): accidental flip to an invalid value, its hotfix, and the doc cleanup bundled with the #2411 GNOME workaround
- [PR #2506](https://github.com/IsmaelMartinez/teams-for-linux/pull/2506) / [#2600](https://github.com/IsmaelMartinez/teams-for-linux/pull/2600): first removal attempt and its same-day revert
- [PR #2601](https://github.com/IsmaelMartinez/teams-for-linux/pull/2601): Electron 42 retry, closed unmerged; [#2508](https://github.com/IsmaelMartinez/teams-for-linux/issues/2508): its community testing tracker, closed
- [#2590](https://github.com/IsmaelMartinez/teams-for-linux/issues/2590) / [PR #2758](https://github.com/IsmaelMartinez/teams-for-linux/pull/2758) / [#2906](https://github.com/IsmaelMartinez/teams-for-linux/pull/2906): the core22 to core24 snap migration and its revert
- Live Wayland-adjacent reports: [#2871](https://github.com/IsmaelMartinez/teams-for-linux/issues/2871), [#2713](https://github.com/IsmaelMartinez/teams-for-linux/issues/2713), [#2919](https://github.com/IsmaelMartinez/teams-for-linux/issues/2919), [#2934](https://github.com/IsmaelMartinez/teams-for-linux/issues/2934)
- `app/startup/commandLine.js` (`#configureWayland`), `docs-site/docs/troubleshooting.md` and `docs-site/docs/configuration.md` (the `electronCLIFlags` constraint)
