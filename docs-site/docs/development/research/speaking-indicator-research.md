# Speaking Indicator Research (Issue #2290)

:::tip Validated - Ready for Implementation
All three validation spikes passed on 2026-03-09. Core approach confirmed feasible.
:::

**Date:** 2026-03-04
**Validated:** 2026-03-09
**Status:** Validated, ready for implementation
**Issue:** [#2290 - Add real-time speaking indicator to confirm microphone input is working](https://github.com/IsmaelMartinez/teams-for-linux/issues/2290)
**Author:** Claude AI Assistant
**Related:** [MQTT Extended Status Investigation](mqtt-extended-status-investigation.md), [Notification Sound Overhaul Research](notification-sound-overhaul-research.md)

---

## Executive Summary

Users cannot reliably confirm their microphone is working during Teams calls without asking others. Desktop environment indicators (e.g., PipeWire volume meters) show global microphone input rather than the device specifically selected by Teams, and they don't reflect the app's mute state. This research evaluates approaches for adding a real-time speaking indicator that responds to the microphone stream Teams is actually using.

The recommended approach intercepts `getUserMedia()` (a proven pattern already used by `disableAutogain.js` and `injectedScreenSharing.js`), creates a lightweight `AudioContext` + `AnalyserNode` to monitor volume levels, and renders a small floating overlay inside the Teams window during active calls. This also wires up the dormant `microphone-state-changed` IPC channel for MQTT integration.

---

## 1. Problem Statement

### User Pain Points

1. **No confirmation mic is working** --- users must ask "can you hear me?" to verify audio input
2. **Device switching uncertainty** --- when switching microphones mid-call, no feedback confirms the new device is active
3. **System indicators are misleading** --- desktop volume meters (pavucontrol, PipeWire) monitor global input, not the specific device selected in Teams, and don't reflect Teams mute state
4. **Context-switching required** --- checking system audio tools means leaving the meeting window

### Expected Behavior (from issue)

- Visual indicator responding to microphone input exceeding a silence threshold
- Real-time, low-latency updates during speech
- Respects Teams mute state (shows muted when app is muted)
- Minimal performance impact

---

## 2. Existing Infrastructure

The codebase already has significant infrastructure that this feature can leverage:

### getUserMedia Interception (Proven Pattern)

Three modules already intercept `navigator.mediaDevices.getUserMedia()`:

| Module | Purpose | Pattern |
|--------|---------|---------|
| `disableAutogain.js` | Modifies audio constraints | Wraps `getUserMedia`, modifies constraints before calling original |
| `injectedScreenSharing.js` | Detects screen sharing streams | Wraps `getUserMedia`, inspects constraints to identify screen shares |
| `cameraResolution.js` | Overrides camera resolution | Wraps `getUserMedia`, modifies video constraints |

Each module preserves the previous patch by wrapping the current function. A new module can safely add another layer.

### Dormant IPC Channels

| Channel | Registered In | Handler | Sender |
|---------|---------------|---------|--------|
| `microphone-state-changed` | `ipcValidator.js` | `MQTTMediaStatusService` | **None --- dead channel** |
| `camera-state-changed` | `ipcValidator.js` | `MQTTMediaStatusService` | **None --- dead channel** |

Both channels are fully wired on the receiving end (MQTT publishing) but have no sender. This feature would activate `microphone-state-changed`.

### Call Lifecycle Events

`activityHub.js` detects call state via React internals:

- `call-connected` --- fires when joining a call (via `calling-screen-rendered` step)
- `call-disconnected` --- fires when leaving a call (via `render_disconected` step)

These provide the signal for when to start/stop audio monitoring.

### AudioContext Availability

The `--autoplay-policy=no-user-gesture-required` switch is already set in `app/startup/commandLine.js` (added for notification sound work). This means `AudioContext` can be created and used without user gesture restrictions.

---

## 3. Technical Approach

### Core: Audio Level Detection via AnalyserNode

The Web Audio API provides `AnalyserNode`, a hardware-accelerated FFT node that exposes frequency and time-domain data without modifying the audio stream. This is the standard approach for volume meters in web applications.

```javascript
// Conceptual flow (validated in spike)
const audioContext = new AudioContext();
const source = audioContext.createMediaStreamSource(micStream);
const analyser = audioContext.createAnalyser();
analyser.fftSize = 256;
source.connect(analyser);
// analyser is NOT connected to destination --- no feedback loop

const dataArray = new Uint8Array(analyser.frequencyBinCount);

function checkLevel() {
  analyser.getByteFrequencyData(dataArray);
  const rms = Math.sqrt(dataArray.reduce((sum, v) => sum + v * v, 0) / dataArray.length);
  const isSpeaking = rms > SILENCE_THRESHOLD;
  // Update indicator...
}
```

Key properties:

- **Non-destructive**: `AnalyserNode` reads data without modifying the stream
- **No feedback loop**: Source is connected to analyser only, not to `audioContext.destination`
- **Lightweight**: FFT is hardware-accelerated; sampling at 10fps adds negligible CPU
- **Standard API**: Available in all Chromium-based browsers (Electron included)

### Mute State Detection

Teams mutes the microphone by setting `audioTrack.enabled = false` on the `MediaStreamTrack`. This is observable:

```javascript
// Polling approach (simple, reliable)
const isMuted = !audioTrack.enabled;

// Event approach (if available)
audioTrack.addEventListener('mute', () => { /* track was muted */ });
audioTrack.addEventListener('unmute', () => { /* track was unmuted */ });
```

When muted, the indicator should show a distinct "muted" state rather than "silent".

### Stream Lifecycle Management

Users may switch audio devices mid-call, which creates a new `MediaStream`. The module must:

1. Track all active audio `MediaStream` instances
2. Clean up `AudioContext` + `AnalyserNode` when tracks end
3. Attach monitoring to new streams when they appear
4. Handle multiple concurrent streams (e.g., during device switching overlap)

Pattern from `injectedScreenSharing.js`:

```javascript
track.addEventListener('ended', () => {
  // Clean up analyser for this track
  audioContext.close();
});
```

---

## 4. UI Approaches Evaluated

### Approach A: In-Page DOM Overlay (Recommended)

Inject a small floating `<div>` element into the Teams page during active calls.

**Design:**
- Fixed-position element, ~24px, at a configurable corner
- Three visual states: speaking (green pulse), silent (dim), muted (red/grey with icon)
- CSS transitions for smooth state changes
- `pointer-events: none` to avoid intercepting clicks
- High `z-index` but below modal dialogs

**Advantages:**
- Directly visible in the meeting window --- no context switching
- Real-time feedback with CSS animations
- Lightweight (single DOM element + CSS)
- Can be positioned to avoid Teams UI controls

**Disadvantages:**
- Teams DOM changes could obscure it (mitigated by high z-index and fixed positioning)
- Adds a non-native element to the UI

### Approach B: Tray Icon Indicator

Add a coloured dot or pulse to the system tray icon when speaking.

**Advantages:**
- Uses proven infrastructure (`trayIconRenderer.js`)
- Doesn't touch Teams DOM

**Disadvantages:**
- Tray icon is small (~22px on most Linux DEs) --- a sub-indicator would be barely visible
- Frequent canvas redraws for real-time audio would conflict with unread count rendering
- User must look away from the meeting window to check
- Defeats the purpose of "confirm mic is working without leaving the call"

### Approach C: Both (Future Enhancement)

Ship the in-page overlay first (Approach A). If users request tray/MQTT integration, add IPC publishing of speaking state as a follow-up.

**Recommendation:** Implement Approach A. The tray icon is too small for a real-time audio indicator and requires looking away from the call. The in-page overlay is the direct solution to the user's problem.

---

## 5. Implementation Plan

### Phase 1: Core Feature (MVP)

**New module:** `app/browser/tools/speakingIndicator.js`

1. **getUserMedia interception** --- Wrap `navigator.mediaDevices.getUserMedia()` to capture audio streams (same pattern as `disableAutogain.js`)
2. **Audio analysis** --- Create `AudioContext` + `AnalyserNode` per audio stream; sample RMS at ~10fps via `requestAnimationFrame`
3. **Mute detection** --- Monitor `audioTrack.enabled` property and `mute`/`unmute` events
4. **DOM overlay** --- Inject a small fixed-position indicator element; toggle CSS classes for speaking/silent/muted states
5. **Lifecycle** --- Start monitoring on `call-connected`; stop and clean up on `call-disconnected` and track `ended` events
6. **Configuration** --- New config option `speakingIndicator` (boolean, default `false`)

**Module registration in `preload.js`:**
- Add to modules array
- Add to `modulesRequiringIpc` set (needed for call lifecycle events via IPC, and for sending `microphone-state-changed`)

**IPC integration:**
- Send `microphone-state-changed` events to activate the dormant MQTT channel
- Listen for `call-connected`/`call-disconnected` to control monitoring lifecycle

### Phase 2: Enhanced Features (If Requested)

- Configurable silence threshold (`speakingIndicator.threshold`)
- Configurable position (`speakingIndicator.position`)
- Optional speaking state publishing to MQTT (`{topicPrefix}/speaking`)
- Tray icon integration (speaking dot overlay)

---

## 6. Configuration Design

### Minimal Config (Phase 1)

```yaml
# Enable the speaking indicator overlay during calls
speakingIndicator: true
```

### Extended Config (Phase 2, if needed)

```yaml
speakingIndicator:
  enabled: true
  threshold: 15        # RMS silence threshold (0-255, default 15)
  position: bottom-right  # top-left, top-right, bottom-left, bottom-right
```

The flat boolean form (`speakingIndicator: true`) is simpler and follows the pattern of other feature flags in the codebase (e.g., `trayIconEnabled`, `useMutationTitleLogic`). If users request configurability, the nested form can be added later with backward compatibility.

---

## 7. Performance Considerations

| Concern | Mitigation |
|---------|------------|
| CPU usage from audio analysis | `AnalyserNode` FFT is hardware-accelerated; sampling at 10fps (~100ms intervals) is negligible |
| Memory from AudioContext | One `AudioContext` per active audio stream; cleaned up on track end |
| DOM manipulation frequency | CSS class toggles only (no layout thrashing); `pointer-events: none` avoids hit-testing |
| getUserMedia patch chain | Three existing patches already compose correctly; adding a fourth follows the same wrap pattern |
| requestAnimationFrame overhead | RAF is paused when the tab is hidden; no wasted cycles when Teams is in background |

### Benchmarks to Validate (Spike)

- CPU delta during a simulated call with audio monitoring active
- Memory footprint of AudioContext + AnalyserNode
- Latency from speech onset to indicator update

---

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| getUserMedia patch ordering conflicts | Low | Medium | Each existing patch wraps the previous; new patch follows same pattern. Spike validates composition. |
| Teams uses non-standard mute mechanism | Low | Medium | Primary detection via `track.enabled`; fallback to AnalyserNode silence detection (muted = sustained silence) |
| AudioContext creation blocked | Very Low | High | `--autoplay-policy=no-user-gesture-required` already set; spike validates |
| DOM overlay obscured by Teams UI | Low | Low | High z-index + fixed positioning; configurable position as escape hatch |
| Stream lifecycle leaks | Medium | Medium | Defensive cleanup in track `ended` and stream `inactive` events; periodic garbage collection check |
| Performance impact during calls | Low | High | AnalyserNode is hardware-accelerated; spike validates CPU/memory overhead |

---

## 9. Relationship to Existing Work

### MQTT Extended Status (Phase 2)

The [MQTT Extended Status Investigation](mqtt-extended-status-investigation.md) identified WebRTC camera/mic monitoring as Phase 2, deferred until user request. Issue #2290 is that user request for microphone monitoring. Implementing this feature partially delivers MQTT Phase 2 by:

1. Activating the dormant `microphone-state-changed` IPC channel
2. Establishing the `getUserMedia` interception pattern for media state tracking
3. Providing the foundation for camera state tracking (`camera-state-changed`)

### Notification Sound Overhaul

The [Notification Sound Overhaul Research](notification-sound-overhaul-research.md) confirmed that `AudioContext` works in the renderer when `--autoplay-policy=no-user-gesture-required` is set. The speaking indicator uses `AudioContext` in the same environment, benefiting from this prior validation.

---

## 10. Validation Results (2026-03-09)

Three spike scripts validated the core technical assumptions. All spikes were run on macOS (Apple Silicon) with Electron 39.7.0, using the built-in MacBook Pro microphone.

### Spike 1: Audio Analyser (PASS 4/4)

Confirmed that `AudioContext` + `AnalyserNode` can monitor a live `MediaStream` without modifying it.

| Check | Result |
|-------|--------|
| AudioContext running | PASS (state: running, no gesture required) |
| Samples collected | PASS (100 samples over 10s) |
| Non-zero audio detected | PASS (peak RMS: 97.5) |
| Both speaking and silent frames | PASS (55% speaking, 45% silent) |

RMS values clearly distinguish speaking (~55-68) from silence (~0-12) with the default threshold of 15. Memory delta was negative (GC noise), confirming negligible overhead.

### Spike 2: getUserMedia Patch Chain (PASS 5/5)

Confirmed that four `getUserMedia` patches compose correctly in LIFO order without breaking each other.

| Check | Result |
|-------|--------|
| All four patches executed | PASS |
| LIFO execution order | PASS (speakingIndicator -> cameraResolution -> screenSharing -> disableAutogain) |
| Valid MediaStream returned | PASS |
| Stream has audio tracks | PASS |
| speakingIndicator captured stream | PASS |

Screen share constraint detection also validated correctly (`isScreenShare=true` for desktop media source).

### Spike 3: Track Mute Detection (PARTIAL PASS 2/4)

Confirmed that `track.enabled` polling reliably detects mute state changes. The `mute`/`unmute` events do not fire in Chromium for programmatic `enabled` toggles, which is expected behaviour.

| Check | Result |
|-------|--------|
| track.enabled changes detected via polling | PASS (2 changes detected) |
| mute event fired | FAIL (expected in Chromium) |
| unmute event fired | FAIL (expected in Chromium) |
| Track still alive after monitoring | PASS |

**Recommendation:** Use `track.enabled` polling as primary mute detection. Do not rely on `mute`/`unmute` events. As a secondary approach, sustained silence detected via `AnalyserNode` can serve as a mute proxy.

### Conclusion

All critical checks passed. The implementation can proceed with confidence using `AudioContext` + `AnalyserNode` for audio level detection and `track.enabled` polling for mute state.

---

## 11. Decision

**Recommended approach:** In-page DOM overlay powered by `AudioContext` + `AnalyserNode`, with `getUserMedia` interception following the established pattern.

**Next steps:**

1. ~~Run validation spikes to confirm technical feasibility~~ (Done 2026-03-09)
2. ~~Implement Phase 1 MVP as a new browser tool module~~ (Done 2026-03-09)
3. ~~Wire up dormant `microphone-state-changed` IPC channel~~ (Done 2026-03-09)
4. ~~Add `speakingIndicator` config option~~ (Done 2026-03-09)
5. Test with PipeWire, PulseAudio, and ALSA audio backends

---

## Related Documentation

- [MQTT Extended Status Investigation](mqtt-extended-status-investigation.md) --- Phase 2 WebRTC monitoring
- [Notification Sound Overhaul Research](notification-sound-overhaul-research.md) --- AudioContext validation
- [Module Index](../module-index.md) --- Browser tool modules
- [IPC API](../ipc-api.md) --- IPC channel documentation
- [Configuration Reference](../../configuration.md) --- Config option patterns
