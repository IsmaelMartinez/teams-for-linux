# MQTT Extended Status Investigation (Issue #1938)

**Date**: 2025-11-12
**Updated**: 2025-11-21
**Issue**: [#1938 - Extended MQTT Status Fields](https://github.com/IsmaelMartinez/teams-for-linux/issues/1938)
**Status**: Investigation Complete - Ready for Implementation

## User Request

User **vbartik** requested three additional MQTT status fields for RGB LED automation:

1. **Camera on/off** → Red LED
2. **Microphone on/off** → Orange LED
3. **In active call** → Yellow LED

**Current limitation**: Existing MQTT integration only publishes presence status (Available/Busy/DND/Away/BRB) which triggers "busy" even for scheduled meetings you haven't joined, making automation unreliable.

---

## Solution: Hybrid Approach (Existing IPC + WebRTC Monitoring)

**Key insight**: The codebase already has IPC channels for call and screen sharing state. We only need WebRTC monitoring for camera/microphone.

### Existing IPC Channels to Leverage

| State | IPC Channel | Location |
|-------|-------------|----------|
| Call connected | `call-connected` | `app/mainAppWindow/browserWindowManager.js:150` |
| Call disconnected | `call-disconnected` | `app/mainAppWindow/browserWindowManager.js:152` |
| Screen sharing started | `screen-sharing-started` | `app/screenSharing/service.js:22` |
| Screen sharing stopped | `screen-sharing-stopped` | `app/screenSharing/service.js:24` |

### What Still Needs WebRTC Monitoring

- **Camera state** - Not currently tracked via IPC
- **Microphone state** - Not currently tracked via IPC

**Approach**: Intercept `getUserMedia()` calls and monitor MediaStreamTrack states for camera/mic only.

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

## Architecture: New Service Pattern

Following the established pattern (see `CustomNotificationManager`, `ScreenSharingService`):

### Main Process: MQTTMediaStatusService

```javascript
// app/mqtt/mediaStatusService.js
const { ipcMain } = require('electron');

class MQTTMediaStatusService {
  #mqttClient;
  #config;

  constructor(mqttClient, config) {
    this.#mqttClient = mqttClient;
    this.#config = config;
  }

  initialize() {
    // Publish MQTT status when call connects
    ipcMain.on('call-connected', this.#handleCallConnected.bind(this));

    // Publish MQTT status when call disconnects
    ipcMain.on('call-disconnected', this.#handleCallDisconnected.bind(this));

    // Publish MQTT status when camera state changes
    ipcMain.on('mqtt-camera-changed', this.#handleCameraChanged.bind(this));

    // Publish MQTT status when microphone state changes
    ipcMain.on('mqtt-microphone-changed', this.#handleMicrophoneChanged.bind(this));

    console.info('[MQTTMediaStatusService] Initialized');
  }

  async #handleCallConnected() {
    if (this.#config.mqtt?.call?.enabled) {
      await this.#mqttClient.publish(
        `${this.#config.mqtt.topicPrefix}/${this.#config.mqtt.call.topic}`,
        'true',
        { retain: true }
      );
    }
  }

  async #handleCallDisconnected() {
    if (this.#config.mqtt?.call?.enabled) {
      await this.#mqttClient.publish(
        `${this.#config.mqtt.topicPrefix}/${this.#config.mqtt.call.topic}`,
        'false',
        { retain: true }
      );
    }
    // Also reset camera/mic when call ends
    await this.#handleCameraChanged(null, false);
    await this.#handleMicrophoneChanged(null, false);
  }

  async #handleCameraChanged(event, enabled) {
    if (this.#config.mqtt?.camera?.enabled) {
      await this.#mqttClient.publish(
        `${this.#config.mqtt.topicPrefix}/${this.#config.mqtt.camera.topic}`,
        String(enabled),
        { retain: true }
      );
    }
  }

  async #handleMicrophoneChanged(event, enabled) {
    if (this.#config.mqtt?.microphone?.enabled) {
      await this.#mqttClient.publish(
        `${this.#config.mqtt.topicPrefix}/${this.#config.mqtt.microphone.topic}`,
        String(enabled),
        { retain: true }
      );
    }
  }
}

module.exports = MQTTMediaStatusService;
```

### Generic `publish()` Method for MQTTClient

Add to existing `app/mqtt/index.js`:

```javascript
async publish(topic, payload, options = {}) {
  if (!this.isConnected || !this.client) {
    console.debug('MQTT not connected, skipping publish');
    return;
  }

  const payloadString = typeof payload === 'object'
    ? JSON.stringify(payload)
    : String(payload);

  await this.client.publish(topic, payloadString, {
    retain: options.retain ?? true,
    qos: options.qos ?? 0
  });
}
```

---

## Implementation Checklist

### Phase 1: Core Infrastructure

- [ ] Add generic `publish()` method to `app/mqtt/index.js`
- [ ] Create `app/mqtt/mediaStatusService.js` following service pattern
- [ ] Add IPC channel allowlist entries in `app/security/ipcValidator.js`:
  - [ ] `mqtt-camera-changed`
  - [ ] `mqtt-microphone-changed`
- [ ] Initialize service in `app/index.js`
- [ ] Add configuration schema for semantic categories

### Phase 2: WebRTC Monitoring (Camera/Mic)

- [ ] Create `app/browser/tools/mqttMediaStatus.js`
- [ ] Implement getUserMedia interceptor
- [ ] Add screen sharing detection (reuse `isScreenShare` logic)
- [ ] Implement hybrid track monitoring:
  - [ ] Event listeners (mute/unmute/ended)
  - [ ] Poll track.enabled (500ms interval)
  - [ ] Cleanup intervals on track end
- [ ] Update `preload.js` to load module

### Phase 3: Documentation & Testing

- [ ] Run `npm run generate-ipc-docs` to update auto-generated docs
- [ ] Test with UI buttons AND keyboard shortcuts
- [ ] Test call connect/disconnect publishes correct state
- [ ] Test camera/mic toggle publishes correct state

---

## Testing

1. Join test meeting
2. Toggle camera → Verify `teams/camera` publishes `"true"`/`"false"`
3. Toggle microphone → Verify `teams/microphone` publishes `"true"`/`"false"`
4. Leave meeting → Verify `teams/in-call` publishes `"false"`
5. Test keyboard shortcuts (Ctrl+Shift+M, Ctrl+Shift+O)

---

## Future Expansion Opportunities

The semantic category pattern scales to many future use cases. This section documents potential categories users have requested.

### Messages & Notifications

**User requests**: Unread message count, new message notifications, @mentions

```json
{
  "mqtt": {
    "messageCount": {
      "enabled": false,
      "topic": "messages/unread"
    },
    "newMessage": {
      "enabled": false,
      "topic": "messages/new",
      "includeContent": false  // Privacy option
    },
    "mentions": {
      "enabled": false,
      "topic": "messages/mentions"
    }
  }
}
```

**Detection strategy**: DOM monitoring (title bar badge count: "Teams (3)")
- Existing `mutationTitle.js` already detects this!
- Just needs wiring to MQTT

**Potential topics**:
- `teams/messages/unread` → `"5"`
- `teams/messages/new` → JSON with sender, timestamp (if enabled)
- `teams/messages/mentions` → `"true"` when @mentioned

**Implementation priority**: High (already detected, easy win)

---

### Calendar & Meetings

**User requests**: Next meeting info, meeting starting soon alerts

```json
{
  "mqtt": {
    "nextMeeting": {
      "enabled": false,
      "topic": "calendar/next"
    },
    "meetingStarting": {
      "enabled": false,
      "topic": "calendar/starting-soon",
      "minutesBefore": 5
    }
  }
}
```

**Detection strategy**: Microsoft Graph API Calendar (Issue #1832 now implemented!)
- Use `graph-api-get-calendar-view` IPC channel for date range queries
- Poll periodically or subscribe to events
- See `app/graphApi/index.js` and `app/graphApi/ipcHandlers.js`

**Potential topics**:
- `teams/calendar/next` → JSON: `{ "subject": "Sprint Planning", "startTime": "2025-11-16T14:00:00Z" }`
- `teams/calendar/starting-soon` → `"true"` (5 minutes before)

**Use case**: Pre-warm RGB LEDs before meeting starts (e.g., blue = meeting in 5 min)

**Implementation priority**: Medium (Graph API now available, straightforward integration)

---

### Screen Sharing

**User requests**: Screen sharing state for automation

```json
{
  "mqtt": {
    "screenSharing": {
      "enabled": false,
      "topic": "screen-sharing"
    }
  }
}
```

**Detection strategy**: Already implemented!
- IPC events: `screen-sharing-started`, `screen-sharing-stopped`
- See `app/screenSharing/injectedScreenSharing.js`
- Just needs wiring to MQTT

**Potential topics**:
- `teams/screen-sharing` → `"true"`/`"false"`

**Implementation priority**: High (easy win - already detected)

---

### Recording & Privacy Indicators

**User requests**: Privacy indicator when call is being recorded

```json
{
  "mqtt": {
    "recording": {
      "enabled": false,
      "topic": "recording"
    },
    "transcription": {
      "enabled": false,
      "topic": "transcription"
    }
  }
}
```

**Detection strategy**: DOM monitoring (recording indicator banner)

**Potential topics**:
- `teams/recording` → `"true"`/`"false"`
- `teams/transcription` → `"true"`/`"false"`

**Use case**: Privacy indicator (LED turns purple when recording active)

**Implementation priority**: Medium (privacy use case)

---

### Reactions & Engagement

**User requests**: Hand raised state, reactions

```json
{
  "mqtt": {
    "handRaised": {
      "enabled": false,
      "topic": "hand-raised"
    },
    "reactions": {
      "enabled": false,
      "topic": "reactions/latest"
    }
  }
}
```

**Detection strategy**: DOM monitoring of reaction UI elements

**Potential topics**:
- `teams/hand-raised` → `"true"`/`"false"`
- `teams/reactions/latest` → `"thumbsup"`, `"heart"`, etc.

**Implementation priority**: Low (wait for user requests)

---

### Participant Count

**User requests**: Number of participants for room capacity automation

```json
{
  "mqtt": {
    "participantCount": {
      "enabled": false,
      "topic": "participants/count"
    }
  }
}
```

**Detection strategy**: DOM monitoring of participant roster panel

**Potential topics**:
- `teams/participants/count` → `"8"`

**Implementation priority**: Low (wait for user requests)

---

### Why Semantic Categories Scale

**Every category is what it represents:**
- `camera` = camera state (not "extended field 1")
- `messageCount` = message count (not "notification type A")
- `nextMeeting` = next meeting (not "calendar data")

**Not grouped by:**
- ❌ Technical implementation ("dom-based", "webrtc-based")
- ❌ Temporal classification ("extended", "new", "v2")
- ❌ Feature grouping ("notifications", "media")

**Configuration pattern** (consistent for all categories):
```json
{
  "categoryName": {
    "enabled": false,
    "topic": "path/to/topic",
    // Optional category-specific settings
  }
}
```

**Benefits**:
- Self-documenting (category name explains what it does)
- Independently configurable (enable only what you need)
- Consistent pattern (easy to understand)
- Privacy-friendly (opt-in per category)

---

### Detection Strategy Preference

| Category | Detection Method | Complexity | Fragility | Priority |
|----------|-----------------|------------|-----------|----------|
| **Camera/Mic/Call** | WebRTC streams | Medium | Low ✅ | Current |
| **Screen sharing** | IPC events | Low | Low ✅ | High |
| **Message count** | DOM (title) | Low | Medium | High |
| **Calendar** | Graph API | Medium | Low ✅ | Medium |
| **Recording** | DOM (banner) | Low | High ⚠️ | Medium |
| **Hand raised** | DOM (button) | Low | High ⚠️ | Low |
| **Reactions** | DOM (elements) | Low | High ⚠️ | Low |
| **Participants** | DOM (roster) | Medium | High ⚠️ | Low |

**Note**: Presence via Graph API returns 403 Forbidden (Teams token lacks `Presence.Read` scope). Use existing `user-status-changed` IPC channel instead.

**Preferred order**:
1. **Stable APIs first**: WebRTC, IPC, Graph API (now available!)
2. **DOM-based second**: Only if users request and accept fragility

---

### Implementation Strategy (YAGNI)

**Phase 1**: Current implementation (camera, microphone, call)

**Phase 2**: Easy wins (already detected)
- Screen sharing (IPC events exist)
- Message count (title monitoring exists)

**Phase 3**: Graph API integration (now available!)
- Calendar integration via `graph-api-get-calendar-view`
- Note: Presence endpoint returns 403 - use `user-status-changed` instead

**Phase 4**: Only if users request (fragile DOM scraping)
- Recording indicators
- Hand raised
- Participant count

**Key principle**: Add features **only when users request them**, starting with stable APIs before fragile DOM scraping.

---

### Generic `publish()` Supports Everything

The generic `publish()` method handles all current and future categories:

```javascript
// Current - camera/mic/call
await mqttClient.publish('teams/camera', 'true');

// Future - messages
await mqttClient.publish('teams/messages/unread', '5');

// Future - calendar
await mqttClient.publish('teams/calendar/next', JSON.stringify({
  subject: "Sprint Planning",
  startTime: "2025-11-16T14:00:00Z"
}));

// Future - screen sharing
await mqttClient.publish('teams/screen-sharing', 'true');
```

**One method, infinite use cases** - no refactoring needed when adding new categories.

---

## References

- **Issue #1938**: https://github.com/IsmaelMartinez/teams-for-linux/issues/1938
- **Issue #1832**: https://github.com/IsmaelMartinez/teams-for-linux/issues/1832 (Graph API - now implemented)
- **Service pattern**: `app/notificationSystem/index.js` (CustomNotificationManager)
- **Screen sharing service**: `app/screenSharing/service.js` (existing IPC channels)
- **Graph API client**: `app/graphApi/index.js` and `app/graphApi/ipcHandlers.js`
- **Graph API research**: `docs-site/docs/development/research/graph-api-integration-research.md`
- **Existing pattern**: `app/browser/tools/disableAutogain.js` (getUserMedia interception)
- **Existing MQTT**: `app/mqtt/index.js`
- **Screen sharing**: `app/screenSharing/injectedScreenSharing.js` (audio muting context)
- **IPC documentation**: `docs-site/docs/development/ipc-api-generated.md` (38 channels)
- **MediaStreamTrack.enabled**: https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/enabled

---

## Decision

**Implement Hybrid Approach: Existing IPC + WebRTC Stream Monitoring**

This approach:
- **Leverages existing infrastructure**: Uses `call-connected`/`call-disconnected` IPC channels already in the codebase
- **Follows established patterns**: Uses service pattern from `CustomNotificationManager`
- **Only adds what's missing**: WebRTC monitoring only for camera/mic state
- **Provides accurate, real-time state**: Camera and mic states detected via MediaStreamTrack
- **Enables future expansion**: Semantic categories and generic `publish()` support any future use case

**Simplified implementation**:
- Call state → Already detected, just wire to MQTT
- Screen sharing → Already detected, just wire to MQTT (future Phase 2)
- Camera/mic → Implement WebRTC monitoring with IPC bridge
