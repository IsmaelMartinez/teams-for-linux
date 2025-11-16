# MQTT Integration Architecture Analysis

**Date**: 2025-11-12
**Issue**: #1938 MQTT Extended Status Integration
**Principles**: YAGNI (You Aren't Gonna Need It) + KISS (Keep It Simple, Stupid)

---

## Current MQTT Architecture

### Component Flow

```
Browser Context (Renderer)
  ↓
mqttStatusMonitor.js
  - Detects presence status (Available/Busy/DND/Away/BRB)
  - Uses MutationObserver + polling
  ↓
IPC: ipcRenderer.invoke('user-status-changed', { data: { status: 1 } })
  ↓
Main Process
  ↓
userStatusChangedHandler()
  - Receives status code
  - Calls mqttClient.publishStatus(status)
  ↓
MQTTClient.publishStatus(status)
  - Maps status code → string ('available', 'busy', etc.)
  - Builds topic: `{topicPrefix}/{statusTopic}` (e.g., 'teams/status')
  - Publishes JSON: { status, statusCode, timestamp, clientId }
  - Deduplicates (only publishes if changed)
  - Uses retain=true for persistence
  ↓
MQTT Broker → Home Automation
```

### Existing Code Structure

**MQTTClient Class** (`app/mqtt/index.js`):
```javascript
class MQTTClient {
  constructor(config)
  async initialize()           // Connect to broker
  async publishStatus(status)  // Publish presence status
  async disconnect()           // Cleanup
}
```

**Current limitations**:
- ✅ Single method: `publishStatus()` - tightly coupled to presence status
- ✅ Topic construction: Hardcoded pattern `{topicPrefix}/{statusTopic}`
- ✅ Payload format: Hardcoded JSON structure for presence

---

## Extended Status Requirements

**New data to publish** (Issue #1938):
- Camera on/off → `teams/camera` = `"true"`/`"false"`
- Microphone on/off → `teams/microphone` = `"true"`/`"false"`
- In-call state → `teams/in-call` = `"true"`/`"false"`

**Flow**:
```
Browser Context
  ↓
mqttExtendedStatus.js (NEW)
  - Monitors getUserMedia streams
  - Detects track.enabled changes
  ↓
IPC: ??? (NEW CHANNEL)
  ↓
Main Process Handler (NEW)
  ↓
MQTTClient.??? (NEW METHOD or modify existing?)
  ↓
MQTT Broker
```

---

## Integration Approaches

### Approach 1: ❌ Specialized Method (NOT RECOMMENDED - Violates YAGNI)

```javascript
class MQTTClient {
  async publishStatus(status) { ... }           // Existing
  async publishExtendedStatus(data) { ... }     // NEW - specialized
  async publishCameraState(state) { ... }       // NEW - too specific
  async publishMicrophoneState(state) { ... }   // NEW - too specific
}
```

**Problems**:
- ❌ Method explosion (new method for each event type)
- ❌ Not generic/reusable
- ❌ Violates YAGNI (over-engineering)

---

### Approach 2: ⚠️ Generic Publish + Adapter Pattern (OVER-ENGINEERED)

```javascript
class MQTTClient {
  async publishStatus(status) { ... }  // Existing
  async publish(topic, payload, options) { ... }  // NEW - generic
}

class MQTTEventPublisher {
  publishPresence(status) { ... }
  publishExtendedStatus(data) { ... }
  publishCustomEvent(event) { ... }
}
```

**Problems**:
- ⚠️ Too complex for current needs
- ⚠️ Abstraction layers we don't need yet (YAGNI violation)

---

### Approach 3: ✅ Simple Generic Publish (RECOMMENDED - KISS + YAGNI)

```javascript
class MQTTClient {
  async publishStatus(status) {
    // Existing method - keep for backward compatibility
    // Internally uses publish() for implementation
  }

  async publish(topic, payload, options = {}) {
    // NEW: Generic publish method
    // topic: string (full topic path or subtopic)
    // payload: string or object (auto-stringified if object)
    // options: { retain, qos, deduplicateKey }
  }
}
```

**Benefits**:
- ✅ Simple addition (one new method)
- ✅ Backward compatible (existing code unchanged)
- ✅ Generic enough for future use cases
- ✅ No over-abstraction (KISS)
- ✅ Supports deduplication with optional key
- ✅ Existing `publishStatus()` becomes a wrapper (can refactor later if needed)

**Usage**:
```javascript
// Extended status (new)
await mqttClient.publish('camera', 'true', { retain: true });
await mqttClient.publish('microphone', 'false', { retain: true });

// Or with full topic path:
await mqttClient.publish('teams/camera', 'true', { retain: true });

// Or with object payload (auto-stringified):
await mqttClient.publish('full-state', {
  camera: true,
  microphone: false,
  inCall: true
});

// Presence status (existing, stays the same)
await mqttClient.publishStatus(1); // Still works!
```

---

## Configuration Strategy

### Current Config:
```json
{
  "mqtt": {
    "enabled": true,
    "brokerUrl": "mqtt://...",
    "topicPrefix": "teams",
    "statusTopic": "status",
    "statusCheckInterval": 10000
  }
}
```

### Option 1: ❌ Flat (Too Messy)
```json
{
  "mqtt": {
    "enabled": true,
    "extendedStatusEnabled": true,
    "cameraTopic": "camera",
    "microphoneTopic": "microphone",
    "inCallTopic": "in-call"
  }
}
```

### Option 2: ✅ Semantic Categories (RECOMMENDED - KISS + Clear)
```json
{
  "mqtt": {
    "enabled": true,
    "brokerUrl": "mqtt://...",
    "topicPrefix": "teams",

    "presence": {
      "enabled": true,
      "topic": "status",
      "checkInterval": 10000
    },

    "camera": {
      "enabled": false,
      "topic": "camera"
    },

    "microphone": {
      "enabled": false,
      "topic": "microphone"
    },

    "call": {
      "enabled": false,
      "topic": "in-call"
    }
  }
}
```

**Benefits**:
- ✅ Each category is what it represents (not "extended")
- ✅ Clear, semantic naming (camera, microphone, call, presence)
- ✅ Users can enable/disable each independently
- ✅ Easy to understand what each setting controls
- ✅ Backward compatible (can default from `mqtt.enabled`)
- ✅ Flat structure (simpler than nested groupings)

---

## IPC Channel Strategy

### Option 1: ❌ Reuse Existing Channel (Violates Separation of Concerns)
```javascript
// Bad: Mixed concerns
ipcMain.handle('user-status-changed', (event, options) => {
  if (options.type === 'presence') { ... }
  if (options.type === 'extended') { ... }
});
```

### Option 2: ✅ Separate Channel (RECOMMENDED - KISS)
```javascript
// Presence (existing)
ipcMain.handle('user-status-changed', async (event, { data }) => {
  userStatus = data.status;
  await mqttClient.publishStatus(userStatus);
});

// Media/call status (new - single IPC for all stream-related data)
ipcMain.handle('mqtt-media-status-changed', async (event, { data }) => {
  const topicPrefix = config.mqtt.topicPrefix || 'teams';

  // Publish camera state if enabled
  if (config.mqtt?.camera?.enabled && data.camera !== undefined) {
    await mqttClient.publish(
      `${topicPrefix}/${config.mqtt.camera.topic}`,
      String(data.camera),
      { retain: true }
    );
  }

  // Publish microphone state if enabled
  if (config.mqtt?.microphone?.enabled && data.microphone !== undefined) {
    await mqttClient.publish(
      `${topicPrefix}/${config.mqtt.microphone.topic}`,
      String(data.microphone),
      { retain: true }
    );
  }

  // Publish call state if enabled
  if (config.mqtt?.call?.enabled && data.inCall !== undefined) {
    await mqttClient.publish(
      `${topicPrefix}/${config.mqtt.call.topic}`,
      String(data.inCall),
      { retain: true }
    );
  }
});
```

**Benefits**:
- ✅ Clear separation (presence vs media/call)
- ✅ Single IPC message (efficient - all data from same getUserMedia stream)
- ✅ Each topic independently configurable
- ✅ Easy to understand/maintain
- ✅ Follows existing pattern

**Why one IPC channel for camera/mic/call?**
- They all come from the same WebRTC stream monitoring
- Detected simultaneously (not separate events)
- Efficient to send once rather than 3 IPC calls
- Handler can selectively publish based on config

---

## Required Integration Spikes

### Spike 1: MQTTClient Generic Publish Method

**Purpose**: Verify we can add a generic `publish()` method without breaking existing functionality

**What to test**:
```javascript
// Create spike in app/mqtt/index.js
async publish(topic, payload, options = {}) {
  if (!this.isConnected || !this.client) {
    console.debug('MQTT not connected, skipping publish');
    return;
  }

  // Auto-stringify objects
  const payloadString = typeof payload === 'object'
    ? JSON.stringify(payload)
    : String(payload);

  // Build full topic (prepend prefix if not absolute)
  const fullTopic = topic.startsWith(this.config.topicPrefix)
    ? topic
    : `${this.config.topicPrefix}/${topic}`;

  // Optional deduplication
  const dedupeKey = options.deduplicateKey || fullTopic;
  if (this.lastPublished?.[dedupeKey] === payloadString) {
    console.debug(`Skipping duplicate publish to ${fullTopic}`);
    return;
  }

  try {
    await this.client.publish(fullTopic, payloadString, {
      retain: options.retain ?? true,
      qos: options.qos ?? 0
    });

    if (!this.lastPublished) this.lastPublished = {};
    this.lastPublished[dedupeKey] = payloadString;

    console.debug(`Published to MQTT: ${fullTopic} = ${payloadString}`);
  } catch (error) {
    console.error('Failed to publish to MQTT:', error);
  }
}
```

**Test cases**:
1. ✅ Existing `publishStatus()` still works
2. ✅ Can publish simple string values
3. ✅ Can publish objects (auto-stringified)
4. ✅ Deduplication works
5. ✅ Topic prefix handling works (both absolute and relative)
6. ✅ Retain and QoS options work

**Expected result**: Generic method works, existing code unaffected

---

### Spike 2: IPC Integration Pattern

**Purpose**: Verify IPC handler can call generic publish method efficiently

**What to test**:
```javascript
// In app/index.js
ipcMain.handle('mqtt-media-status-spike', async (event, { data }) => {
  console.log('[MQTT_INTEGRATION_SPIKE] Received media status:', data);

  if (!mqttClient) {
    console.log('[MQTT_INTEGRATION_SPIKE] MQTT client not available');
    return;
  }

  const topicPrefix = config.mqtt.topicPrefix || 'teams';

  // Test camera publish (if enabled in config)
  if (config.mqtt?.camera?.enabled && data.camera !== undefined) {
    console.log('[MQTT_INTEGRATION_SPIKE] Publishing camera state...');
    await mqttClient.publish(
      `${topicPrefix}/${config.mqtt.camera.topic}`,
      String(data.camera),
      { retain: true }
    );
  }

  // Test microphone publish (if enabled in config)
  if (config.mqtt?.microphone?.enabled && data.microphone !== undefined) {
    console.log('[MQTT_INTEGRATION_SPIKE] Publishing microphone state...');
    await mqttClient.publish(
      `${topicPrefix}/${config.mqtt.microphone.topic}`,
      String(data.microphone),
      { retain: true }
    );
  }

  // Test call publish (if enabled in config)
  if (config.mqtt?.call?.enabled && data.inCall !== undefined) {
    console.log('[MQTT_INTEGRATION_SPIKE] Publishing call state...');
    await mqttClient.publish(
      `${topicPrefix}/${config.mqtt.call.topic}`,
      String(data.inCall),
      { retain: true }
    );
  }

  console.log('[MQTT_INTEGRATION_SPIKE] All publishes complete');
});
```

**Trigger from browser spike**:
```javascript
// In mqttExtendedStatusSpike.js
ipcRenderer.invoke('mqtt-media-status-spike', {
  data: {
    camera: true,
    microphone: false,
    inCall: true
  }
});
```

**Test cases**:
1. ✅ IPC messages reach main process
2. ✅ All three topics publish correctly
3. ✅ MQTT broker receives messages
4. ✅ Payloads are correct format (strings "true"/"false")
5. ✅ Can use `mosquitto_sub` to verify

**Expected result**: Messages publish correctly to broker

---

### Spike 3: Configuration Backward Compatibility

**Purpose**: Ensure new config structure doesn't break existing setups

**What to test**:
```javascript
// In app/config/index.js - add migration logic
function migrateMqttConfig(config) {
  if (!config.mqtt) return config;

  // Migrate old flat structure to semantic categories
  if (config.mqtt.statusTopic && !config.mqtt.presence) {
    console.log('[CONFIG_SPIKE] Migrating MQTT config to semantic structure');
    config.mqtt.presence = {
      enabled: config.mqtt.enabled,
      topic: config.mqtt.statusTopic,
      checkInterval: config.mqtt.statusCheckInterval || 10000
    };
  }

  // Add camera defaults if missing
  if (!config.mqtt.camera) {
    config.mqtt.camera = {
      enabled: false,
      topic: 'camera'
    };
  }

  // Add microphone defaults if missing
  if (!config.mqtt.microphone) {
    config.mqtt.microphone = {
      enabled: false,
      topic: 'microphone'
    };
  }

  // Add call defaults if missing
  if (!config.mqtt.call) {
    config.mqtt.call = {
      enabled: false,
      topic: 'in-call'
    };
  }

  return config;
}
```

**Test cases**:
1. ✅ Old config still works (backward compatible)
2. ✅ New config works
3. ✅ Migration happens transparently
4. ✅ Users don't need to change config files

**Expected result**: Both old and new configs work

---

## Recommended Implementation Order

### Phase 1: Infrastructure Spikes (This Week)
1. ✅ **Spike 1**: Add generic `publish()` method to MQTTClient
2. ✅ **Spike 2**: Test IPC integration pattern
3. ✅ **Spike 3**: Config backward compatibility

### Phase 2: Integration (After Spikes Pass)
1. Implement generic `publish()` method in MQTTClient
2. Add nested config structure with migration
3. Create `mqtt-extended-status-changed` IPC handler
4. Wire up extended status spike to use real MQTT
5. Test end-to-end with mosquitto

### Phase 3: Production (After Integration Works)
1. Replace spike code with production `mqttExtendedStatus.js`
2. Update documentation
3. Add Home Assistant examples for extended status
4. Test with real MQTT broker + automation

---

## Decision: KISS + YAGNI Approach

**What we'll implement**:
1. ✅ Generic `publish(topic, payload, options)` method - simple, reusable
2. ✅ Separate IPC channel `mqtt-media-status-changed` - clean separation
3. ✅ Semantic config categories (presence, camera, microphone, call) - clear, self-documenting
4. ✅ Each category independently configurable - flexible
5. ✅ Backward compatible config migration - no breaking changes
6. ✅ No abstraction layers - just direct calls (KISS)

**What we WON'T implement** (YAGNI):
- ❌ Event publisher pattern/adapter layers
- ❌ Plugin architecture for MQTT events
- ❌ Complex routing/middleware
- ❌ Specialized methods for each event type
- ❌ Generic "extended" or "media" groupings (use semantic names)

**Expansion path** (if needed later):
- Add new semantic categories (e.g., `screen`, `recording`, `reactions`)
- Each category gets its own config section
- Generic `publish()` supports all future use cases
- Users enable only what they need

---

## Next Steps

1. Run **Spike 1** (MQTTClient generic publish)
2. Run **Spike 2** (IPC integration)
3. Run **Spike 3** (Config compatibility)
4. If all spikes pass → Implement production code
5. If any spike fails → Adjust approach and re-spike

**Spike success criteria**: All messages publish to broker correctly, existing functionality unaffected, config migration works.
