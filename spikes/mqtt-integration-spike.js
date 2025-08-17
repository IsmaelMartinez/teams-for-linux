#!/usr/bin/env node

/**
 * MQTT Integration Spike
 * 
 * Tests publishing IPC events to an MQTT broker to validate AsyncAPI integration benefits.
 * This spike answers: "Does AsyncAPI provide value for external integrations?"
 */

const { EventEmitter } = require('events');

// Mock MQTT client (replace with actual mqtt library for real testing)
class MockMQTTClient extends EventEmitter {
  constructor(brokerUrl) {
    super();
    this.brokerUrl = brokerUrl;
    this.connected = false;
    console.log(`[MQTT-Spike] Connecting to broker: ${brokerUrl}`);
  }

  connect() {
    setTimeout(() => {
      this.connected = true;
      this.emit('connect');
      console.log('[MQTT-Spike] Connected to MQTT broker');
    }, 100);
  }

  publish(topic, message, options = {}) {
    if (!this.connected) {
      throw new Error('MQTT client not connected');
    }
    
    console.log(`[MQTT-Spike] Publishing to topic '${topic}':`);
    console.log(`[MQTT-Spike] Message: ${message}`);
    console.log(`[MQTT-Spike] Options:`, options);
    
    // Simulate publish success
    setTimeout(() => {
      this.emit('publish', { topic, message, options });
    }, 10);
  }

  disconnect() {
    this.connected = false;
    console.log('[MQTT-Spike] Disconnected from MQTT broker');
  }
}

// Schema definitions (would come from AsyncAPI in real implementation)
const schemas = {
  'teams/user/status-changed': {
    type: 'object',
    properties: {
      userId: { type: 'string' },
      status: { type: 'string', enum: ['available', 'busy', 'away', 'offline'] },
      timestamp: { type: 'string', format: 'date-time' },
      activity: { type: 'string' }
    },
    required: ['userId', 'status', 'timestamp']
  },
  
  'teams/screen-sharing/started': {
    type: 'object',
    properties: {
      sourceId: { type: 'string' },
      sourceName: { type: 'string' },
      timestamp: { type: 'string', format: 'date-time' },
      userId: { type: 'string' }
    },
    required: ['sourceId', 'timestamp']
  },

  'teams/notification/received': {
    type: 'object',
    properties: {
      notificationId: { type: 'string' },
      title: { type: 'string' },
      body: { type: 'string' },
      urgency: { type: 'string', enum: ['low', 'normal', 'critical'] },
      timestamp: { type: 'string', format: 'date-time' }
    },
    required: ['notificationId', 'title', 'timestamp']
  }
};

// Simple schema validation (would use AJV in real implementation)
function validateSchema(data, schemaName) {
  const schema = schemas[schemaName];
  if (!schema) {
    return { valid: false, error: `Unknown schema: ${schemaName}` };
  }

  // Basic validation - check required fields
  for (const field of schema.required || []) {
    if (!(field in data)) {
      return { valid: false, error: `Missing required field: ${field}` };
    }
  }

  // Basic type checking
  for (const [field, value] of Object.entries(data)) {
    const fieldSchema = schema.properties[field];
    if (fieldSchema && fieldSchema.type === 'string' && typeof value !== 'string') {
      return { valid: false, error: `Field '${field}' must be a string` };
    }
  }

  return { valid: true };
}

// MQTT Integration Bridge
class IPCToMQTTBridge {
  constructor(mqttClient) {
    this.mqtt = mqttClient;
    this.eventMappings = new Map();
    this.publishStats = { total: 0, success: 0, failed: 0 };
  }

  // Map IPC events to MQTT topics
  addEventMapping(ipcChannel, mqttTopic, transformer = null) {
    this.eventMappings.set(ipcChannel, { topic: mqttTopic, transformer });
    console.log(`[MQTT-Bridge] Mapped IPC '${ipcChannel}' -> MQTT '${mqttTopic}'`);
  }

  // Publish IPC event to MQTT
  publishIPCEvent(channel, data) {
    const mapping = this.eventMappings.get(channel);
    if (!mapping) {
      console.warn(`[MQTT-Bridge] No MQTT mapping for IPC channel: ${channel}`);
      return;
    }

    try {
      // Transform data if transformer provided
      const transformedData = mapping.transformer ? mapping.transformer(data) : data;
      
      // Add timestamp if not present
      if (!transformedData.timestamp) {
        transformedData.timestamp = new Date().toISOString();
      }

      // Validate against schema
      const validation = validateSchema(transformedData, mapping.topic);
      if (!validation.valid) {
        console.error(`[MQTT-Bridge] Schema validation failed for ${mapping.topic}:`, validation.error);
        this.publishStats.failed++;
        return;
      }

      // Publish to MQTT
      const message = JSON.stringify(transformedData);
      this.mqtt.publish(mapping.topic, message, { qos: 1 });
      
      this.publishStats.total++;
      this.publishStats.success++;
      
      console.log(`[MQTT-Bridge] Successfully published IPC '${channel}' to MQTT '${mapping.topic}'`);
      
    } catch (error) {
      console.error(`[MQTT-Bridge] Failed to publish IPC event '${channel}':`, error);
      this.publishStats.failed++;
    }
  }

  getStats() {
    return { ...this.publishStats };
  }
}

// Mock IPC Events (simulating real Teams for Linux IPC events)
class MockIPCEvents extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
  }

  start() {
    this.isRunning = true;
    console.log('[Mock-IPC] Starting IPC event simulation');

    // Simulate user status changes
    const statusInterval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(statusInterval);
        return;
      }

      const statuses = ['available', 'busy', 'away'];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      
      this.emit('user-status-changed', {
        userId: 'user-123',
        status,
        activity: status === 'busy' ? 'In a meeting' : ''
      });
    }, 3000);

    // Simulate screen sharing events
    const screenShareInterval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(screenShareInterval);
        return;
      }

      if (Math.random() > 0.7) { // 30% chance
        this.emit('screen-sharing-started', {
          sourceId: 'screen-' + Math.floor(Math.random() * 1000),
          sourceName: 'Primary Display',
          userId: 'user-123'
        });
      }
    }, 5000);

    // Simulate notification events
    const notificationInterval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(notificationInterval);
        return;
      }

      if (Math.random() > 0.6) { // 40% chance
        this.emit('show-notification', {
          notificationId: 'notif-' + Date.now(),
          title: 'New Message',
          body: 'You have a new message in the General channel',
          urgency: 'normal'
        });
      }
    }, 4000);
  }

  stop() {
    this.isRunning = false;
    console.log('[Mock-IPC] Stopping IPC event simulation');
  }
}

// Main spike execution
async function runMQTTIntegrationSpike() {
  console.log('=== MQTT Integration Spike ===');
  console.log('Objective: Validate AsyncAPI benefits for external integrations\n');

  // 1. Set up MQTT client
  const mqttClient = new MockMQTTClient('mqtt://localhost:1883');
  
  // 2. Set up IPC to MQTT bridge
  const bridge = new IPCToMQTTBridge(mqttClient);
  
  // 3. Configure event mappings (this would come from AsyncAPI config)
  bridge.addEventMapping('user-status-changed', 'teams/user/status-changed');
  bridge.addEventMapping('screen-sharing-started', 'teams/screen-sharing/started');
  bridge.addEventMapping('show-notification', 'teams/notification/received');
  
  // 4. Set up mock IPC events
  const mockIPC = new MockIPCEvents();
  
  // 5. Connect IPC events to MQTT bridge
  mockIPC.on('user-status-changed', (data) => bridge.publishIPCEvent('user-status-changed', data));
  mockIPC.on('screen-sharing-started', (data) => bridge.publishIPCEvent('screen-sharing-started', data));
  mockIPC.on('show-notification', (data) => bridge.publishIPCEvent('show-notification', data));
  
  // 6. Connect to MQTT and start simulation
  mqttClient.connect();
  
  await new Promise(resolve => {
    mqttClient.once('connect', () => {
      console.log('\n--- Starting Event Simulation ---\n');
      mockIPC.start();
      
      // Run simulation for 15 seconds
      setTimeout(() => {
        mockIPC.stop();
        mqttClient.disconnect();
        
        console.log('\n--- Spike Results ---');
        const stats = bridge.getStats();
        console.log(`Total events processed: ${stats.total}`);
        console.log(`Successful publishes: ${stats.success}`);
        console.log(`Failed publishes: ${stats.failed}`);
        console.log(`Success rate: ${stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0}%`);
        
        console.log('\n--- Analysis ---');
        console.log('✅ Schema validation works for enforcing message structure');
        console.log('✅ Event mapping allows flexible IPC -> MQTT routing');
        console.log('✅ Error handling prevents invalid messages from being published');
        
        console.log('\n--- AsyncAPI Value Assessment ---');
        console.log('❓ Schema definition: Could be done manually or with simple JSON schemas');
        console.log('❓ Documentation: MQTT topics and schemas could be documented in markdown');
        console.log('❓ Code generation: No clear benefit over hand-written bridge code');
        console.log('❓ Maintenance: AsyncAPI adds toolchain complexity for this use case');
        
        console.log('\n--- Questions for Further Investigation ---');
        console.log('1. Do we have actual MQTT consumers that need this integration?');
        console.log('2. Would AsyncAPI toolchain help maintain schemas better than JSON?');
        console.log('3. Is there value in AsyncAPI Studio for designing integrations?');
        console.log('4. Would code generation significantly reduce development time?');
        
        resolve();
      }, 15000);
    });
  });
}

// Execute the spike
if (require.main === module) {
  runMQTTIntegrationSpike().catch(console.error);
}

module.exports = { IPCToMQTTBridge, MockIPCEvents, validateSchema };