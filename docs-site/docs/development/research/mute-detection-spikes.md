# Mute Detection Spikes (Phase 2)

**Date:** 2026-03-10
**Status:** Complete — Spike A confirmed, implemented in production
**Parent Research:** [Speaking Indicator Research](speaking-indicator-research.md)
**ADR:** [ADR-019](../adr/019-webrtc-getstats-audio-level-detection.md)
**Issue:** [#2290 - Add real-time speaking indicator](https://github.com/IsmaelMartinez/teams-for-linux/issues/2290)

---

## Why the Current Implementation Falls Short

The Phase 1 implementation intercepts `getUserMedia()` and attaches an `AnalyserNode` to the raw microphone stream. This reveals whether the user's mic is physically capturing audio, but it cannot detect Teams' mute state because:

- Our `AnalyserNode` taps the stream _before_ Teams processes it
- Teams mutes at its own internal SDK level, not by toggling `track.enabled`
- The raw mic continues to deliver audio frames regardless of Teams' mute button

This means the indicator currently shows "speaking" (green) even when the user is muted in Teams — the opposite of useful.

The correct signal for "what Teams is actually transmitting" lives downstream of getUserMedia: in Teams' internal audio graph or in the WebRTC outbound pipeline.

---

## Spike Overview

Four spikes explore different Web Audio API and WebRTC API surfaces that operate on the post-processing audio signal.

| Spike | API Surface | Tests | Confidence |
|-------|-------------|-------|------------|
| A | `RTCPeerConnection.getStats()` | `media-source.audioLevel`, packet rate | High |
| B | `AudioContext` graph interception | GainNode gain changes, disconnections | Medium |
| C | `AudioWorklet` raw PCM analysis | Zero-frame ratio from getUserMedia stream | Low (same stream problem) |
| D | `RTCRtpSender.replaceTrack / setParameters` | Track replacement, encoding parameters, DTX | Medium |

---

## Spike A: RTCPeerConnection.getStats() Audio Level

**File:** `spikes/mute-detection/spike-a-webrtc-getstats.js`

The WebRTC stats API exposes a `media-source` report containing `audioLevel` — the RMS audio level of the source _as captured by the browser engine_, which is the signal Teams feeds into the encoder. If Teams zeros the signal when muting (silence injection), `audioLevel` drops to ~0. The `outbound-rtp` report adds packet flow information.

**What to observe:**
- `media-source.audioLevel` value when speaking vs muted in Teams
- `outbound-rtp.packetsSent` rate — does it change when muted?

**Promising because:** `media-source` is populated by the browser's own media pipeline, not Teams' JavaScript. If Teams routes audio through a WebRTC track, the browser reports what actually flows into the encoder.

**Risk:** Teams may not populate `media-source` for all browser versions, or the track Teams sends may not be the getUserMedia track (could be a processed clone).

**How to run:** Paste into DevTools console while in a call. Toggle mute. Compare `audioLevel` values.

---

## Spike B: AudioContext Internal Graph

**File:** `spikes/mute-detection/spike-b-audiocontext-graph.js`

Teams uses the Web Audio API internally to process audio. This spike patches `AudioContext` before Teams creates its own, intercepting every `GainNode`, `MediaStreamSource`, and `MediaStreamDestination` creation. When Teams mutes, it likely operates via one of:

- Setting a `GainNode.gain.value = 0` (silence injection)
- Calling `disconnect()` on a node (routing break)
- Replacing a `MediaStreamDestination` stream

**What to observe:**
- Which nodes Teams creates and how they connect
- Whether any GainNode gain drops to 0 when muting
- Whether disconnect() is called on any audio path when muting

**Note:** Must be injected _before_ joining a call so it captures AudioContext instances Teams creates during call setup.

**Promising because:** If Teams is doing standard Web Audio processing, this will directly expose the mute mechanism. Many WebRTC applications implement mute via a gain node.

**Risk:** Teams may use native Electron/Chromium internals that bypass the Web Audio API JavaScript layer entirely.

---

## Spike C: AudioWorklet Raw PCM Frame Analysis

**File:** `spikes/mute-detection/spike-c-audioworklet-pcm.js`

Uses `AudioWorkletProcessor` — which runs on the audio thread — to inspect individual 128-sample frames. The key metric is `zeroRatio`: the fraction of frames where all samples are exactly `0.0`. A hardware/OS-level mute (or a stream that is actively zeroed) produces `zeroRatio → 1.0`, while ambient silence produces low-amplitude non-zero noise.

**What to observe:**
- `zeroRatio` during speaking, natural silence, and Teams mute
- Whether Teams mute produces all-zero frames or just low-amplitude frames

**Honest limitation:** This is still attached to the raw `getUserMedia` stream, so it faces the same fundamental problem as Phase 1. The value of this spike is to characterise whether Teams' mute is a _hardware_ mute (which would produce true zeros at the source) or a _software_ mute above the media layer (which would not affect raw mic frames).

**If zeroRatio stays low while muted:** Teams mutes above the getUserMedia layer — Spike A and B are the path forward.
**If zeroRatio goes to 1.0 when muted:** Teams uses a system-level mute — the current AnalyserNode approach can be repaired by using a very strict zero-frame threshold.

---

## Spike D: RTCRtpSender Track Interception

**File:** `spikes/mute-detection/spike-d-rtcrtpsender.js`

Previous research confirmed `replaceTrack` isn't called when muting, but this spike also monitors `setParameters()` (which can disable encodings via `active: false` or zero the bitrate) and tracks the packet send rate delta. Opus DTX (Discontinuous Transmission) causes packets to stop during silence — but mute should also stop packets. Watching the rate delta can distinguish:

- Normal speech: steady packet rate (~50 pps for Opus)
- Natural silence with DTX: packet rate drops significantly
- Muted: packet rate drops to near-zero (similar to DTX silence, but sustained)

The `media-source.audioLevel` stat queried per-sender is the cleaner signal if Teams populates it.

**What to observe:**
- Does packet rate drop when muted?
- Is the rate distinguishable from natural silence?
- Does `setParameters` get called?

---

## Recommended Testing Sequence

Run spikes in this order for maximum information per session:

1. **Before joining a call:** Paste Spike B (graph interception must run before Teams creates AudioContext)
2. **Before joining a call:** Also paste Spike D (RTCPeerConnection must be patched early)
3. **After joining a call:** Paste Spike A for getStats polling
4. **After joining a call:** Paste Spike C for AudioWorklet analysis
5. **Alternate between speaking, silence, and Teams mute** — note which spikes show clear transitions

---

## Results (2026-03-10)

The spikes were integrated directly into the app via `muteDetectionSpike.js` (since removed) and run during a live Teams call with speaking, muting, unmuting, and ending cycles.

**Spike A — PASS (clear, unambiguous signal):**

| Phase | audioLevel | pps |
|-------|-----------|-----|
| Joining | 0.00000 | 0–21 |
| Speaking | 0.001–0.447 | ~50 |
| Muted | 0.00000 | 4 (DTX) |
| Unmuted + speaking | 0.17–0.28 | ~50 |

`media-source.audioLevel` drops to exactly `0.00000` when muted. Teams zeroes the signal completely rather than applying a small gain, making the threshold trivial. Natural silence produces small non-zero ambient noise values, so muted and silent are cleanly distinguishable.

**Spike B — No signal observed:** No GainNode gain changes during mute/unmute cycles. Teams does not use a JS-layer GainNode for muting.

**Spike C — Failed (CSP):** AudioWorklet module failed to attach — Blob URL rejected by Content-Security-Policy. Moot since Spike A solved the problem.

**Spike D — No signal observed:** No `replaceTrack` or `setParameters` calls during mute/unmute. Packet rate drops to ~4 pps (DTX comfort noise) when muted, but this is indistinguishable from natural silence without `audioLevel`. Not usable as a standalone mute signal.

**Conclusion:** Spike A is the production solution. See [ADR-019](../adr/019-webrtc-getstats-audio-level-detection.md) for the full decision record. The `speakingIndicator.js` module was rewritten to use this approach.

---

## Relationship to Phase 1

If a working mute signal is found, the `SpeakingIndicator` module would gain a third state:

- Green (pulsing): speaking — audio is flowing
- Grey: silent — mic open but quiet
- Red: muted — Teams mute active

The `microphone-state-changed` IPC channel (currently dormant) would also become usable for MQTT publishing.
