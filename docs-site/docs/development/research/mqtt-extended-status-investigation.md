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
    // Monitor video tracks (camera state)
    stream.getVideoTracks().forEach(track => {
      track.addEventListener('ended', () => publishCameraState(false));
      track.addEventListener('mute', () => publishCameraState(false));
      track.addEventListener('unmute', () => publishCameraState(true));
    });

    // Monitor audio tracks (microphone state)
    stream.getAudioTracks().forEach(track => {
      track.addEventListener('ended', () => publishMicState(false));
      track.addEventListener('mute', () => publishMicState(false));
      track.addEventListener('unmute', () => publishMicState(true));
    });

    publishCallState(true);
    return stream;
  });
}
```

**Advantages**:
- ✅ Uses stable Web APIs (not Microsoft-specific)
- ✅ Direct measurement of actual device usage
- ✅ Immune to Teams UI changes
- ✅ Proven pattern (`app/browser/tools/disableAutogain.js` uses identical technique)
- ✅ Captures real device state, not just button states
- ✅ Works with keyboard shortcuts (monitors actual stream, not UI)

**Limitations**:
- ⚠️ Requires careful MediaStream lifecycle management
- ⚠️ Need to handle stream replacement scenarios (camera switch)

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
- [ ] Add MediaStreamTrack event listeners
- [ ] Add IPC channel for extended status (`mqtt-extended-status-changed`)
- [ ] Update MQTT publisher to handle extended topics
- [ ] Add configuration schema and defaults
- [ ] Update `preload.js` to load new module
- [ ] Document IPC API in `docs/ipc-api.md`
- [ ] Add logging with `[MQTT_EXTENDED]` prefix

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
   → Recommendation: Future enhancement, not MVP (screen sharing already has dedicated monitoring in `screenSharing/`)

4. **Minimum refresh interval for MQTT publishing?**
   → Recommendation: Debounce rapid state changes (100ms), publish immediately on state change

---

## References

- **Issue #1938**: https://github.com/IsmaelMartinez/teams-for-linux/issues/1938
- **Issue #1832**: https://github.com/IsmaelMartinez/teams-for-linux/issues/1832
- **Existing pattern**: `app/browser/tools/disableAutogain.js` (getUserMedia interception)
- **Existing MQTT**: `app/browser/tools/mqttStatusMonitor.js`
- **MediaStream API**: https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_API
- **MediaStreamTrack events**: https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack

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
