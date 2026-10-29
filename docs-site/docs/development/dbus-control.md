# Local D-Bus control API (Linux)

The optional control service exposes a deliberately small set of named Teams actions and observed state on the user session bus. Enable it with `{ "dbusControl": { "enabled": true } }` in the application configuration, then restart Teams for Linux. It is Linux-only and disabled by default. The service and its state observer start only with this opt-in. The renderer status/media monitors run when MQTT or Linux D-Bus control is enabled; existing overlay and macOS dock behavior remains independent. Meeting detection additionally requires `mqtt.meetingStartDetection.enabled`, with `resetSeconds` controlling the pulse duration (default 10 seconds).

| Item | Value |
| --- | --- |
| Bus | User session bus |
| Service | `dbusControl.busName` when set; otherwise `$FLATPAK_ID` or `com.github.IsmaelMartinez.teams_for_linux` |
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

## Writing a device bridge

A headset, foot pedal or busy light can be wired to Teams through a small user service that sits between the device and this API, so device-specific code stays outside the application. A bridge built this way should account for the following behaviour.

Teams for Linux owns the bus name only while it runs. Watch `NameOwnerChanged` for the service name and call `GetState` whenever it gains an owner, since signals sent before the bridge connected or while the app was restarting are not replayed. When it loses its owner, treat the cached state as gone and return the device to idle (not ringing, on-hook), since an app that quits or crashes mid-call sends no final state.

When a call is answered, `incomingCall` can become false a moment before `inCall` becomes true, because the end of the ringing notification and the call connecting are reported separately. A bridge that keeps a line open while a call is active, such as a headset base that drops its off-hook state within about a second, should assert that state on the button press before calling `AcceptAudio`, keep it until `inCall` arrives, and clear it if the call returns false or `inCall` does not follow within a few seconds.

`microphoneControlState` is `muted`, `unmuted` or `off` (no active call), and `unknown` until the first observation. It is derived from the outgoing audio, so a microphone with built-in noise reduction that sends silence while you are quiet can read `muted` after about half a second; the [MQTT microphone topic](../mqtt-integration.md#published-topics) uses the same detection. `Mute` and `Unmute` rely on the same observation: they toggle only from a known `muted` or `unmuted` state (or with `force` set to true) and return false when the state already matches. On such a microphone a quiet, unmuted line can make `Mute` do nothing and `Unmute` send a toggle that mutes. Test this with your device before driving a mute LED from `MicrophoneControlChanged` or relying on `Mute` and `Unmute`; a bridge whose device has a single mute button can use `ToggleMute`, which sends the shortcut regardless of state.

A community example for EPOS/Sennheiser DECT bases is discussed in [issue #3151](https://github.com/IsmaelMartinez/teams-for-linux/issues/3151).

## Separate application instances

For profiles launched in separate processes with different `--user-data-dir` directories, set a distinct `dbusControl.busName` in each directory's `config.json`, then restart those instances. For example:

```json
{
  "dbusControl": {
    "enabled": true,
    "busName": "com.github.IsmaelMartinez.teams_for_linux.Work"
  }
}
```

Use `com.github.IsmaelMartinez.teams_for_linux.Personal` in the other instance. In the commands above, change only `BUS` to the chosen name; the object path and interface stay the same. Read each instance with `GetState` and subscribe to its signals by service name.

An empty or unset `busName` keeps the default. A custom name must be a well-known D-Bus name: at most 255 ASCII characters, at least two nonempty dot-separated components, using letters, digits, underscores or hyphens, with no component starting with a digit. Unique names such as `:1.42` are not accepted. An invalid name disables the D-Bus service with a warning; it does not fall back to another name. Names are requested without queueing, so if two instances use the same name, only the first exposes the service.

This setting separates application processes. The built-in multi-account switcher still exposes one service per process and retains the selected-profile behavior described above.

Flatpak defaults to its app ID. A custom name overrides that default, but the sandbox must permit ownership of the chosen name; this setting does not grant permissions. The Snap packaging currently declares no D-Bus slot, so acquiring a name may be denied under Snap confinement. MQTT remains an independent, unchanged control and publishing path.
