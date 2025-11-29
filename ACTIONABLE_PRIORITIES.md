# Teams for Linux - Actionable Development Priorities

**Updated:** 2025-11-29
**Status:** Ready for Implementation

## Context

This document lists **only** the actionable priorities with no external blockers. Based on review with maintainer:

**Constraints Identified:**
- ❌ **Automated Testing (E2E):** Blocked by Microsoft bot detection on login
- ❌ **Electron 38 Migration:** Blocked by electron-builder compatibility
- ❌ **Unit Tests:** Not preferred (mock testing vs. real user flow testing)
- ✅ **Calendar Export:** User confirmed they want this approach (#1995)
- ✅ **MQTT Extended Status:** Simplify to use existing IPC events only (Phase 1a)

---

## Priority 1: Calendar Data Export via MQTT Command

**User:** Confirmed in #1995 - wants calendar export for org-mode integration
**Effort:** 2-3 hours
**Risk:** Low
**Blockers:** None

### What to Build

Add MQTT command to expose calendar data for external processing:

```bash
# User sends command
mosquitto_pub -h localhost -t teams/command -m '{
  "action": "get-calendar",
  "startDate": "2025-11-27T00:00:00Z",
  "endDate": "2025-12-04T23:59:59Z"
}'

# Teams publishes raw Graph API JSON to teams/calendar topic
# User subscribes and pipes to their processor
mosquitto_sub -h localhost -t teams/calendar -C 1 | python3 ~/to_orgmode.py
```

### Implementation (~20 lines of code)

In `app/index.js`, extend existing MQTT command handler:

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

### Why This Approach

- **User controls everything:** External script, external scheduling (cron), external formatting
- **Minimal code:** Just wire Graph API to MQTT publish
- **No internal logic:** No polling, no formatting, no file management
- **Leverages existing infrastructure:** Graph API client + MQTT client already exist

### Testing

1. Enable Graph API in config
2. Send `get-calendar` MQTT command with date range
3. Verify calendar JSON published to `teams/calendar` topic
4. User processes with external script

---

## Priority 2: MQTT Extended Status Phase 1a (Simplified)

**User:** Requested in #1938 for RGB LED automation
**Effort:** 1-2 days
**Risk:** Low
**Blockers:** None

### What to Build (Phase 1a Only)

**Use existing IPC events only** - no WebRTC monitoring yet:

```javascript
// Wire existing events to MQTT
call-connected          → teams/in-call: "true"
call-disconnected       → teams/in-call: "false"
screen-sharing-started  → teams/screen-sharing: "true"
screen-sharing-stopped  → teams/screen-sharing: "false"
```

### Why Simplified First

**Existing IPC events already work:**
- `ipcMain.on('call-connected', ...)` - app/mainAppWindow/browserWindowManager.js:150
- `ipcMain.on('call-disconnected', ...)` - app/mainAppWindow/browserWindowManager.js:152
- `ipcMain.on('screen-sharing-started', ...)` - app/screenSharing/service.js:22
- `ipcMain.on('screen-sharing-stopped', ...)` - app/screenSharing/service.js:24

**Phase 1a solves core need:**
- User (#1938) wants to know when actually IN a call (not just "busy" presence)
- Call state + screen sharing state = 80% of the value
- Fast to implement, low risk

**Camera/mic later:**
- Phase 1b can add WebRTC monitoring for camera/mic when ready
- Requires more complexity (getUserMedia interception, track monitoring)
- Not blocking for initial user value

### Implementation

**1. Add generic `publish()` to `app/mqtt/index.js`:**

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

**2. Create `app/mqtt/mediaStatusService.js`:**

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

**3. Initialize in `app/index.js`:**

```javascript
const MQTTMediaStatusService = require('./mqtt/mediaStatusService');

// After MQTT client initialization
if (config.mqtt?.enabled) {
  const mediaStatusService = new MQTTMediaStatusService(mqttClient, config);
  mediaStatusService.initialize();
}
```

**4. Add config options to `app/config/index.js`:**

```javascript
mqtt: {
  default: {
    // ... existing mqtt options ...
    call: {
      enabled: true,
      topic: 'in-call'
    },
    screenSharing: {
      enabled: true,
      topic: 'screen-sharing'
    }
  }
}
```

### Testing

1. Join a Teams call → verify `teams/in-call` publishes `"true"`
2. Leave call → verify `teams/in-call` publishes `"false"`
3. Start screen sharing → verify `teams/screen-sharing` publishes `"true"`
4. Stop screen sharing → verify `teams/screen-sharing` publishes `"false"`

### Iteration Plan

**Phase 1a (Now):** Call + Screen Sharing (existing IPC) - 1-2 days
**Phase 1b (Later):** Camera + Mic (WebRTC monitoring) - 1 week when ready
**Phase 2 (Future):** Message count, calendar notifications, etc.

---

## Implementation Order

**Recommended sequence:**

### Week 1: Quick Win
**Calendar Data Export** (2-3 hours)
- Smallest effort, confirmed user need
- Gets user feedback quickly
- Validates MQTT command pattern further

### Week 1-2: Core Feature
**MQTT Extended Status Phase 1a** (1-2 days)
- High user value (RGB LED automation)
- Builds on proven infrastructure
- Sets pattern for future phases

### Total Time: ~3 days of actual work

---

## Blocked/Deferred Priorities

### Cannot Do Now

**Electron 38 Migration**
- Blocked by: electron-builder compatibility
- Action: Monitor electron-builder releases
- Timeline: Unknown

**Automated Testing (E2E)**
- Blocked by: Microsoft bot detection on login
- Alternative: Could investigate authentication bypass, but risky
- Decision: Skip for now, focus on manual testing

**Unit Tests**
- Decision: Not preferred (mock testing vs. real user flows)
- Alternative: Focus on integration/E2E when bot detection solved

### Waiting for Feedback

**Custom Notification Phase 2 (Notification Center)**
- Status: MVP released v2.6.16
- Action: Monitor user feedback for 2-4 weeks
- Decision point: If users request notification history, prioritize

**Graph API Phase 2 (Calendar Sync, Mail)**
- Status: Phase 1 POC complete
- Action: Validate Phase 1 adoption first
- Decision point: If calendar export drives demand, consider sync features

**Configuration Organization Phase 2-3**
- Status: Phase 1 partial complete (MQTT docs added)
- Action: Align with v3.0 major version
- Timeline: Future release

**DOM Access Phase 2 (Hybrid API)**
- Status: Phase 1 complete (monitoring in place)
- Action: Wait for Teams React upgrade announcement
- Timeline: Unknown (when Microsoft updates Teams to React 18/19)

---

## Success Metrics

### Calendar Data Export
- [ ] User successfully exports to org-mode
- [ ] Graph API integration remains stable
- [ ] Positive user feedback on workflow
- [ ] Zero breaking changes to existing MQTT commands

### MQTT Extended Status Phase 1a
- [ ] Call state accurately reflects Teams call status
- [ ] Screen sharing state accurate
- [ ] MQTT messages published with < 1s latency
- [ ] User (#1938) successfully integrates with RGB LEDs
- [ ] Zero performance regression
- [ ] Configuration clear and intuitive

---

## Next Steps

1. **Create GitHub issues** for the 2 actionable priorities
2. **Implement Calendar Export first** (quick win, 2-3 hours)
3. **Implement MQTT Extended Status Phase 1a** (1-2 days)
4. **Get user feedback** on both features
5. **Plan Phase 1b** for MQTT Extended Status (camera/mic) based on feedback

---

## Research Documents Status

| Document | Status | Next Action | Blocked By |
|----------|--------|-------------|------------|
| Calendar Export | ✅ User confirmed | Implement | None |
| MQTT Extended Status | ✅ Ready (simplified) | Implement Phase 1a | None |
| Electron 38 Migration | ⏸️ Blocked | Monitor electron-builder | electron-builder |
| Automated Testing | ⏸️ Blocked | Investigate alternatives | Bot detection |
| Custom Notifications | ✅ MVP shipped | Wait for feedback | User feedback |
| Graph API | ✅ Phase 1 done | Wait for adoption | User demand |
| Configuration Org | 🔄 Partial | Phase 1 docs cleanup | None (low priority) |
| DOM Access | ✅ Phase 1 done | Monitor Teams React | Microsoft |

**Legend:**
- ✅ Ready/Complete
- 🔄 In Progress
- ⏸️ Blocked
- ❌ Cancelled/Deferred
