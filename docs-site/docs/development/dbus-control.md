# Local D-Bus control API (Linux)

The optional control service exposes a deliberately small set of named Teams actions and observed state on the user session bus. Enable it with `{ "dbusControl": { "enabled": true } }` in the application configuration, then restart Teams for Linux. It is Linux-only and disabled by default. The service and its state observer start only with this opt-in. The renderer status/media monitors run when MQTT or Linux D-Bus control is enabled; existing overlay and macOS dock behavior remains independent. Meeting detection additionally requires `mqtt.meetingStartDetection.enabled`, with `resetSeconds` controlling the pulse duration (default 10 seconds).

| Item | Value |
| --- | --- |
| Bus | User session bus |
| Service | `$FLATPAK_ID`, otherwise `com.github.IsmaelMartinez.teams_for_linux` |
| Object path | `/com/github/IsmaelMartinez/teams_for_linux` |
| Interface | `com.github.IsmaelMartinez.teams_for_linux.Control` |

## Methods

| Method | Signature | Meaning |
| --- | --- | --- |
| `AcceptAudio`, `AcceptVideo`, `DeclineCall` | `() -> b` | Dispatch the corresponding action for the known incoming call |
| `ToggleMute`, `ToggleVideo`, `ToggleHandRaise`, `LeaveCall` | `() -> b` | Use the application's fixed Teams shortcut mapping |
| `Mute`, `Unmute` | `(b force) -> b` | Set desired mute state; already-desired state returns false. Unknown state requires `force=true`; argument must be Boolean. |
| `GetState` | `() -> s` | Current JSON state snapshot |

`true` means dispatch, not acknowledgement from Teams. Incoming-call actions target the latest ringing renderer; shortcuts target the selected profile and fail closed if its renderer is unavailable. There is intentionally no arbitrary shortcut method or calendar/Graph API in this first version. Thus only named commands can request fixed actions.

## Signals and state

Signals: `StateChanged(s stateJson)`, `PresenceChanged(s status, i statusCode)`, `InCallChanged(b)`, `IncomingCallChanged(b)`, `IncomingCallCallerChanged(s callerJson)`, `CameraChanged(b)`, `MicrophoneChanged(s)`, `MicrophoneControlChanged(s)`, `ScreenSharingChanged(b)`, and `MeetingStartedChanged(b)`. `StateChanged` carries the full snapshot; typed signals follow when values change. Call `GetState` after connecting for an immediate snapshot. No D-Bus properties are exported because the installed dbus-native version exposes properties read/write.

The snapshot has exactly ten keys: `presenceStatus`, `presenceStatusCode`, `inCall`, `incomingCall`, `incomingCallCaller`, `cameraEnabled`, `microphoneState`, `microphoneControlState`, `screenSharing`, `meetingStarted`. Presence, call and media state are scoped to the selected profile, not an aggregate across accounts; unobserved values are false/unknown rather than stale data from another profile. Incoming-call fields describe the latest ringing renderer, independently of the selected profile. Initial presence/microphone state is unknown, booleans are false, and caller is null. These are observations, not server-confirmed Teams state.

Caller information remains opt-in through `config.mqtt.incomingCallCaller.enabled`, independently of MQTT being enabled. If enabled, caller details may appear in broadcast state signals. The same opt-in requirement applies to other transports; D-Bus caller identity is not used for authorization. The bus API is available to clients on the user session bus and does not add per-caller access control.

## Examples

Run in the same logged-in user session (no `sudo`):

```bash
BUS=com.github.IsmaelMartinez.teams_for_linux
OBJ_PATH=/com/github/IsmaelMartinez/teams_for_linux
IFACE=com.github.IsmaelMartinez.teams_for_linux.Control
busctl --user introspect "$BUS" "$OBJ_PATH" "$IFACE"
busctl --user call "$BUS" "$OBJ_PATH" "$IFACE" GetState
busctl --user call "$BUS" "$OBJ_PATH" "$IFACE" AcceptAudio
busctl --user call "$BUS" "$OBJ_PATH" "$IFACE" ToggleMute
busctl --user call "$BUS" "$OBJ_PATH" "$IFACE" Mute b false
busctl --user call "$BUS" "$OBJ_PATH" "$IFACE" Unmute b false
busctl --user monitor "$BUS"
```

Flatpak uses its app ID as the well-known service name. The service requests the regular well-known name without queueing. The Snap packaging currently declares no D-Bus slot, so acquiring this name may be denied under Snap confinement; this feature does not request broad permissions as a workaround. MQTT remains an independent, unchanged control and publishing path.
