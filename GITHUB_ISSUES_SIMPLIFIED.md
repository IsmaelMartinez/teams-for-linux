# GitHub Issues - Ready to Create

These are the **actionable** issues with no external blockers.

---

## Issue 1: Add Calendar Data Export via MQTT Command

**Title:** Add Calendar Data Export via MQTT Command

**Labels:** `enhancement`, `mqtt`, `graph-api`, `ready-for-implementation`

**Milestone:** Next Release

**Related Issues:** #1995, #1832

**Description:**

### Summary

Expose Teams calendar data via MQTT command to enable external processing (org-mode conversion, custom dashboards, etc.) without requiring separate authentication scripts.

### User Request

User confirmed in #1995 they want this approach for org-mode integration. Current workaround requires separate 2FA authentication that expires daily. Since users already log into Teams for Linux daily, the app can expose calendar data using existing authentication.

### Implementation

**Effort:** 2-3 hours (~20 lines of code)

Extend existing MQTT command handler in `app/index.js`:

```javascript
mqttClient.on('command', async (command) => {
  // ... existing commands (toggle-mute, toggle-video, etc.)

  if (command.action === 'get-calendar') {
    const { startDate, endDate } = command;
    if (!startDate || !endDate) {
      console.error('[MQTT] get-calendar requires startDate and endDate');
      return;
    }

    const result = await graphApiClient.getCalendarView(startDate, endDate);

    if (result.success) {
      mqttClient.publish('teams/calendar', JSON.stringify(result));
    } else {
      console.error('[MQTT] Failed to get calendar:', result.error);
    }
  }
});
```

### User Workflow

**1. User sends MQTT command:**
```bash
mosquitto_pub -h localhost -t teams/command -m '{
  "action": "get-calendar",
  "startDate": "2025-11-27T00:00:00Z",
  "endDate": "2025-12-04T23:59:59Z"
}'
```

**2. Teams publishes calendar data:**
Teams publishes raw Graph API JSON to `teams/calendar` topic.

**3. User subscribes and processes:**
```bash
mosquitto_sub -h localhost -t teams/calendar -C 1 | python3 ~/to_orgmode.py > calendar.org
```

**4. User schedules with cron:**
```bash
#!/bin/bash
# ~/.local/bin/fetch-teams-calendar.sh
START_DATE=$(date -I)
END_DATE=$(date -I -d "+7 days")
mosquitto_pub -h localhost -t teams/command -m "{
  \"action\":\"get-calendar\",
  \"startDate\":\"${START_DATE}T00:00:00Z\",
  \"endDate\":\"${END_DATE}T23:59:59Z\"
}"

sleep 1
mosquitto_sub -h localhost -t teams/calendar -C 1 | python3 ~/to_orgmode.py > ~/calendar.org

# Crontab: 0 6 * * * /home/user/.local/bin/fetch-teams-calendar.sh
```

### Architecture: Minimal Internal Logic

**What Teams for Linux does:**
- ✅ React to `get-calendar` MQTT command
- ✅ Fetch from Graph API
- ✅ Publish raw JSON to `teams/calendar` topic

**What Teams for Linux does NOT do:**
- ❌ Format conversion (org-mode, CSV, etc.)
- ❌ Internal scheduling/polling
- ❌ Complex data transformation
- ❌ File management

**User handles:** All formatting, scheduling, and processing externally.

### Data Format

Return exactly what Graph API returns:

```json
{
  "success": true,
  "data": {
    "value": [
      {
        "id": "AAMkAGI1...",
        "subject": "Team Standup",
        "start": {
          "dateTime": "2025-11-27T10:00:00.0000000",
          "timeZone": "UTC"
        },
        "end": {
          "dateTime": "2025-11-27T10:30:00.0000000",
          "timeZone": "UTC"
        },
        "location": { "displayName": "Teams Meeting" },
        "organizer": { "emailAddress": { "name": "John Doe", "address": "john@example.com" } },
        "attendees": [...],
        "bodyPreview": "Meeting description...",
        "onlineMeeting": { "joinUrl": "https://teams.microsoft.com/l/meetup/..." }
      }
    ]
  }
}
```

### Implementation Steps

1. Add `get-calendar` command handler to existing MQTT command event listener (~10 lines)
2. Validate command parameters (`startDate`, `endDate`) (~5 lines)
3. Fetch from Graph API using `graphApiClient.getCalendarView()` (~5 lines)
4. Publish raw JSON to `teams/calendar` topic
5. Update MQTT integration docs with workflow examples
6. Provide example scripts (Python converter to org-mode, shell script for cron)

### Testing

1. Enable Graph API in config (`graphApi.enabled: true`)
2. Send `get-calendar` MQTT command with date range
3. Verify calendar JSON published to `teams/calendar` topic
4. Test with user's external processor (Python script)
5. Verify cron integration works

### Risk Assessment

**Low Risk:**
- ✅ Minimal code changes (~20 lines)
- ✅ Uses existing Graph API client (battle-tested in #1832)
- ✅ Uses existing MQTT infrastructure
- ✅ No complex logic
- ✅ User controls everything externally
- ✅ Zero interference with existing functionality

### Success Criteria

- [ ] User can retrieve calendar data as JSON via MQTT command
- [ ] Data includes all Graph API fields (subject, start, end, location, attendees, etc.)
- [ ] User can process output with external tools (Python, shell scripts)
- [ ] No internal formatting/transformation logic
- [ ] No internal scheduling (user controls when to fetch)
- [ ] Documentation includes complete workflow with example scripts
- [ ] Works with MQTT broker (localhost Mosquitto or Home Assistant)
- [ ] User (#1995) successfully exports to org-mode

### References

- **Research Document:** `docs-site/docs/development/research/calendar-data-export-research.md`
- **Related Issues:** #1995 (user request), #1832 (Graph API infrastructure)
- **Related Research:**
  - `graph-api-integration-research.md` - Graph API infrastructure
  - `mqtt-commands-implementation.md` - MQTT command pattern
  - ADR-006 - Why CLI commands rejected
- **Existing Code:**
  - `app/graphApi/index.js` - GraphApiClient
  - `app/graphApi/ipcHandlers.js` - Calendar IPC channels
  - `app/mqtt/index.js` - MQTT client
  - `app/index.js` - MQTT command handler

---

## Issue 2: MQTT Extended Status Phase 1a - Call and Screen Sharing State

**Title:** MQTT Extended Status Phase 1a: Call and Screen Sharing State (Simplified)

**Labels:** `enhancement`, `mqtt`, `ready-for-implementation`

**Milestone:** Next Release

**Related Issues:** #1938

**Description:**

### Summary

Add MQTT status publishing for call and screen sharing state to enable home automation integration (RGB LED status indicators, presence systems, etc.).

**Phase 1a (This Issue):** Call + Screen Sharing state using existing IPC events
**Phase 1b (Future):** Camera + Microphone state using WebRTC monitoring

### User Request

User **vbartik** in #1938 requested extended status fields for RGB LED automation. They want to know when actually IN a call (not just "busy" presence status, which shows busy even for scheduled meetings not yet joined).

### Why Simplified First (Phase 1a)

**Existing IPC events already work:**
- `call-connected` / `call-disconnected` - app/mainAppWindow/browserWindowManager.js:150-152
- `screen-sharing-started` / `screen-sharing-stopped` - app/screenSharing/service.js:22-24

**Phase 1a solves core need:**
- 80% of user value with 20% of complexity
- User wants call state → we deliver call state + screen sharing as bonus
- Fast to implement (1-2 days vs 1-2 weeks)
- Low risk (just wiring existing events)

**Camera/mic later:**
- Phase 1b can add WebRTC monitoring when ready
- Requires more complexity (getUserMedia interception, track monitoring)
- Not blocking for initial user value

### What to Build

Wire existing IPC events to MQTT:

```javascript
call-connected          → teams/in-call: "true"
call-disconnected       → teams/in-call: "false"
screen-sharing-started  → teams/screen-sharing: "true"
screen-sharing-stopped  → teams/screen-sharing: "false"
```

### Implementation

**Effort:** 1-2 days (~80 lines total)

#### 1. Add generic `publish()` to `app/mqtt/index.js`

```javascript
async publish(topic, payload, options = {}) {
  if (!this.isConnected || !this.client) {
    console.debug('[MQTT] Not connected, skipping publish');
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

#### 2. Create `app/mqtt/mediaStatusService.js`

```javascript
const { ipcMain } = require('electron');

class MQTTMediaStatusService {
  #mqttClient;
  #config;

  constructor(mqttClient, config) {
    this.#mqttClient = mqttClient;
    this.#config = config;
  }

  initialize() {
    // Wire existing IPC events to MQTT
    ipcMain.on('call-connected', () => this.#publishCallState(true));
    ipcMain.on('call-disconnected', () => this.#publishCallState(false));
    ipcMain.on('screen-sharing-started', () => this.#publishScreenSharing(true));
    ipcMain.on('screen-sharing-stopped', () => this.#publishScreenSharing(false));

    console.info('[MQTTMediaStatusService] Initialized');
  }

  async #publishCallState(inCall) {
    if (this.#config.mqtt?.call?.enabled) {
      await this.#mqttClient.publish(
        `${this.#config.mqtt.topicPrefix}/${this.#config.mqtt.call.topic}`,
        String(inCall),
        { retain: true }
      );
    }
  }

  async #publishScreenSharing(isSharing) {
    if (this.#config.mqtt?.screenSharing?.enabled) {
      await this.#mqttClient.publish(
        `${this.#config.mqtt.topicPrefix}/${this.#config.mqtt.screenSharing.topic}`,
        String(isSharing),
        { retain: true }
      );
    }
  }
}

module.exports = MQTTMediaStatusService;
```

#### 3. Initialize in `app/index.js`

```javascript
const MQTTMediaStatusService = require('./mqtt/mediaStatusService');

// After MQTT client initialization
if (config.mqtt?.enabled) {
  const mediaStatusService = new MQTTMediaStatusService(mqttClient, config);
  mediaStatusService.initialize();
}
```

#### 4. Add config options to `app/config/index.js`

```javascript
mqtt: {
  default: {
    enabled: false,
    brokerUrl: "",
    // ... existing options ...

    // NEW: Extended status fields
    call: {
      enabled: true,
      topic: "in-call"
    },
    screenSharing: {
      enabled: true,
      topic: "screen-sharing"
    }
  },
  describe: "MQTT configuration",
  type: "object"
}
```

### Configuration Example

```json
{
  "mqtt": {
    "enabled": true,
    "brokerUrl": "mqtt://localhost:1883",
    "topicPrefix": "teams",

    "call": {
      "enabled": true,
      "topic": "in-call"
    },

    "screenSharing": {
      "enabled": true,
      "topic": "screen-sharing"
    }
  }
}
```

### MQTT Topics

- `teams/in-call` → `"true"` / `"false"`
- `teams/screen-sharing` → `"true"` / `"false"`

### Home Assistant Integration Example

```yaml
# RGB LED automation for call state
automation:
  - alias: "RGB LED - Teams Call Active"
    trigger:
      platform: mqtt
      topic: "teams/in-call"
      payload: "true"
    action:
      service: light.turn_on
      target:
        entity_id: light.office_led
      data:
        rgb_color: [255, 0, 0]  # Red when in call

  - alias: "RGB LED - Teams Call Ended"
    trigger:
      platform: mqtt
      topic: "teams/in-call"
      payload: "false"
    action:
      service: light.turn_off
      target:
        entity_id: light.office_led
```

### Implementation Steps

1. Add generic `publish()` method to `app/mqtt/index.js` (~15 lines)
2. Create `app/mqtt/mediaStatusService.js` with service class (~40 lines)
3. Initialize service in `app/index.js` (~5 lines)
4. Add config schema to `app/config/index.js` (~15 lines)
5. Update MQTT documentation with examples
6. Test with real Teams calls and screen sharing

### Testing

**Manual Testing:**
1. Join a Teams call → verify `teams/in-call` publishes `"true"`
2. Leave call → verify `teams/in-call` publishes `"false"`
3. Start screen sharing in call → verify `teams/screen-sharing` publishes `"true"`
4. Stop screen sharing → verify `teams/screen-sharing` publishes `"false"`
5. Test with UI buttons AND keyboard shortcuts
6. Test with Home Assistant or MQTT subscriber

**MQTT Monitoring:**
```bash
# Subscribe to all teams topics
mosquitto_sub -h localhost -t 'teams/#' -v

# Output:
# teams/in-call true
# teams/screen-sharing true
# teams/screen-sharing false
# teams/in-call false
```

### Risk Assessment

**Low Risk:**
- ✅ Uses existing IPC events (no new monitoring code)
- ✅ Follows proven service pattern (`CustomNotificationManager`, `ScreenSharingService`)
- ✅ Isolated changes, no modifications to critical code paths
- ✅ Configuration is optional (disabled by default or opt-in)
- ✅ Zero impact if MQTT not enabled

### Iteration Plan

**Phase 1a (This Issue):** Call + Screen Sharing (existing IPC) - 1-2 days
- Use existing `call-connected`, `call-disconnected` events
- Use existing `screen-sharing-started`, `screen-sharing-stopped` events
- Wire to MQTT publish with configuration

**Phase 1b (Future Issue):** Camera + Microphone (WebRTC monitoring) - 1 week
- Implement `getUserMedia()` interception
- Add MediaStreamTrack monitoring (events + polling)
- Screen sharing stream detection
- More complex, but Phase 1a validates the approach

**Phase 2 (Future):** Additional status fields as requested
- Message count (title monitoring)
- Calendar notifications (Graph API)
- Recording indicators (DOM monitoring)
- etc.

### Success Criteria

- [ ] Call state accurately reflects Teams call status (in call vs not in call)
- [ ] Screen sharing state accurate
- [ ] MQTT messages published with < 1s latency
- [ ] Configuration allows independent enable/disable of each field
- [ ] Works with UI actions, keyboard shortcuts, and programmatic calls
- [ ] Zero performance regression during calls
- [ ] User (#1938) successfully integrates with RGB LEDs
- [ ] Documentation includes Home Assistant examples
- [ ] Retained messages work correctly (last state preserved on broker)

### References

- **Research Document:** `docs-site/docs/development/research/mqtt-extended-status-investigation.md`
- **Related Issues:** #1938 (user request)
- **Related Research:**
  - `mqtt-commands-implementation.md` - MQTT infrastructure
- **Existing Code:**
  - `app/mqtt/index.js` - MQTT client
  - `app/mainAppWindow/browserWindowManager.js:150-152` - Call IPC events
  - `app/screenSharing/service.js:22-24` - Screen sharing IPC events
  - `app/notificationSystem/index.js` - Service pattern example
- **Future Reference:**
  - `app/browser/tools/disableAutogain.js` - getUserMedia interception pattern (for Phase 1b)

---

## Summary

**2 Issues Ready to Create:**

1. **Calendar Data Export** (2-3 hours)
   - User confirmed need (#1995)
   - Quick win
   - Validates MQTT command pattern

2. **MQTT Extended Status Phase 1a** (1-2 days)
   - Simplified version using existing IPC events
   - 80% user value, 20% complexity
   - Sets foundation for Phase 1b (camera/mic)

**Total Effort:** ~3 days

**Implementation Order:**
1. Calendar Export (quick win, get user feedback)
2. MQTT Extended Status Phase 1a (build on proven pattern)

Copy each issue template above into GitHub to create the issues.
