# MQTT Extended Status Investigation (Issue #1938)

**Date**: 2025-11-12
**Issue**: [#1938 - Extended MQTT Status Fields](https://github.com/IsmaelMartinez/teams-for-linux/issues/1938)
**Related**: [#1832 - Microsoft Graph API Integration](https://github.com/IsmaelMartinez/teams-for-linux/issues/1832)
**Status**: Investigation Complete - Ready for Implementation

## Problem Statement

Current MQTT integration (`mqttStatusMonitor.js`) only publishes Teams presence status (Available/Busy/DND/Away/BRB) by scraping DOM elements. Users need more granular state information for home automation:

- **Camera on/off** - Red LED indicator
- **Microphone on/off** - Orange LED indicator
- **In active call/meeting** - Yellow LED indicator
- **Idle** - Green LED indicator

**Current limitation**: Calendar events trigger "busy" status regardless of actual meeting participation, making automation unreliable.

## Implementation Approaches

### Approach 1: WebRTC Media Stream Monitoring ⭐ **RECOMMENDED**

**Core Strategy**: Intercept `getUserMedia()` calls and monitor MediaStream track states

**How it works**:
```javascript
// Pattern already proven in disableAutogain.js
navigator.mediaDevices.getUserMedia = function(constraints) {
  return originalGetUserMedia.call(this, constraints).then(stream => {
    // IMPORTANT: Filter out screen sharing streams
    // Screen sharing streams have audio disabled (see injectedScreenSharing.js)
    // Only monitor regular call streams for accurate mic/camera state
    const isScreenShare = constraints?.video && (
      constraints.video.chromeMediaSource === "desktop" ||
      constraints.video.mandatory?.chromeMediaSource === "desktop" ||
      constraints.video.chromeMediaSourceId ||
      constraints.video.mandatory?.chromeMediaSourceId
    );

    if (isScreenShare) {
      // Skip monitoring screen sharing streams
      return stream;
    }

    // Monitor video tracks (camera state) - regular calls only
    stream.getVideoTracks().forEach(track => {
      // Event-based monitoring for immediate response
      track.addEventListener('ended', () => publishCameraState(false));
      track.addEventListener('mute', () => publishCameraState(false));
      track.addEventListener('unmute', () => publishCameraState(true));

      // Initial state
      if (track.enabled && track.readyState === 'live') {
        publishCameraState(true);
      }

      // CRITICAL: Poll track.enabled property for programmatic changes
      // Teams may use track.enabled = false instead of mute events
      monitorTrackEnabled(track, 'camera');
    });

    // Monitor audio tracks (microphone state) - regular calls only
    stream.getAudioTracks().forEach(track => {
      // Event-based monitoring for immediate response
      track.addEventListener('ended', () => publishMicState(false));
      track.addEventListener('mute', () => publishMicState(false));
      track.addEventListener('unmute', () => publishMicState(true));

      // Initial state
      if (track.enabled && track.readyState === 'live') {
        publishMicState(true);
      }

      // CRITICAL: Poll track.enabled property for programmatic changes
      // Teams may use track.enabled = false instead of mute events
      monitorTrackEnabled(track, 'microphone');
    });

    publishCallState(true);
    return stream;
  });
}

// Helper function to monitor track.enabled property changes
function monitorTrackEnabled(track, type) {
  let lastEnabledState = track.enabled;

  // Poll every 500ms to detect programmatic enabled changes
  const intervalId = setInterval(() => {
    if (track.readyState === 'ended') {
      clearInterval(intervalId);
      return;
    }

    const currentEnabledState = track.enabled && track.readyState === 'live';
    if (currentEnabledState !== lastEnabledState) {
      console.debug(`[MQTT_EXTENDED] ${type} track.enabled changed: ${lastEnabledState} -> ${currentEnabledState}`);
      lastEnabledState = currentEnabledState;

      if (type === 'camera') {
        publishCameraState(currentEnabledState);
      } else if (type === 'microphone') {
        publishMicState(currentEnabledState);
      }
    }
  }, 500);

  // Cleanup when track ends
  track.addEventListener('ended', () => clearInterval(intervalId));
}
```

**Advantages**:
- ✅ Uses stable Web APIs (not Microsoft-specific)
- ✅ Direct measurement of actual device usage
- ✅ Immune to Teams UI changes
- ✅ Proven pattern (`app/browser/tools/disableAutogain.js` uses identical technique)
- ✅ Captures real device state, not just button states
- ✅ Works with keyboard shortcuts (monitors actual stream, not UI)
- ✅ Hybrid monitoring (events + polling) catches all state change methods

**Limitations**:
- ⚠️ Requires careful MediaStream lifecycle management
- ⚠️ Need to handle stream replacement scenarios (camera switch)
- ⚠️ Polling adds minimal overhead (500ms intervals per track)

**Implementation Complexity**: Medium
**Maintenance Burden**: Low
**Fragility**: Very Low

---

### Approach 2: Enhanced with Microsoft Graph API

**Core Strategy**: Combine WebRTC monitoring (Approach 1) with Graph API data for richer context

**Additional data from Graph API** (when #1832 is implemented):
- **Presence API**: Official Teams presence status
- **Calendar API**: Meeting subject, organizer, duration
- **Confidence scoring**: Cross-validate multiple sources

**Enhanced MQTT payload example**:
```json
{
  "camera": true,
  "microphone": true,
  "inCall": true,
  "confidence": "high",
  "meeting": {
    "subject": "Sprint Planning",
    "organizer": "alice@company.com",
    "startTime": "2025-11-12T14:00:00Z",
    "endTime": "2025-11-12T15:00:00Z",
    "scheduled": true
  },
  "presence": "InACall",
  "sources": {
    "webrtc": true,
    "graph_presence": true,
    "graph_calendar": true
  },
  "timestamp": "2025-11-12T14:05:32Z"
}
```

**Confidence levels**:
- **High**: WebRTC active + Graph "InACall" + Calendar event
- **Medium**: WebRTC active OR (Graph InACall + Calendar)
- **Low**: Only one source confirming

**Advantages**:
- ✅ Maximum reliability through redundancy
- ✅ Rich meeting context for advanced automation
- ✅ Aligns with #1832 roadmap (no extra work)
- ✅ Future-proof with multiple fallback layers
- ✅ Enterprise users get enhanced features

**Limitations**:
- ⚠️ Graph API only for enterprise users (but matches primary audience)
- ⚠️ Depends on #1832 implementation timeline

**Implementation Complexity**: Medium-High
**Maintenance Burden**: Low
**Fragility**: Very Low

---

### Approach 3: DOM Fallback (Safety Net Only)

**Core Strategy**: Monitor ARIA attributes as last resort when WebRTC unavailable

**Implementation**:
```javascript
// Monitor accessibility attributes (more stable than CSS classes)
const micButton = document.querySelector('[aria-label*="microphone"]');
const observer = new MutationObserver(() => {
  const pressed = micButton.getAttribute('aria-pressed') === 'true';
  publishMicState(!pressed); // Inverted: pressed = muted
});
```

**Use case**: Fallback only if WebRTC monitoring fails

**Advantages**:
- ✅ Simple implementation
- ✅ Better than nothing

**Limitations**:
- ❌ Still fragile (Microsoft can change ARIA attributes)
- ❌ Doesn't capture keyboard shortcuts immediately
- ❌ Can desync with actual device state

**Recommendation**: Implement only as backup, mark as low confidence

---

## Rejected Approaches

### Network Traffic Analysis
❌ **Rejected**: Too complex, HTTPS encryption limits visibility, high maintenance burden

### Native OS Integration
❌ **Rejected**: Platform-specific implementations, captures all apps (not just Teams), overengineered

### Keyboard Shortcut Interception
❌ **Rejected**: Requires state tracking, can desync, doesn't capture actual device state

---

## Recommended Implementation Plan

### Phase 1: WebRTC Foundation (Immediate - Solves #1938)

**Timeline**: 1-2 weeks
**Deliverable**: Working camera/mic/call state via WebRTC monitoring

**New module**: `app/browser/tools/mqttExtendedStatus.js`

**Architecture**:
```
Browser Context (Teams web app)
  ↓
mqttExtendedStatus.js (intercept getUserMedia, monitor tracks)
  ↓ IPC
Main Process
  ↓
MQTT Publisher (existing mqttClient.js)
  ↓
MQTT Broker → Home Automation
```

**MQTT Topics** (configurable):
- `teams/extended/camera` → `true`/`false`
- `teams/extended/microphone` → `true`/`false`
- `teams/extended/in-call` → `true`/`false`
- `teams/extended/full-state` → JSON payload

**Configuration** (`config.json`):
```json
{
  "mqtt": {
    "enabled": true,
    "extended": {
      "enabled": true,
      "topics": {
        "camera": "teams/extended/camera",
        "microphone": "teams/extended/microphone",
        "inCall": "teams/extended/in-call",
        "fullState": "teams/extended/full-state"
      }
    }
  }
}
```

**Implementation checklist**:
- [ ] Create `app/browser/tools/mqttExtendedStatus.js`
- [ ] Implement getUserMedia interceptor (similar to `disableAutogain.js`)
- [ ] Add screen sharing stream detection logic (reuse from `injectedScreenSharing.js`)
- [ ] Implement hybrid monitoring approach:
  - [ ] Add MediaStreamTrack event listeners (mute/unmute/ended)
  - [ ] Add track.enabled polling (500ms interval)
  - [ ] Add interval cleanup on track end
- [ ] Add IPC channel for extended status (`mqtt-extended-status-changed`)
- [ ] Update MQTT publisher to handle extended topics
- [ ] Add configuration schema and defaults
- [ ] Update `preload.js` to load new module
- [ ] Document IPC API in `docs/ipc-api.md`
- [ ] Add logging with `[MQTT_EXTENDED]` prefix
- [ ] Test with UI buttons AND keyboard shortcuts

---

### Phase 2: Graph API Enhancement (Future - Coordinate with #1832)

**Timeline**: Align with #1832 implementation (6-8 weeks from #1832 start)
**Deliverable**: Rich MQTT payloads with meeting context

**Implementation**:
- Wait for Graph API integration (#1832) to complete
- Add Graph Presence API calls
- Add Graph Calendar API integration
- Implement confidence scoring
- Cross-validate WebRTC + Graph data
- Publish enhanced payloads

**Enhancement is additive** - Phase 1 works standalone, Phase 2 enriches it

---

## Technical Considerations

### Critical: track.enabled vs mute/unmute Events

**Important discovery**: MediaStreamTrack state can be controlled via two different mechanisms:

1. **Event-based**: `track.mute()` / `track.unmute()` → Fires `mute`/`unmute` events
2. **Property-based**: `track.enabled = false/true` → Does NOT fire events

**The problem**: Web applications (including Teams) commonly use `track.enabled = false` to "mute" tracks programmatically. This is the standard way UI buttons control media state. **This does not fire mute/unmute events.**

**Impact**: Monitoring only `mute`/`unmute` events will miss state changes triggered by UI buttons or keyboard shortcuts that use `track.enabled`.

**Solution: Hybrid Monitoring Approach**

We must use a combination of:
1. **Event listeners** (for immediate response to explicit mute/unmute calls)
2. **Polling `track.enabled`** (to catch programmatic property changes)

```javascript
// Event-based monitoring (immediate)
track.addEventListener('mute', () => publishState(false));
track.addEventListener('unmute', () => publishState(true));

// Property-based monitoring (polling at 500ms intervals)
setInterval(() => {
  const currentState = track.enabled && track.readyState === 'live';
  if (currentState !== lastState) {
    publishState(currentState);
    lastState = currentState;
  }
}, 500);
```

**Why 500ms polling interval**:
- Fast enough for human perception (UI button clicks)
- Low overhead (2 property checks per second per track)
- Typical call has 2-3 tracks max (1 audio, 1-2 video)
- Total overhead: ~4-6 checks/second = negligible

**Cleanup**: Stop polling when track ends to prevent memory leaks.

This hybrid approach ensures we catch state changes regardless of how Teams implements mute/unmute controls.

---

### Interaction with Existing Screen Sharing Code

**Critical consideration**: The codebase already intercepts `getUserMedia()` in `app/screenSharing/injectedScreenSharing.js` to prevent audio echo/feedback during screen sharing (issues #1871, #1896).

**How the existing code works**:
1. Intercepts `getUserMedia()` calls
2. Detects screen sharing streams by checking for `chromeMediaSource === "desktop"` or `chromeMediaSourceId`
3. **Forces `audio = false`** in constraints for screen sharing streams only
4. Regular call streams (camera + microphone) are NOT affected

**Impact on MQTT Extended Status**:
- ✅ **Regular call streams** have audio tracks → We can monitor microphone state
- ⚠️ **Screen sharing streams** have no audio tracks → We must skip these
- ✅ **Screen sharing and regular calls are separate streams** → No conflict

**Solution**: Use the same detection logic to filter out screen sharing streams:

```javascript
// Reuse the same screen share detection logic from injectedScreenSharing.js
const isScreenShare = constraints?.video && (
  constraints.video.chromeMediaSource === "desktop" ||
  constraints.video.mandatory?.chromeMediaSource === "desktop" ||
  constraints.video.chromeMediaSourceId ||
  constraints.video.mandatory?.chromeMediaSourceId
);

if (isScreenShare) {
  // Skip monitoring screen sharing streams - they have audio disabled
  return stream;
}

// Only monitor regular call streams
stream.getAudioTracks().forEach(track => {
  // Monitor microphone state...
});
```

**Why this works**:
- Teams creates **separate getUserMedia calls** for:
  - Regular call (camera + microphone) → Has audio tracks → We monitor this
  - Screen sharing (desktop capture) → No audio tracks → We skip this
- Both interceptors can coexist by checking the same `isScreenShare` condition
- The screen sharing interceptor runs first (already in place), then ours runs
- No interference because we're just adding event listeners, not modifying streams

**Execution order**:
1. `injectedScreenSharing.js` intercepts getUserMedia → Disables audio for screen shares
2. `mqttExtendedStatus.js` intercepts getUserMedia → Detects screen share → Skips monitoring
3. For regular calls: `mqttExtendedStatus.js` adds track listeners → Monitors state

### IPC Communication

**New IPC channel**:
```javascript
// Renderer → Main
ipcRenderer.invoke('mqtt-extended-status-changed', {
  data: {
    camera: true,
    microphone: true,
    inCall: true,
    timestamp: '2025-11-12T14:05:32Z',
    source: 'webrtc'
  }
});
```

**Main process handler**:
```javascript
// In mqttClient.js or new mqtt handler
ipcMain.handle('mqtt-extended-status-changed', async (event, { data }) => {
  if (!config.mqtt?.extended?.enabled) return;

  await publishToMqtt('teams/extended/camera', data.camera);
  await publishToMqtt('teams/extended/microphone', data.microphone);
  await publishToMqtt('teams/extended/in-call', data.inCall);
  await publishToMqtt('teams/extended/full-state', JSON.stringify(data));
});
```

### Security

- No new security concerns (same renderer context as `disableAutogain.js`)
- IPC validation already handled by existing `ipcValidator.js`
- No external API calls in Phase 1

### Compatibility

- **Electron version**: ✅ Works with current Electron 37.3.1
- **Web APIs**: ✅ `getUserMedia` and MediaStreamTrack are stable W3C standards
- **Teams versions**: ✅ Independent of Teams UI/React version
- **Platforms**: ✅ Cross-platform (uses standard Web APIs)

---

## Testing Strategy

### Manual Testing
1. Start Teams for Linux with MQTT extended enabled
2. Join test meeting
3. Toggle camera on/off → Verify MQTT publishes to `teams/extended/camera`
4. Toggle microphone on/off → Verify MQTT publishes to `teams/extended/microphone`
5. Leave meeting → Verify `teams/extended/in-call` = false
6. Test keyboard shortcuts (Ctrl+Shift+M, Ctrl+Shift+O)

### Home Assistant Testing
```yaml
# Example Home Assistant automation
automation:
  - alias: "Office LED - Teams Camera On"
    trigger:
      platform: mqtt
      topic: "teams/extended/camera"
      payload: "true"
    action:
      service: light.turn_on
      target:
        entity_id: light.office_led
      data:
        rgb_color: [255, 0, 0]  # Red
```

### Logging
All state changes logged with `[MQTT_EXTENDED]` prefix for debugging:
```
[MQTT_EXTENDED] Camera state changed: false -> true
[MQTT_EXTENDED] Microphone state changed: false -> true
[MQTT_EXTENDED] Call state changed: false -> true
[MQTT_EXTENDED] Publishing to MQTT: teams/extended/camera = true
```

---

## Success Criteria

**Phase 1**:
- [ ] Camera state accurately reflects actual camera usage
- [ ] Microphone state accurately reflects actual microphone usage
- [ ] In-call state correctly detects active meetings
- [ ] State changes publish to MQTT within 500ms
- [ ] Works with keyboard shortcuts (not just UI clicks)
- [ ] No false positives from other apps
- [ ] Zero regressions in existing MQTT status monitoring

**Phase 2** (future):
- [ ] Meeting context published when Graph API available
- [ ] Confidence scoring implemented
- [ ] Graceful fallback when Graph API unavailable
- [ ] Enhanced payloads work for enterprise users

---

## Open Questions

1. **Should we publish individual topics AND full-state JSON?**
   → Recommendation: Yes, for flexibility (some automations prefer simple topics, others want rich JSON)

2. **How to handle multiple concurrent streams?**
   → Recommendation: OR logic (any active stream = device active)

3. **Should we detect screen sharing separately?**
   → Recommendation: Future enhancement, not MVP (screen sharing already has dedicated monitoring in `screenSharing/` with IPC events)

4. **How to handle the interceptor execution order with injectedScreenSharing.js?**
   → Recommendation: Both interceptors work independently by using the same `isScreenShare` detection logic. No conflicts because we only add listeners, not modify constraints.

5. **What if a user is in a call AND screen sharing?**
   → Recommendation: Monitor both streams separately - call stream for mic/camera, ignore screen share stream for audio

6. **Minimum refresh interval for MQTT publishing?**
   → Recommendation: Debounce rapid state changes (100ms), publish immediately on state change

7. **How to detect state changes when Teams uses track.enabled instead of mute events?**
   → Recommendation: Hybrid approach - Event listeners for immediate response + polling track.enabled at 500ms intervals. See "Critical: track.enabled vs mute/unmute Events" section for full explanation.

---

## References

- **Issue #1938**: https://github.com/IsmaelMartinez/teams-for-linux/issues/1938
- **Issue #1832**: https://github.com/IsmaelMartinez/teams-for-linux/issues/1832
- **Existing pattern**: `app/browser/tools/disableAutogain.js` (getUserMedia interception)
- **Existing MQTT**: `app/browser/tools/mqttStatusMonitor.js`
- **MediaStream API**: https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_API
- **MediaStreamTrack events**: https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack
- **MediaStreamTrack.enabled**: https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/enabled

---

## Decision

**Proceed with Phase 1: WebRTC Monitoring**

This approach:
- Solves the immediate user need (#1938)
- Uses proven, stable techniques (pattern exists in codebase)
- Is future-proof (aligns with #1832 without depending on it)
- Has low maintenance burden
- Provides accurate, real-time device state monitoring

Phase 2 can be implemented later when Graph API integration is available, providing a natural evolution path without blocking immediate value delivery.
