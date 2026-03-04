# Speaking Indicator Validation Spikes

**Issue:** [#2290](https://github.com/IsmaelMartinez/teams-for-linux/issues/2290)
**Research:** [speaking-indicator-research.md](../../docs-site/docs/development/research/speaking-indicator-research.md)

These spike scripts validate the core technical assumptions for the speaking indicator feature before implementation begins.

## How to Run

All three spikes are designed to be injected into the Teams renderer process via Electron DevTools console or loaded as a preload script. They run in the browser context where `navigator.mediaDevices` and `AudioContext` are available.

### Quick Test (DevTools Console)

1. Start Teams for Linux: `npm start`
2. Join a meeting or start a test call
3. Open DevTools: `Ctrl+Shift+I`
4. Copy-paste each spike script into the Console tab
5. Observe the console output for results

### Preload Script Test

For a more realistic test, temporarily add a spike to the preload module list:

```javascript
// In app/browser/preload.js, temporarily add:
{ name: "speakingIndicatorSpike", path: "../../spikes/speaking-indicator/spike-audio-analyser" }
```

**Remember to remove the spike entry after testing.**

## Spikes

### 1. spike-audio-analyser.js

**Validates:** AudioContext + AnalyserNode can monitor a MediaStream without modifying it.

**Tests:**
- AudioContext creation succeeds (depends on `--autoplay-policy` switch)
- AnalyserNode receives frequency data from a live microphone stream
- RMS calculation produces reasonable values (non-zero when speaking, near-zero when silent)
- No audio feedback loop (analyser not connected to destination)
- Memory and CPU overhead measurement

**Expected output:**
- Periodic log lines showing RMS level, peak level, and speaking/silent state
- Performance summary after 10 seconds showing CPU time and memory delta

### 2. spike-getUserMedia-chain.js

**Validates:** Four getUserMedia patches compose correctly without breaking each other.

**Tests:**
- Simulates the patch chain: disableAutogain -> screenSharing -> cameraResolution -> speakingIndicator
- Each patch wraps the previous correctly
- All patches execute in order when getUserMedia is called
- The final stream is a valid MediaStream with audio tracks
- No patches are lost or short-circuited

**Expected output:**
- Log lines showing each patch executing in order
- Confirmation that the returned stream has audio tracks
- Report of any patches that failed to execute

### 3. spike-track-mute-detection.js

**Validates:** audioTrack.enabled and mute/unmute events reliably detect mute state.

**Tests:**
- `audioTrack.enabled` reflects current mute state
- Programmatic `track.enabled = false` is detectable
- `mute` and `unmute` events fire when track state changes
- Teams mute button changes are reflected in track properties

**Expected output:**
- Initial track state (enabled/muted)
- Event log when mute state changes
- Instructions to click Teams mute button and observe output

## Success Criteria

All three spikes must pass for the feature to proceed to implementation:

1. **Audio analyser:** RMS values correctly distinguish speaking from silence; CPU overhead < 1%
2. **Patch chain:** All four patches execute; returned stream is valid
3. **Mute detection:** Track.enabled reflects mute state; at least one detection method works reliably

## After Validation

If all spikes pass, proceed with implementation following the plan in the research document. If any spike fails, document the failure and identify an alternative approach before implementing.
