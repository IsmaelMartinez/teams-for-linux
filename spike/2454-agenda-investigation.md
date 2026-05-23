# Investigation: #2454 Agenda / Collaborative Notes missing

**Date**: 2026-05-22
**Status**: Paused — gate not yet identified
**Worktree**: `.claude/worktrees/spike-2454-csp/` on branch `worktree-spike-2454-csp`

## TL;DR

The Agenda / Collaborative Notes button is missing in the meeting-compose dialog when using teams-for-linux but visible on the same tenant and same machine in Chrome (even with TFL's UA-CH spoofed onto it). Six hypothesis spikes were tested and ruled out. The gate is somewhere inside Teams's parent-side render decision that determines whether the OWA hosted-calendar iframe gets moved out of its cacheable-iframe pool into the visible meeting-compose slot. The decision happens upstream of any OWA interaction.

## What we proved with the spike worktree

- The OWA hosted-calendar iframe loads in TFL but stays parked in Teams's cacheable-iframe pool with `parentDisplay: none, width: 0, height: 0`. In Chrome on the same flow the same iframe is `visible: true`, `width: 732+, height: 484+`.
- A manual teams-js v2 `initialize` envelope sent from the wrapper's preload into the iframe makes OWA fully bootstrap: it replies with its own `initialize`, then `appInitialization.appLoaded`, `appInitialization.success`, `hostedCalendarReady({callingConvention: "bizChatCallV2"})`, and registers ~40 handlers including `calendarAgentModeActionRequested`, `activatePlanMode`, `openPrepareListView`, `selectTimeSlots`, `draftAssistantActionRequested`. So OWA's Loop/Agenda machinery works fine inside Electron — the missing piece is on Teams's side, not OWA's.
- Responding to OWA's post-init `getContext` / `authentication.getAuthToken` / `getConfigSetting` requests with stubbed values does not unblock anything. Teams keeps the iframe in the cache pool regardless.
- The React store `categoryBehaviorSubjectMap` in TFL never grows entries for `outlook`, `ai`, or `meetingBot` (Chrome has them). The `cs.get('outlook')` defaults exist in both — it's the live subscription, not the static defaults, that differs. Teams's outlook-integration module simply never activates in TFL.
- The runtime decision found in Teams's `async-entry-*.js` main bundle is:
  ```js
  const {enableM365Calendar, enableM365CalendarSchedulingForm} = this.coreSettings.get(r.w.Calendar);
  if (enableM365Calendar && enableM365CalendarSchedulingForm) return this.openM365CalendarMeetingDetails(...);
  ```
  Both `enableM365Calendar: 1` and `enableM365CalendarSchedulingForm: false` are identical between TFL and Chrome, so this is **not** the gate either. Both clients take the legacy (non-M365) path, yet only Chrome renders Agenda inside the legacy path.

## Hypotheses tested

| Hypothesis | Spike change | Outcome |
| :--- | :--- | :--- |
| CSP report-only enforcement on Teams domain | Stripped report-only on Teams in `app/mainAppWindow/index.js` | Agenda still missing |
| `contextIsolation:false` letting preload JS leak into Teams | Flipped to `contextIsolation:true` in `app/mainAppWindow/browserWindowManager.js` (breaks ReactHandler but isolates) | Agenda still missing |
| Microsoft telemetry-host cancellation in `onBeforeRequest` | Commented out cancel for `events.data.microsoft.com` hosts | Agenda still missing |
| `timestampCopyOverride` spread stripping prototype methods from compose settings | Removed module from preload modules list | Agenda still missing |
| Missing teams-js v2 initialize handshake to OWA iframe | Probe sent synthetic initialize with `MessagePort` transferable from main into OWA | OWA fully bootstrapped, registered all Agenda handlers, signalled `hostedCalendarReady`, but parent-side renderer kept iframe in cache pool |
| Missing context/auth responses to OWA's post-init requests | Probe responded to `getContext` / `getAuthToken` / `getConfigSetting` with stubs | OWA accepted responses but iframe stayed at 0×0 in cache pool |

## Where to resume

- Execute the fresh-profile test with telemetry pass-through to verify if unblocked first-login telemetry assigns the correct experiment bucket. The spike worktree is wired for this — `onBeforeRequestHandler` has the telemetry cancel commented out and the probe is in observation-only mode. Just relaunch with `E2E_USER_DATA_DIR=$(mktemp -d) ./node_modules/.bin/electron ./app` and log in fresh.
- Grep the Teams main bundle for `MeetingNotesButton` and `areMeetingNotesEnabledByPolicy` (mapped to tenant policy key `meetingPolicy.allowSharedNotes`) to locate the specific render condition gating Agenda visibility in the legacy compose form. Cached bundles are under `$CLAUDE_JOB_DIR/teams/`.
- Launch Chrome with `--remote-debugging-port=9222` to capture the full network log and DOM state of the lazy-loaded compose-form scripts during a working session — we currently only have the bundles that loaded during the unauthenticated path; the scheduling-form chunks that load only when New Meeting opens are still missing.
- Inspect the ECS feature-flag payload Teams fetches at startup (look for an `ecs` / `flighting` request URL in Chrome's Network tab) and compare TFL's bucket assignment against Chrome's. Different `clientType` values reported by the two environments may be the bucket discriminator.
- Once the controlling flag is identified, apply the `timestampCopyOverride` monkey-patch pattern from `app/browser/tools/timestampCopyOverride.js` against `coreSettings.get` of whichever category the flag lives in. That's a ~30-line override.

## Spike worktree state

Live edits currently on `worktree-spike-2454-csp` branch:

- `app/mainAppWindow/index.js` — telemetry cancel commented out with `SPIKE-2454` comment, `stripCspForAuthPages` reverted to default (early-return on Teams domains).
- `app/mainAppWindow/browserWindowManager.js` — `contextIsolation: false` (default, reverted from the contextIsolation:true spike).
- `app/browser/preload.js` — `timestampCopyOverride` re-enabled (default), `spike2454Probe` added to modules list.
- `app/browser/tools/spike2454Probe.js` — new file: diagnostic probe with iframe lifecycle, postMessage capture, React-store category recheck. Currently in observation-only mode (handshake and responder commented out).

To return to fully stock TFL: revert all four files. To resume the investigation: relaunch from `./node_modules/.bin/electron ./app` with `E2E_USER_DATA_DIR` set to a fresh `mktemp -d`.

## Useful artifacts

- Cached OWA bundles: `$CLAUDE_JOB_DIR/owa/` — 13 files, ~3 MB total, includes `HostedCalendarFunctionalBoot.js`, `owa.hostedcalendar.6b81220a.js`, `owa.HostedCalendarBoot.h.ebb440ff.js`, `owa.40780.h.2f32066f.js` (Fluid/Loop), `owa.66330.h.ed49f8cd.js`.
- Cached Teams bundles: `$CLAUDE_JOB_DIR/teams/` — `async-entry-662a87c6f3c2df40.js` (9 MB main bundle), `32990-46c646c937ff2652.js`, `78043-c7d9b993c5fd0c4b.js`.
- Captured feature flags inside the Fluid bundle that may matter once Teams's gate is bypassed: `cal-cmp-fluidCollaborativeSpace`, `cal-cmp-fluidCollaborativeSpaceEdu`, `cal-disable-meeting-notes`, `cal-fluid-collabSpaceRead`, `addison-loops`. These are OWA-side and only activate once OWA's compose form renders.

## Honest framing for the issue

The wrapper is not interfering at any layer we could test. OWA's hybrid calendar machinery works inside Electron when manually bootstrapped. The gate is in Teams's main-app rendering decision, gated by something we haven't been able to identify from outside without reading Teams's minified bundle in depth. The next concrete advance is either the fresh-profile-with-telemetry test, or a Chrome remote-debugging session to capture the compose-flow-only network log and grep the additional bundles that load.
