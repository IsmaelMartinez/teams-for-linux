# MQTT Extended Status Investigation (Issue #1938)

**Date**: 2025-11-12
**Issue**: [#1938 - Extended MQTT Status Fields](https://github.com/IsmaelMartinez/teams-for-linux/issues/1938)
**Status**: Investigation Complete - Ready for Implementation

## User Request

User **vbartik** requested three additional MQTT status fields for RGB LED automation:

1. **Camera on/off** → Red LED
2. **Microphone on/off** → Orange LED
3. **In active call** → Yellow LED

**Current limitation**: Existing MQTT integration only publishes presence status (Available/Busy/DND/Away/BRB) which triggers "busy" even for scheduled meetings you haven't joined, making automation unreliable.

---

## Solution: WebRTC Stream Monitoring

**Approach**: Intercept `getUserMedia()` calls and monitor MediaStreamTrack states to detect actual device usage.

### Why This Works

- Uses stable Web APIs (MediaStream, MediaStreamTrack)
- Monitors **actual device state**, not UI elements
- Immune to Teams UI changes (no DOM scraping)
- Proven pattern already used in `disableAutogain.js`

### Implementation Overview

```javascript
// Intercept getUserMedia (pattern from disableAutogain.js)
navigator.mediaDevices.getUserMedia = function(constraints) {
  return originalGetUserMedia.call(this, constraints).then(stream => {

    // Skip screen sharing streams (see "Screen Sharing Note" below)
    if (isScreenShare(constraints)) return stream;

    // Monitor camera state
    stream.getVideoTracks().forEach(track => {
      monitorTrack(track, 'camera');
    });

    // Monitor microphone state
    stream.getAudioTracks().forEach(track => {
      monitorTrack(track, 'microphone');
    });

    // In-call = any active stream
    publishInCall(true);

    return stream;
  });
}
```

### Track Monitoring (Hybrid Approach)

**Critical**: MediaStreamTrack state can change via two methods:
1. **Events** (mute/unmute) - Fires events
2. **Property** (track.enabled = false) - Does NOT fire events ⚠️

Teams UI buttons likely use `track.enabled`, so we need both:

```javascript
function monitorTrack(track, type) {
  // Event monitoring (immediate response)
  track.addEventListener('ended', () => publishState(type, false));
  track.addEventListener('mute', () => publishState(type, false));
  track.addEventListener('unmute', () => publishState(type, true));

  // Poll track.enabled property (catches UI button clicks)
  let lastState = track.enabled && track.readyState === 'live';
  const pollInterval = setInterval(() => {
    if (track.readyState === 'ended') {
      clearInterval(pollInterval);
      return;
    }
    const currentState = track.enabled && track.readyState === 'live';
    if (currentState !== lastState) {
      publishState(type, currentState);
      lastState = currentState;
    }
  }, 500); // Poll every 500ms

  track.addEventListener('ended', () => clearInterval(pollInterval));
}
```

**Why 500ms?** Fast enough for human perception, low overhead (~4-6 checks/second for typical call).

---

## Critical Implementation Details

### 1. Screen Sharing Audio Muting

**Issue**: The codebase already disables audio in screen sharing streams to prevent echo (see `injectedScreenSharing.js`, issues #1871, #1896).

**Solution**: Skip monitoring screen sharing streams using same detection logic:

```javascript
function isScreenShare(constraints) {
  return constraints?.video && (
    constraints.video.chromeMediaSource === "desktop" ||
    constraints.video.mandatory?.chromeMediaSource === "desktop" ||
    constraints.video.chromeMediaSourceId ||
    constraints.video.mandatory?.chromeMediaSourceId
  );
}
```

**Why this matters**: Teams creates separate streams for calls vs screen sharing. We only monitor the call stream.

### 2. MQTT Payload Format

MQTT payloads are **strings**, not JavaScript types. Convert booleans explicitly:

```javascript
// Renderer → Main IPC
ipcRenderer.invoke('mqtt-extended-status-changed', {
  camera: true,      // boolean in JS
  microphone: false,
  inCall: true
});

// Main → MQTT Broker
publishToMqtt('teams/camera', String(data.camera));  // "true" as string
```

---

## MQTT Topics

Three simple topics (configurable in `config.json`):

- `teams/camera` → `"true"` or `"false"`
- `teams/microphone` → `"true"` or `"false"`
- `teams/in-call` → `"true"` or `"false"`

### Configuration

Each category is independently configurable with semantic naming:

```json
{
  "mqtt": {
    "enabled": true,
    "topicPrefix": "teams",

    "camera": {
      "enabled": true,
      "topic": "camera"
    },

    "microphone": {
      "enabled": true,
      "topic": "microphone"
    },

    "call": {
      "enabled": true,
      "topic": "in-call"
    }
  }
}
```

**Benefits**:
- Each category clearly named (camera, microphone, call)
- Enable/disable each independently
- Customize topic names per category
- Self-documenting configuration

### Home Assistant Example

```yaml
automation:
  - alias: "RGB LED - Teams Camera On"
    trigger:
      platform: mqtt
      topic: "teams/camera"
      payload: "true"
    action:
      service: light.turn_on
      target:
        entity_id: light.office_led
      data:
        rgb_color: [255, 0, 0]  # Red
```

---

## Implementation Checklist

- [ ] Create `app/browser/tools/mqttExtendedStatus.js`
- [ ] Implement getUserMedia interceptor
- [ ] Add screen sharing detection (reuse `isScreenShare` logic)
- [ ] Implement hybrid track monitoring:
  - [ ] Event listeners (mute/unmute/ended)
  - [ ] Poll track.enabled (500ms interval)
  - [ ] Cleanup intervals on track end
- [ ] Add IPC channel `mqtt-extended-status-changed`
- [ ] Update MQTT publisher in main process:
  - [ ] Convert booleans to strings
  - [ ] Publish to three topics
- [ ] Add configuration schema
- [ ] Update `preload.js` to load module
- [ ] Document in `docs/ipc-api.md`
- [ ] Test with UI buttons AND keyboard shortcuts

---

## Testing

1. Join test meeting
2. Toggle camera → Verify `teams/camera` publishes `"true"`/`"false"`
3. Toggle microphone → Verify `teams/microphone` publishes `"true"`/`"false"`
4. Leave meeting → Verify `teams/in-call` publishes `"false"`
5. Test keyboard shortcuts (Ctrl+Shift+M, Ctrl+Shift+O)

---

## Future Expansion Opportunities

If needed in the future, this foundation enables:

- **Microsoft Graph API integration** (Issue #1832): Add meeting context (subject, organizer, scheduled time) from Graph Calendar API
- **Additional topics**: Screen sharing state, participant count, meeting duration
- **Confidence scoring**: Cross-validate WebRTC state with Graph Presence API
- **Home automation enhancements**: "About to join meeting" notifications (5 min before scheduled start)

These enhancements can be added **later without changing the core implementation**. Start simple, expand if users request it.

---

## References

- **Issue #1938**: https://github.com/IsmaelMartinez/teams-for-linux/issues/1938
- **Existing pattern**: `app/browser/tools/disableAutogain.js` (getUserMedia interception)
- **Existing MQTT**: `app/browser/tools/mqttStatusMonitor.js`
- **Screen sharing**: `app/screenSharing/injectedScreenSharing.js` (audio muting context)
- **MediaStreamTrack.enabled**: https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/enabled

---

## Decision

**Implement WebRTC Stream Monitoring**

This approach:
- Solves the user's exact request (camera, mic, in-call)
- Uses proven, stable techniques already in the codebase
- Is maintainable and future-proof
- Provides accurate, real-time device state
- Enables future expansion without refactoring
