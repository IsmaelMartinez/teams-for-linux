---
id: 019-webrtc-getstats-audio-level-detection
---

# ADR 019: WebRTC getStats() for Microphone State Detection

## Status

Implemented

## Context

The speaking indicator feature (issue #2290) needed a way to detect both whether the user is speaking and whether the microphone is muted in Teams. The Phase 1 implementation intercepted `getUserMedia()` and used `AudioContext` + `AnalyserNode` to sample RMS levels from the raw microphone stream. This approach correctly detected speech but could not detect Teams' internal mute state.

The core problem: our `AnalyserNode` tapped the stream before Teams processed it. Teams applies mute at an internal SDK level, so the raw microphone continues to deliver audio frames regardless of the Teams mute button state. Four approaches were investigated in Phase 1 and all failed to detect mute: `track.enabled` polling, all-zero frame detection, `RTCRtpSender.replaceTrack` interception, and React internal service observation.

To find a reliable mute signal, four spike scripts were instrumented into the app and run during a live Teams call with cycles of speaking, muting, and unmuting:

- **Spike A** (`RTCPeerConnection.getStats()`): Polled `media-source.audioLevel` and `outbound-rtp` packet rate
- **Spike B** (AudioContext graph): Intercepted GainNode creation and gain value changes
- **Spike C** (AudioWorklet): Analysed raw PCM frames for all-zero ratio
- **Spike D** (RTCRtpSender): Monitored `replaceTrack`, `setParameters`, packet delta

The spike data was unambiguous. The `media-source.audioLevel` stat from `RTCPeerConnection.getStats()` drops to exactly `0.00000` when the Teams mute button is engaged, and rises to non-zero values the moment unmuted. No GainNode changes (Spike B), no `replaceTrack` or `setParameters` calls (Spike D) were observed, confirming Teams handles mute below the JS audio graph layer. The AudioWorklet (Spike C) failed to attach due to a CSP restriction on Blob URLs, but was rendered unnecessary by Spike A's clear result.

Observed data from the live call:

| Phase | audioLevel | pps |
|-------|-----------|-----|
| Joining | 0.00000 | 0–21 |
| Speaking (unmuted) | 0.001–0.447 | ~50 |
| Muted | 0.00000 | 4 (DTX comfort noise) |
| Speaking (unmuted again) | 0.17–0.28 | ~50 |

When muted, `outbound-rtp` drops to ~4 packets/sec (Opus DTX comfort noise) and `audioLevel` is exactly zero. When speaking, `audioLevel` ranges 0.01–0.45 and packet rate is ~50 pps. The distinction between muted and natural silence relies on `audioLevel`: Teams zeroes the signal completely when muted, whereas an open mic in a quiet room produces small non-zero ambient noise values.

## Decision

Replace the `getUserMedia`/`AnalyserNode` approach in `speakingIndicator.js` with `RTCPeerConnection.getStats()` polling, reading `media-source.audioLevel` every 150ms.

**State mapping:**
- `audioLevel < 0.0001` → **muted** (Teams zeroes signal exactly; overlay: red)
- `0.0001 ≤ audioLevel < 0.01` → **silent** (mic open, no speech; overlay: grey)
- `audioLevel ≥ 0.01` → **speaking** (audio being transmitted; overlay: green, pulsing)

**Implementation:** Intercept `window.RTCPeerConnection` in `init()` to capture all peer connections Teams creates during a call. On `call-connected`, start a polling loop that calls `pc.getStats()` on each captured connection and reads the `media-source` entry where `kind === 'audio'`. A concurrent-poll guard (`#polling` flag) prevents overlapping async calls if a getStats round-trip takes longer than 150ms. On `call-disconnected`, stop polling and clear the captured connections array.

**Implementation file:** `app/browser/tools/speakingIndicator.js`

## Consequences

### Positive

- Three observable states instead of two: speaking, silent, and muted
- The signal is what Teams actually transmits — accurate speaking detection even through Teams' own audio processing (noise suppression, echo cancellation)
- No AudioContext or AnalyserNode required — simpler code, fewer resources
- No getUserMedia interception needed — doesn't interfere with `disableAutogain.js`, `cameraResolution.js`, or other modules in the getUserMedia patch chain
- `media-source.audioLevel` is a standard W3C WebRTC stat available in all Chromium versions Electron uses
- Enables the dormant `microphone-state-changed` IPC channel for MQTT integration when mute state changes

### Negative

- Requires RTCPeerConnection interception at init time — if Teams creates a peer connection before `speakingIndicator.init()` runs, it won't be captured. In practice this doesn't occur: peer connections are only created when joining a call, which happens long after DOMContentLoaded
- `media-source` stats are not present before Teams adds an audio track to the connection — the overlay stays in its last state until stats appear, which is acceptable
- The muted/silent boundary (0.0001) assumes Teams zeroes the signal exactly. If a future Teams version applies a very small gain instead of exact zero when muted, the boundary would need adjustment

### Neutral

- The 150ms poll interval produces ~7 updates per second, well within human perception thresholds for mute state changes
- The `#polling` concurrent-call guard means a slow `getStats()` round-trip delays the next sample rather than causing queue build-up
- The captured peer connections array is cleared on `call-disconnected` to avoid memory retention

## Alternatives Considered

### getUserMedia / AnalyserNode (Phase 1 approach — superseded)

Intercept `getUserMedia`, create `AudioContext` + `AnalyserNode`, sample RMS from the raw mic stream. Works for speaking detection but cannot detect mute because the raw stream continues to flow regardless of Teams' mute button. Replaced by this ADR.

**Why superseded:** Fundamental architectural mismatch — monitors pre-processing audio, not what Teams transmits.

### AudioContext graph interception (Spike B)

Intercept `AudioContext` constructor to monitor `GainNode` gain values. Would detect mute if Teams used a JS-layer GainNode. Spike B ran during a full call with mute/unmute cycles and no GainNode gain changes were observed.

**Why rejected:** Teams does not implement mute via a JS GainNode. Mute is applied at a native/SDK layer below the Web Audio API.

### RTCRtpSender.replaceTrack / setParameters (Spike D)

Monitor `replaceTrack` and `setParameters` calls on audio senders. Previous research and the spike confirmed neither is called when muting.

**Why rejected:** Teams does not use these APIs for mute. Confirmed by live testing.

### AudioWorklet raw PCM zero-ratio (Spike C)

Use `AudioWorkletProcessor` to count all-zero 128-sample frames as a proxy for hardware mute. Failed to attach due to CSP blocking Blob URL module loading.

**Why rejected:** CSP restriction prevents Blob URL AudioWorklet modules. Also fundamentally limited to the raw mic stream (same problem as Spike A/Phase 1). Spike A made this unnecessary.

### outbound-rtp packet rate as mute signal (Spike A/D secondary metric)

When muted, packet rate drops to ~4 pps (DTX comfort noise) vs ~50 pps when speaking. The problem is DTX also causes packet drops during natural silence — the two are indistinguishable without `audioLevel`. Not suitable as a standalone mute signal.

**Why rejected as primary:** Cannot distinguish muted from silent. Used only as confirmatory data.

## Related

- Issue [#2290](https://github.com/IsmaelMartinez/teams-for-linux/issues/2290) — speaking indicator feature request
- [Speaking Indicator Research](../research/speaking-indicator-research.md) — Phase 1 implementation
- [Mute Detection Spikes](../research/mute-detection-spikes.md) — spike scripts and full result data
- `app/browser/tools/speakingIndicator.js` — implementation
