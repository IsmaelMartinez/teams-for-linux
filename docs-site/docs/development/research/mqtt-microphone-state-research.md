# MQTT Microphone State via Speaking Indicator (Issue #1938 / #2107)

:::info Ready for Implementation
The speaking indicator (PR #2299) proves reliable three-state microphone detection via WebRTC `getStats()`. This document covers wiring that detection into MQTT, completing the original request from issue #1938.
:::

**Date**: 2026-03-13
**Issue**: [#1938 - Extended MQTT Status Fields](https://github.com/IsmaelMartinez/teams-for-linux/issues/1938), [#2107 - Publish screen sharing status to MQTT](https://github.com/IsmaelMartinez/teams-for-linux/issues/2107)
**Status**: Ready for implementation
**Depends on**: PR #2299 (speaking indicator) merged

---

## Background

User @vbartik filed #1938 in November 2025 requesting camera, microphone, and call state via MQTT for RGB LED home automation. The use case: family members need visual cues about interruption level when working from home — red when on camera, orange when mic is live, yellow when in a call but muted, green when idle.

Phase 1 of the MQTT extended status (PR #2007, December 2025) shipped the infrastructure: `MQTTMediaStatusService`, IPC allowlist entries for `camera-state-changed` and `microphone-state-changed`, and call state publishing via `in-call` topic. However, the renderer-side code to detect and send microphone/camera state was never built. The `microphone-state-changed` IPC handler has existed since December 2025 but has never received a message. Issue #1938 was closed prematurely when no follow-up comments arrived.

A brief attempt was made on March 9 2026 to send `microphone-state-changed` from the speaking indicator using `getUserMedia` interception and `track.enabled` polling, but it was stripped out the next day because Teams' mute detection didn't work with that approach. The speaking indicator was then rewritten to use `RTCPeerConnection.getStats()` and `media-source.audioLevel`, which reliably detects three states: speaking, silent, and muted. Teams zeroes `audioLevel` to exactly 0.0 when the user mutes, making detection unambiguous.

@vbartik confirmed on February 11, 2026 (in #2107) that mic/camera status "holds way higher value" for them than presence status. A comment has been posted on #2107 asking whether they prefer three-state or boolean format — awaiting response, but proceeding with three-state as default since it maps directly to their RGB LED scenario.

---

## Approach: Wire Speaking Indicator State into MQTT

The speaking indicator already detects state changes in its `#poll()` loop. When `newState !== this.#state`, it currently logs the transition and updates the overlay. The change is to also send an IPC event at that point, which the existing `MQTTMediaStatusService` handler picks up and publishes to MQTT.

### Data Flow

```
speakingIndicator.js (renderer process)
  ├─ polls RTCPeerConnection.getStats() every 150ms
  ├─ reads media-source.audioLevel from WebRTC stats
  ├─ determines state: speaking | silent | muted
  ├─ on state change:
  │   ├─ ipcRenderer.send('microphone-state-changed', state)
  │   └─ updates visual overlay (existing)
  └─ on call end / no connections:
      └─ ipcRenderer.send('microphone-state-changed', 'off')

mediaStatusService.js (main process)
  ├─ ipcMain.on('microphone-state-changed') — handler already exists
  └─ publishes to {topicPrefix}/microphone with retain: true
```

### MQTT Topic Values

The `{topicPrefix}/microphone` topic publishes one of four string values:

| Value | Meaning | Trigger |
|-------|---------|---------|
| `speaking` | Audio is being transmitted | audioLevel >= 0.01 |
| `silent` | Mic is open but quiet | audioLevel >= 0.0001 and < 0.01 |
| `muted` | Teams has zeroed the audio signal | audioLevel < 0.0001 after first non-zero seen |
| `off` | Not in a call / overlay hidden | All peer connections closed or call ended |

The `retain: true` flag ensures new MQTT subscribers immediately get the current state.

### Home Automation Mapping (vbartik's use case)

| MQTT Value | LED Colour | Family Guidance |
|------------|-----------|-----------------|
| `speaking` | Orange | Keep quiet — mic is live |
| `silent` | Yellow | In a call, moderate noise OK |
| `muted` | Yellow (dim) | In a call but muted, moderate noise OK |
| `off` | Green | Not in a call |

Camera state (`{topicPrefix}/camera` → red LED) remains a separate future feature, unrelated to the speaking indicator.

---

## Implementation

### Files to Change

1. **`app/browser/tools/speakingIndicator.js`** — accept `ipcRenderer` in `init()`, send `microphone-state-changed` on state transitions, send `"off"` when overlay hides. Add descriptive comment above each IPC send for the doc generator.

2. **`app/browser/preload.js`** — add `"speakingIndicator"` to `modulesRequiringIpc` so it receives `ipcRenderer`. The module is already in the `modules` array but is not in the IPC set.

3. **`app/mqtt/mediaStatusService.js`** — rename `#handleMicrophoneChanged(event, enabled)` parameter to `(event, state)` and publish the string directly instead of `String(enabled)`.

4. **`docs-site/docs/development/ipc-api-generated.md`** — regenerated by `npm run generate-ipc-docs`.

5. **`docs-site/docs/configuration.md`** — update the MQTT topics table to document the `microphone` topic and its four values.

6. **`tests/unit/speakingIndicator.test.js`** — verify IPC events are sent on state changes.

### What Does Not Change

No new IPC channels are needed — `microphone-state-changed` is already registered in `ipcValidator.js` and handled in `mediaStatusService.js`. No new config flags — the feature piggybacks on `media.microphone.speakingIndicator` (added by PR #2299) and `mqtt.enabled`.

### Coupling Considerations

The speaking indicator currently works independently of MQTT — users can enable the visual overlay without having MQTT configured. This design preserves that independence. The speaking indicator sends `microphone-state-changed` regardless of whether MQTT is enabled. If MQTT is disabled, the `MQTTMediaStatusService` is never initialized and the IPC event is simply ignored. If the speaking indicator is disabled, no events are sent and the MQTT topic is never published.

Both features need to be enabled for MQTT microphone state to work: `media.microphone.speakingIndicator=true` AND `mqtt.enabled=true`. This should be documented in the configuration reference.

### WebRTC-Based Call State Fallback (#2358)

As of the #2358 fix, `speakingIndicator.js` also emits `call-connected` and `call-disconnected` events through `activityHub` when RTCPeerConnection state changes. This provides a reliable fallback for in-call detection when Teams' React `commandChangeReportingService` doesn't fire (e.g., hanging up from the popup window).

The RTCPeerConnection patching now activates when **either** feature is enabled:

- `media.microphone.speakingIndicator=true` (visual overlay + call detection)
- `mqtt.enabled=true` (call detection only, no overlay)

This means MQTT users get reliable in-call detection even without enabling the visual speaking indicator overlay. The coupling is intentional: the same WebRTC monitoring serves both features.

---

## Why Not the Original Phase 2 Approach

The original MQTT extended status research (November 2025) proposed intercepting `getUserMedia()` and polling `MediaStreamTrack.enabled` for camera/microphone state. This approach was abandoned for microphone detection because:

1. Teams does not reliably toggle `track.enabled` when the user mutes — the track stays enabled while Teams silences the audio at a lower level in the WebRTC pipeline.
2. The `getUserMedia` interception only gives a binary signal (track enabled/disabled), not the richer three-state data that `getStats()` provides.
3. The `getStats()` approach was validated in the speaking indicator and works reliably across different call scenarios (pre-join, active call, mute/unmute cycles).

Camera detection may still need the `getUserMedia` approach since there is no equivalent `videoLevel` stat in WebRTC. That remains future work, separate from this feature.

---

## Open Questions

1. **User format preference**: Comment posted on #2107 asking @vbartik whether they prefer three-state or boolean. Proceeding with three-state as default. If boolean is preferred, the handler change is trivial. If both are needed, a second topic (`{topicPrefix}/microphone-muted`) could be added.

2. **Stale retained state on crash**: The `microphone` topic uses `retain: true`, so a stale `"speaking"` value could persist in the broker if the app crashes or the renderer reloads before the `"off"` event fires. The MQTT LWT handles connection state (`connected` → `"false"`) but not individual topic cleanup. Home automation consumers should treat LWT disconnect as an implicit `"off"` for all media topics. This is consistent with how `in-call` already behaves.

3. **Camera state**: Not covered by this feature. Would require a different detection approach (likely `getUserMedia` interception for `video` tracks). Separate issue/PR.

---

## References

- [#1938 - Extended MQTT Status Fields](https://github.com/IsmaelMartinez/teams-for-linux/issues/1938) — original request by @vbartik
- [#2107 - Publish screen sharing status to MQTT](https://github.com/IsmaelMartinez/teams-for-linux/issues/2107) — @vbartik confirmed mic/camera state is highest value
- [#1613 - Emit events when joining/leaving meeting](https://github.com/IsmaelMartinez/teams-for-linux/issues/1613) — earlier busy-light request by @antimatter84
- [#1791 - Make Teams status available to home automation](https://github.com/IsmaelMartinez/teams-for-linux/issues/1791) — origin of MQTT integration
- [PR #2299 - Speaking indicator](https://github.com/IsmaelMartinez/teams-for-linux/pull/2299) — WebRTC getStats() implementation
- [PR #2007 - MQTT Extended Status Phase 1](https://github.com/IsmaelMartinez/teams-for-linux/pull/2007) — infrastructure and IPC handlers
- [MQTT Extended Status Investigation](mqtt-extended-status-investigation.md) — original Phase 1/2 research
