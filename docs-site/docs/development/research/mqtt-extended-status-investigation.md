# MQTT Extended Status Investigation (Issue #1938)

:::info Phase 1 Shipped — Phase 2 Awaiting User Feedback
Infrastructure, LWT, and call state publishing are shipped. Phase 2 (WebRTC camera/mic monitoring) deferred until a user requests it.
:::

**Date**: 2025-11-12
**Updated**: 2026-01-18
**Issue**: [#1938 - Extended MQTT Status Fields](https://github.com/IsmaelMartinez/teams-for-linux/issues/1938)
**Status**: Phase 1 Complete (Infrastructure + Documentation + LWT + WebRTC Call State Fallback) | Phase 2 DEFERRED

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

Topics using existing `topicPrefix`:

- `\{topicPrefix\}/connected` → `"true"` or `"false"` (uses MQTT LWT)
- `\{topicPrefix\}/camera` → `"true"` or `"false"`
- `\{topicPrefix\}/microphone` → `"true"` or `"false"`
- `\{topicPrefix\}/in-call` → `"true"` or `"false"`

### Configuration

Uses existing MQTT configuration structure:

```json
{
  "mqtt": {
    "enabled": true,
    "topicPrefix": "teams"
  }
}
```

If MQTT is enabled, all media status events are published. No per-feature toggles needed.

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
    ipcMain.on('camera-state-changed', this.#handleCameraChanged.bind(this));

    // Publish MQTT status when microphone state changes
    ipcMain.on('microphone-state-changed', this.#handleMicrophoneChanged.bind(this));

    console.info('[MQTTMediaStatusService] Initialized');
  }

  async #handleCallConnected() {
    if (this.#config.mqtt?.call?.enabled) {
      await this.#mqttClient.publish(
        `$\{this.#config.mqtt.topicPrefix}/$\{this.#config.mqtt.call.topic}`,
        'true',
        { retain: true }
      );
    }
  }

  async #handleCallDisconnected() {
    if (this.#config.mqtt?.call?.enabled) {
      await this.#mqttClient.publish(
        `$\{this.#config.mqtt.topicPrefix}/$\{this.#config.mqtt.call.topic}`,
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
        `$\{this.#config.mqtt.topicPrefix}/$\{this.#config.mqtt.camera.topic}`,
        String(enabled),
        { retain: true }
      );
    }
  }

  async #handleMicrophoneChanged(event, enabled) {
    if (this.#config.mqtt?.microphone?.enabled) {
      await this.#mqttClient.publish(
        `$\{this.#config.mqtt.topicPrefix}/$\{this.#config.mqtt.microphone.topic}`,
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

### Phase 1a: Core Infrastructure ✅ COMPLETED (2025-11-30)

- [x] Add generic `publish()` method to `app/mqtt/index.js`
- [x] Create `app/mqtt/mediaStatusService.js` following service pattern
- [x] Add IPC channel allowlist entries in `app/security/ipcValidator.js`:
  - [x] `camera-state-changed`
  - [x] `microphone-state-changed`
- [x] Initialize service in `app/index.js`
- [x] Add configuration schema for semantic categories (deferred to Phase 1b)

### Phase 1b: Documentation ✅ COMPLETED (2025-11-30)

- [x] Document new MQTT topics in `docs-site/docs/configuration.md`
- [x] Update MQTT section with camera/microphone/in-call topics

### Phase 1c: Connection State & Last Will ✅ COMPLETED (2025-11-30)

- [x] Implement MQTT Last Will and Testament (LWT)
- [x] Publish connection state on connect/disconnect
- [x] Document `{topicPrefix}/connected` topic

### Phase 2: WebRTC Monitoring (Camera/Mic) - 🔄 RESUMING

**Status**: Resumption triggered 2026-04-24 by issue [#2465](https://github.com/IsmaelMartinez/teams-for-linux/issues/2465). User requested the exact Phase 2 topics (`{topicPrefix}/microphone`, `{topicPrefix}/camera`) for Home Assistant and Stream Deck automation, which is the feedback #1938 was held open waiting for. Scoped but not yet scheduled.

Phase 1 provides call state (`in-call`), connection state (`connected`) and screen-sharing state via existing IPC events. Phase 2 adds camera and microphone state monitoring.

**Course correction (2026-03 → 2026-04):** The original plan used `getUserMedia` interception with `track.enabled` polling for both camera and mic. A first attempt on 2026-03-09 sent `microphone-state-changed` via that path but was stripped out the following day because `track.enabled` did not reflect Teams' mute state reliably. The microphone side has since been solved differently by the speaking indicator (PR #2299), which uses `RTCPeerConnection.getStats()` and the `media-source.audioLevel` stat. Teams zeros that stat to exactly 0.0 on mute, giving unambiguous three-state detection (speaking / silent / muted). The follow-up research for wiring that into MQTT lives in [`mqtt-microphone-state-research.md`](./mqtt-microphone-state-research.md).

The camera side still needs `getUserMedia` + `track.enabled` polling since there is no WebRTC stat equivalent for "camera off", and that approach has not been validated for camera specifically. Needs a short proof-of-concept before wiring to MQTT.

**Scoped work:**

Microphone (high confidence, research complete):
- [ ] Wire `app/browser/tools/speakingIndicator.js` to emit `microphone-state-changed` on state transitions. Plan in [`mqtt-microphone-state-research.md`](./mqtt-microphone-state-research.md).
- [ ] Decide whether `mqtt.enabled` should force-activate the speaking indicator's WebRTC monitoring even when the visual overlay is off, mirroring the pattern PR #2406 used for call detection.

Camera (medium confidence, needs validation):
- [ ] Proof-of-concept: does `track.enabled` on the camera's video track flip when the user clicks Teams' camera toggle? If not, investigate alternatives (track `mute`/`unmute` events, `getStats()` frame rate dropping to 0, `track.readyState`) before committing to a pattern.
- [ ] If validated, create `app/browser/tools/mediaStatus.js` with `getUserMedia` interceptor + screen-share filtering (reuse `isScreenShare` from `injectedScreenSharing.js`) + `track.enabled` polling on video tracks only.
- [ ] Wire `camera-state-changed` IPC from the browser tool.

Speaking (low cost, nice-to-have):
- [ ] Publish `{topicPrefix}/speaking` boolean from the same speaking-indicator state machine for "not a good moment to ring the doorbell" automations.

### Phase 3: Documentation & Testing

- [x] Run `npm run generate-ipc-docs` to update auto-generated docs
- [x] Test with UI buttons AND keyboard shortcuts
- [x] Test call connect/disconnect publishes correct state
- [ ] Test camera/mic toggle publishes correct state

---

## Implementation Notes

### Phase 1a - Core Infrastructure (Completed 2025-11-30)

**What was implemented:**

1. **Generic MQTT Publish Method** (`app/mqtt/index.js:118-138`)
   - Added `publish(topic, payload, options)` method to MQTTClient
   - Handles both string and object payloads (auto-converts objects to JSON)
   - Configurable retain and QoS options with sensible defaults
   - Reusable for all future MQTT publishing needs

2. **MQTT Media Status Service** (`app/mqtt/mediaStatusService.js`)
   - New service following established pattern (like ScreenSharingService)
   - Uses private fields for encapsulation (#mqttClient, #topicPrefix)
   - Registers IPC listeners for:
     - `call-connected` - Publishes "true" to `\{topicPrefix\}/in-call`
     - `call-disconnected` - Publishes "false" to `\{topicPrefix\}/in-call`
     - `camera-state-changed` - Publishes camera state to `\{topicPrefix\}/camera`
     - `microphone-state-changed` - Publishes microphone state to `\{topicPrefix\}/microphone`
   - Simple design: if MQTT enabled, publish all events
   - Only publishes actual known state changes (no assumptions about camera/mic on call end)
   - Proper error handling and logging

3. **IPC Security Allowlist** (`app/security/ipcValidator.js:52-54`)
   - Added `camera-state-changed` to allowlist
   - Added `microphone-state-changed` to allowlist
   - Maintains security by explicitly whitelisting new channels

4. **Service Initialization** (`app/index.js:12, 48, 300-301`)
   - Imported MQTTMediaStatusService
   - Added mqttMediaStatusService variable
   - Initialize service after mqttClient connects (only if MQTT enabled)
   - Follows same initialization pattern as other services

5. **IPC Documentation** (`docs-site/docs/development/ipc-api-generated.md`)
   - Auto-generated documentation updated with new channels
   - Now documents 42 IPC channels (was 40)

**What's working:**
- Call state publishing is fully functional (leverages existing call-connected/call-disconnected events)
- Infrastructure ready for camera/microphone state monitoring (Phase 2)
- Generic publish() method ready for any future MQTT publishing needs

### Phase 1b - Documentation (Completed 2025-11-30)

**What was implemented:**

1. **Configuration Documentation** (`docs-site/docs/configuration.md:160-171`)
   - Added "Published Topics" table showing all MQTT topics
   - Documents `\{topicPrefix\}/in-call`, `\{topicPrefix\}/camera`, `\{topicPrefix\}/microphone`
   - Clear explanation of payload format (`"true"` or `"false"` strings)
   - Notes that Phase 2 topics (camera/microphone) are coming
   - Explains retained message behavior

**What's working:**
- Users can now see exactly what topics will be published when MQTT is enabled
- Clear documentation for home automation integration

**What's next (Phase 1c):**
- Add MQTT Last Will and Testament (LWT) for connection state tracking

### Phase 1c - Connection State & Last Will (Completed 2025-11-30)

**What was implemented:**

1. **MQTT Last Will and Testament** (`app/mqtt/index.js:50-60`)
   - Configured LWT on broker connection
   - LWT message: `{topicPrefix}/connected` → `"false"`
   - Broker auto-publishes if app crashes or network fails

2. **Connection State Publishing** (`app/mqtt/index.js:75, 238-239`)
   - Publish `connected=true` when successfully connected
   - Publish `connected=false` on graceful disconnect
   - Both use retained messages for immediate subscriber awareness

3. **Documentation** (`docs-site/docs/configuration.md:166,174`)
   - Added `{topicPrefix}/connected` topic to published topics table
   - Explained LWT behavior for handling stale state

**Problem solved:**
- App crashes while in a call → `in-call=true` retained forever ❌
- With LWT → `connected=false` published → consumers can invalidate stale state ✅

**Home automation benefit:**
```yaml
# Invalidate all state when app disconnects
automation:
  - trigger:
      platform: mqtt
      topic: "teams/connected"
      payload: "false"
    action:
      # Reset all Teams state
      service: input_boolean.turn_off
      target:
        entity_id: input_boolean.teams_in_call
```

**What's next (Phase 2):**
- Implement WebRTC monitoring in browser process to detect camera/mic state
- Create mediaStatus.js browser tool with getUserMedia interception
- Wire camera/mic state changes to send IPC events that trigger MQTT publishing

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

## Integration with MQTT Commands

Future bidirectional MQTT support with "state queries" would enable:

- `toggle-mute` command → query current `teams/microphone` state
- `toggle-video` command → query current `teams/camera` state
- Home automation can check state before deciding action

**Synergy**: The generic `publish()` method serves both status publishing (this issue) and command acknowledgments (potential MQTT commands feature).

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
