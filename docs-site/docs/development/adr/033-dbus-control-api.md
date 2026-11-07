---
id: 033-dbus-control-api
---

# ADR 033: Opt-in D-Bus Control API for Teams Actions and State

## Status

✅ Implemented (v2.25.0 onwards)

The first version shipped in v2.25.0 ([PR #3059](https://github.com/IsmaelMartinez/teams-for-linux/pull/3059)), per-instance bus names in v2.26.0 ([PR #3094](https://github.com/IsmaelMartinez/teams-for-linux/pull/3094)), the device-bridge guide in v2.29.0 ([PR #3153](https://github.com/IsmaelMartinez/teams-for-linux/pull/3153)) and `SetStatus` on 2026-11-07 ([PR #3178](https://github.com/IsmaelMartinez/teams-for-linux/pull/3178)), which lands in the release after v2.30.0.

## Context

[ADR-006](006-cli-argument-parsing-library.md) chose MQTT over CLI subcommands as the way for external tools to trigger Teams actions, and [ADR-007](007-embedded-mqtt-broker.md) rejected bundling a broker, leaving "an HTTP command server" on record as the zero-dependency alternative for later. Both decisions left a gap for the common Linux desktop case: a Stream Deck, a headset base, a foot pedal or a busy light that wants to answer, mute, hang up and show call state on the same machine, with no broker to install and no network listener to secure.

A contributor opened [PR #3059](https://github.com/IsmaelMartinez/teams-for-linux/pull/3059) with a session D-Bus service in both directions, built against a Stream Deck through StreamController on Flatpak. D-Bus is the Linux desktop's native local IPC: it is scoped to the logged-in user's session bus, needs no port or credentials, is introspectable, and comes with tooling (`busctl`, `dbus-monitor`) that every distribution ships. Flatpak already models it with the app ID as the well-known name.

The draft started the service on every Linux install and also switched on the renderer status, speaking and meeting monitors that until then only ran with MQTT, which would have changed CPU use and notification-sound muting for users who never asked for D-Bus. It also exposed `SendShortcut` (an arbitrary accelerator) and `GetCalendar`. Review asked for an opt-in and for the first version to carry fixed, named commands only.

## Decision

Expose Teams actions and observed state on the user session bus, behind `dbusControl.enabled` (default `false`, Linux only, restart required). Enabling it also starts the renderer status and media monitors that MQTT uses, so the two transports observe the same state.

The implementation is split so the transport is replaceable:

- `app/control/teamsControlService.js` and `teamsStateService.js` are transport-neutral. They own the fixed shortcut mappings, incoming-call action dispatch, the authenticated presence request and the state snapshot. Arbitrary shortcut input and Graph or calendar access are deliberately outside this service.
- `app/dbus/controlService.js` adapts that service to D-Bus: it owns the well-known name, exports the fixed `com.github.IsmaelMartinez.teams_for_linux.Control` interface at `/com/github/IsmaelMartinez/teams_for_linux`, publishes `StateChanged` plus typed change signals, and releases everything on stop. It uses `@homebridge/dbus-native`.

The interface carries named methods only: `AcceptAudio`, `AcceptVideo`, `DeclineCall`, `ToggleMute`, `ToggleVideo`, `ToggleHandRaise`, `LeaveCall`, `Mute` and `Unmute` with a `force` flag, `SetStatus`, and `GetState`. There is no arbitrary shortcut method. A `true` return means the action was dispatched, not that Teams acknowledged it. Incoming-call actions target the latest ringing renderer; shortcuts and `SetStatus` target the selected profile and fail closed when its renderer is unavailable. No D-Bus properties are exported, because the installed dbus-native version would expose them read/write; state is read through `GetState` and the signals.

State is observation, not server-confirmed Teams state: presence, call and media values are scoped to the selected profile, unobserved values are false or unknown rather than stale data from another profile, and caller identity appears only with the existing `mqtt.incomingCallCaller.enabled` opt-in, which governs both transports.

The bus name defaults to `$FLATPAK_ID` or `com.github.IsmaelMartinez.teams_for_linux`. `dbusControl.busName` lets separately launched instances (different `--user-data-dir`) each own a distinct well-known name; an invalid name disables the service with a warning rather than falling back, and names are requested without queueing, so a second instance on the same name exposes nothing.

MQTT is unchanged and independent. Neither transport depends on the other.

## Consequences

### Positive

Local integrations need no broker, no port and no credentials: a user service that listens on the session bus can drive a headset, pedal or busy light, and the application never has to carry device-specific code. The transport-neutral control service means a second adapter would reuse the same action and state boundary. The surface is small and auditable, since every method is a fixed named action.

### Negative

Linux only. The snap declares no D-Bus slot, so owning a name may be denied under strict confinement; Flatpak needs the sandbox to permit ownership of any custom `busName`. There is no per-caller access control: any process on the user's session bus can control Teams, the same trust level MQTT on localhost already has. `SetStatus` relies on the Teams web client's own `forceavailability` presence endpoint, which is undocumented, region-routed and not part of Microsoft Graph, so Microsoft can change or restrict it without notice. The service starts with the state service, before the window exists, so early calls return `false`.

### Neutral

One service per process. The built-in multi-account switcher exposes the selected profile through a single service rather than one service per profile. The microphone control state is derived from outgoing audio, so a noise-cancelling microphone that sends silence can read `muted` while unmuted; the D-Bus guide documents this and the MQTT microphone topic shares the detection. `@homebridge/dbus-native` is a new production dependency.

## Alternatives Considered

### HTTP command server (the ADR-007 placeholder)

Not pursued. D-Bus covers the same local, dependency-free case without opening a TCP port that every local process and every page in a browser could reach, and session-bus scoping comes for free. An HTTP listener would also have needed its own token scheme and discovery story.

### Arbitrary `SendShortcut` and `GetCalendar` methods

Dropped in review of #3059. A method that injects any accelerator lets any bus client type into the Teams window, and calendar data belongs to the Graph work tracked under [ADR-030](030-graph-api-teams-session-token.md). Fixed named actions keep the surface auditable and keep the first version small.

### Always-on service

Rejected in review. Starting the bus and the renderer monitors on every Linux install changes behaviour for users who never asked for it.

### MQTT only

Kept as the remote and home-automation path. It requires a broker, which is the gap this decision fills for same-machine integrations.

## Related

- [ADR-006](006-cli-argument-parsing-library.md): MQTT chosen over CLI subcommands for actions
- [ADR-007](007-embedded-mqtt-broker.md): embedded broker rejected, HTTP server left as the future alternative
- [ADR-030](030-graph-api-teams-session-token.md): where calendar and Graph access live
- User guide: [Local D-Bus control API](../dbus-control.md); module notes in `app/control/README.md` and `app/dbus/README.md`
- [PR #3059](https://github.com/IsmaelMartinez/teams-for-linux/pull/3059), [PR #3094](https://github.com/IsmaelMartinez/teams-for-linux/pull/3094), [PR #3153](https://github.com/IsmaelMartinez/teams-for-linux/pull/3153), [PR #3178](https://github.com/IsmaelMartinez/teams-for-linux/pull/3178)
- [#3113](https://github.com/IsmaelMartinez/teams-for-linux/issues/3113): presence control request; [#3151](https://github.com/IsmaelMartinez/teams-for-linux/issues/3151): community EPOS/Sennheiser bridge
