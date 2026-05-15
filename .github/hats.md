# Hats — teams-for-linux

This file is the per-repo classification taxonomy consumed by the github-issue-triage-bot's `/brief-preview` retrieval (see `IsmaelMartinez/github-issue-triage-bot`, `docs/plans/2026-04-22-research-brief-bot-design.md`). Each hat names a class of issue, the retrieval signals that bias toward it, the reasoning posture it should be reviewed under, and a small set of anchor issues that ground the hat in concrete past cases. The taxonomy is also consumed by the `teams-for-linux-issue-review` Claude Code skill when it pulls retrieval context from the bot.

Eight hats below, plus `other` as a fallback. Keep the file under a few thousand tokens so the entire taxonomy fits in any future brief-generator system prompt.

## display-session-media

When to pick. Screen-share, camera, screen-capture, window-picker failures, or display-server interactions where the symptom touches captured video, preview thumbnails, or the source picker.

Retrieval filter. labels: wayland, screen-sharing, media. keywords: ozone, xwayland, portal, screencast, capture, display, preview, picker, thumbnail.

Reasoning posture. ambiguous-workaround-menu.

Phase 1 asks. XDG_SESSION_TYPE, XDG_CURRENT_DESKTOP, GPU vendor and driver, Electron version, whether launched with `--ozone-platform=x11` or via the `.desktop` entry.

Anchors. #2169, #2138, #2529, #2204.

## internal-regression-network

When to pick. Auth, network, SSO, certificate, or proxy regressions where the symptom started on a specific TFL release the user had already installed, and the chain points at our code rather than the desktop or upstream.

Retrieval filter. labels: authentication, network. keywords: token, refresh, login, sso, certificate, proxy, mitm.

Reasoning posture. causal-narrative.

Phase 1 asks. Working version, broken version, full purge or userData wipe attempted, second reporter present, regression-window release notes inspected.

Anchors. #2293.

## tray-notifications

When to pick. Tray icon rendering, notification rendering, notification sound, badge count, MQTT status surface.

Retrieval filter. labels: tray, notifications, mqtt. keywords: notification, tray, badge, libnotify, requireInteraction, notificationMethod, mqtt, sound.

Reasoning posture. single-hypothesis.

Phase 1 asks. notificationMethod config value, OS notification daemon, libnotify version on Linux, whether MQTT broker is reachable when relevant.

Anchors. #2239, #2248, #2095.

## upstream-blocked

When to pick. Electron, Chromium, Teams web, or system-portal limitations with no current workaround on our side, where the right outcome is to document and wait.

Retrieval filter. labels: blocked. keywords: electron, chromium, portal, upstream, microsoft, teams-web, fido2.

Reasoning posture. blocked-on-upstream.

Phase 1 asks. Reproduces in Chrome or Brave (Chromium-based), browser version tested, link to the upstream issue or Microsoft Q&A thread if one exists.

Anchors. #2335, #2137.

## packaging

When to pick. Snap, flatpak, AUR, deb, or rpm-specific failures that would not reproduce on other packaging variants and where the fix lives in the package definition rather than the app.

Retrieval filter. labels: snap, flatpak, aur, deb, rpm. keywords: snap, flatpak, aur, deb, rpm, sandbox, confinement, interface, plug.

Reasoning posture. config-check.

Phase 1 asks. Exact package source, distro and version, packaging variant version, sandbox or confinement interface state.

Anchors. #2239.

## configuration-cli

When to pick. A config-file or command-line option toggles the symptom and the user does not know the right setting; documenting an escape-hatch resolves it.

Retrieval filter. labels: configuration. keywords: config, command-line, flag, option, disableGpu, ozone, customCSS, followSystemTheme, executableArgs.

Reasoning posture. config-check.

Phase 1 asks. Full sanitised config.json, command-line flags actually in use, whether launched via the bundled `.desktop` entry or directly.

Anchors. #2143, #2205.

## enhancement-demand-gating

When to pick. Feature request from a non-contributor where the work is wanted but not offered. The real question is not "should we" but "which of the four extension patterns the wrapper already uses can this ride on": main-process surface (most stable), `webRequest` interception (highly stable), Teams core-services React-store hijack (moderately fragile), floating UI plus synthetic events (manageable), or DOM injection into Teams (fragile, avoid). Default route is `help wanted` + `awaiting user feedback` when Patterns 1 to 4 plausibly fit; "Not Planned / Not Feasible" when only Pattern 5 fits and nobody is offering to own it.

Retrieval filter. labels: enhancement, help-wanted. keywords: feature, enhancement, request, would-like, support-for, custom.

Reasoning posture. demand-gating-needed.

Phase 1 asks. Concrete workflow the feature would unblock, frequency of use, willingness to maintain a contribution.

Anchors. #2107.

## auth-network-edge

When to pick. SSO, FIDO2, federated auth, certificate, or network-edge issues that need an end-to-end diagnostic command paste before any hypothesis is worth posting.

Retrieval filter. labels: authentication. keywords: sso, fido2, certificate, kerberos, intune, oidc, oauth, ssoInTuneEnabled.

Reasoning posture. ambiguous-workaround-menu.

Phase 1 asks. Identity provider and federation chain, ssoInTuneEnabled value, libfido2 version when FIDO2 is in play, browser-repro answer with caveat that Chromium-shared-plumbing makes "yes" non-diagnostic.

Anchors. #2326, #2364.

## other

Fallback when no hat fits. The bot returns this when the issue does not match a hat above. Maintainer reviews under the generic skill workflow without hat-specific posture. Recurring "other" classifications are a signal that the taxonomy needs a new entry.
