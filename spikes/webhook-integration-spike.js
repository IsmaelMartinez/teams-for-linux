#!/usr/bin/env node

/**
 * Webhook Integration Spike
 * 
 * Tests delivering IPC events via webhooks to validate AsyncAPI integration benefits.
 * This spike answers: "Does AsyncAPI provide value for webhook delivery systems?"
 */

const { EventEmitter } = require('events');

// Mock HTTP client for webhook delivery
class MockWebhookClient {
  constructor() {
    this.deliveryStats = { total: 0, success: 0, failed: 0, retries: 0 };
  }

  async deliver(url, payload, options = {}) {
    this.deliveryStats.total++;
    
    try {
      console.log(`[Webhook-Client] Delivering to: ${url}`);
      console.log(`[Webhook-Client] Payload: ${JSON.stringify(payload, null, 2)}`);
      
      // Simulate HTTP delivery (replace with actual HTTP client for real testing)
      const success = Math.random() > 0.1; // 90% success rate
      
      if (!success) {
        throw new Error('Simulated delivery failure');
      }
      
      console.log(`[Webhook-Client] ✅ Successfully delivered webhook`);
      this.deliveryStats.success++;
      
      return { success: true, statusCode: 200 };
      
    } catch (error) {
      console.error(`[Webhook-Client] ❌ Delivery failed:`, error.message);
      this.deliveryStats.failed++;
      
      // Retry logic
      if (options.retry && options.retryCount < (options.maxRetries || 3)) {
        console.log(`[Webhook-Client] 🔄 Retrying delivery (attempt ${options.retryCount + 1})`);
        this.deliveryStats.retries++;
        
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, options.retryCount)));
        
        return this.deliver(url, payload, {
          ...options,
          retryCount: (options.retryCount || 0) + 1
        });
      }
      
      throw error;
    }
  }

  getStats() {
    return { ...this.deliveryStats };
  }
}

// Webhook payload schemas (would come from AsyncAPI in real implementation)
const webhookSchemas = {
  'teams.user.status_changed': {
    type: 'object',
    properties: {
      event: { type: 'string', const: 'teams.user.status_changed' },
      timestamp: { type: 'string', format: 'date-time' },
      data: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          previousStatus: { type: 'string' },
          currentStatus: { type: 'string', enum: ['available', 'busy', 'away', 'offline'] },
          activity: { type: 'string' }
        },
        required: ['userId', 'currentStatus']
      }
    },
    required: ['event', 'timestamp', 'data']
  },

  'teams.screen_sharing.started': {
    type: 'object',
    properties: {
      event: { type: 'string', const: 'teams.screen_sharing.started' },
      timestamp: { type: 'string', format: 'date-time' },
      data: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
          sourceId: { type: 'string' },
          sourceName: { type: 'string' },
          userId: { type: 'string' },
          resolution: {
            type: 'object',
            properties: {
              width: { type: 'number' },
              height: { type: 'number' }
            }
          }
        },
        required: ['sessionId', 'sourceId', 'userId']
      }
    },
    required: ['event', 'timestamp', 'data']
  },

  'teams.call.incoming': {
    type: 'object',
    properties: {
      event: { type: 'string', const: 'teams.call.incoming' },
      timestamp: { type: 'string', format: 'date-time' },
      data: {
        type: 'object',
        properties: {
          callId: { type: 'string' },
          callerId: { type: 'string' },
          callerName: { type: 'string' },
          callType: { type: 'string', enum: ['audio', 'video', 'screen_share'] },
          urgent: { type: 'boolean' }
        },
        required: ['callId', 'callerId', 'callType']
      }
    },
    required: ['event', 'timestamp', 'data']
  }
};

// Webhook payload validation
function validateWebhookPayload(payload, schemaName) {
  const schema = webhookSchemas[schemaName];
  if (!schema) {
    return { valid: false, error: `Unknown schema: ${schemaName}` };
  }

  // Basic validation - check required fields at root level
  for (const field of schema.required || []) {
    if (!(field in payload)) {
      return { valid: false, error: `Missing required field: ${field}` };
    }
  }

  // Validate data object if present
  if (payload.data && schema.properties.data) {
    const dataSchema = schema.properties.data;
    for (const field of dataSchema.required || []) {
      if (!(field in payload.data)) {
        return { valid: false, error: `Missing required data field: ${field}` };
      }
    }
  }

  return { valid: true };
}

// Webhook Delivery System
class IPCWebhookDelivery {
  constructor(webhookClient) {
    this.client = webhookClient;
    this.subscriptions = new Map(); // event -> array of webhook configs
    this.deliveryQueue = [];
    this.isProcessing = false;
  }

  // Subscribe a webhook URL to specific IPC events
  subscribe(eventPattern, webhookConfig) {
    if (!this.subscriptions.has(eventPattern)) {
      this.subscriptions.set(eventPattern, []);
    }
    
    this.subscriptions.get(eventPattern).push({
      url: webhookConfig.url,
      secret: webhookConfig.secret,
      retryPolicy: webhookConfig.retryPolicy || { enabled: true, maxRetries: 3 },
      filters: webhookConfig.filters || {}
    });
    
    console.log(`[Webhook-Delivery] Subscribed ${webhookConfig.url} to ${eventPattern}`);
  }

  // Process an IPC event and deliver to subscribed webhooks
  async processIPCEvent(eventType, data) {
    const timestamp = new Date().toISOString();
    
    // Find matching subscriptions
    const matchingSubscriptions = [];
    for (const [pattern, configs] of this.subscriptions) {
      if (this.matchesPattern(eventType, pattern)) {
        matchingSubscriptions.push(...configs);
      }
    }

    if (matchingSubscriptions.length === 0) {
      console.log(`[Webhook-Delivery] No webhooks subscribed to ${eventType}`);
      return;
    }

    // Create webhook payload
    const webhookPayload = {
      event: eventType,
      timestamp,
      data: this.transformIPCData(eventType, data)
    };

    // Validate payload against schema
    const validation = validateWebhookPayload(webhookPayload, eventType);
    if (!validation.valid) {
      console.error(`[Webhook-Delivery] Invalid payload for ${eventType}:`, validation.error);
      return;
    }

    // Queue deliveries for each subscription
    for (const subscription of matchingSubscriptions) {
      if (this.passesFilters(webhookPayload, subscription.filters)) {
        this.queueDelivery(subscription, webhookPayload);
      }
    }

    // Process delivery queue
    await this.processDeliveryQueue();
  }

  // Transform IPC data to webhook format
  transformIPCData(eventType, ipcData) {
    switch (eventType) {
      case 'teams.user.status_changed':
        return {
          userId: ipcData.userId,
          previousStatus: ipcData.previousStatus || 'unknown',
          currentStatus: ipcData.status,
          activity: ipcData.activity || ''
        };

      case 'teams.screen_sharing.started':
        return {
          sessionId: `session-${Date.now()}`,
          sourceId: ipcData.sourceId,
          sourceName: ipcData.sourceName || 'Unknown Source',
          userId: ipcData.userId,
          resolution: ipcData.resolution || { width: 1920, height: 1080 }
        };

      case 'teams.call.incoming':
        return {
          callId: ipcData.callId,
          callerId: ipcData.callerId,
          callerName: ipcData.callerName || 'Unknown Caller',
          callType: ipcData.callType || 'audio',
          urgent: ipcData.urgent || false
        };

      default:
        return ipcData;
    }
  }

  // Check if event matches subscription pattern
  matchesPattern(eventType, pattern) {
    // Simple pattern matching - could be more sophisticated
    return eventType === pattern || pattern === '*' || eventType.startsWith(pattern.replace('*', ''));
  }

  // Check if payload passes subscription filters
  passesFilters(payload, filters) {
    // Simple filter implementation
    for (const [key, value] of Object.entries(filters)) {
      const payloadValue = this.getNestedValue(payload, key);
      if (payloadValue !== value) {
        return false;
      }
    }
    return true;
  }

  // Get nested value from object (e.g., "data.userId")
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  // Queue a delivery for processing
  queueDelivery(subscription, payload) {
    this.deliveryQueue.push({
      subscription,
      payload,
      attempts: 0,
      queuedAt: Date.now()
    });
  }

  // Process the delivery queue
  async processDeliveryQueue() {
    if (this.isProcessing || this.deliveryQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.deliveryQueue.length > 0) {
      const delivery = this.deliveryQueue.shift();
      
      try {
        await this.client.deliver(
          delivery.subscription.url,
          delivery.payload,
          {
            retry: delivery.subscription.retryPolicy.enabled,
            maxRetries: delivery.subscription.retryPolicy.maxRetries,
            retryCount: delivery.attempts
          }
        );
        
        console.log(`[Webhook-Delivery] ✅ Delivered ${delivery.payload.event} to ${delivery.subscription.url}`);
        
      } catch {
        console.error(`[Webhook-Delivery] ❌ Failed to deliver ${delivery.payload.event} to ${delivery.subscription.url}`);
        
        // Could implement dead letter queue here
      }
    }

    this.isProcessing = false;
  }

  getStats() {
    return {
      subscriptions: this.subscriptions.size,
      queueLength: this.deliveryQueue.length,
      isProcessing: this.isProcessing,
      ...this.client.getStats()
    };
  }
}

// Mock IPC Events for webhook testing
class MockIPCForWebhooks extends EventEmitter {
  constructor() {
    super();
    this.isRunning = false;
  }

  start() {
    this.isRunning = true;
    console.log('[Mock-IPC] Starting webhook-focused IPC simulation');

    // Simulate user status changes with previous status tracking
    let currentStatus = 'available';
    const statusInterval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(statusInterval);
        return;
      }

      const statuses = ['available', 'busy', 'away', 'offline'];
      const previousStatus = currentStatus;
      currentStatus = statuses[Math.floor(Math.random() * statuses.length)];
      
      if (previousStatus !== currentStatus) {
        this.emit('user-status-changed', {
          userId: 'user-123',
          status: currentStatus,
          previousStatus,
          activity: currentStatus === 'busy' ? 'In a meeting' : ''
        });
      }
    }, 4000);

    // Simulate screen sharing events
    const screenShareInterval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(screenShareInterval);
        return;
      }

      if (Math.random() > 0.8) { // 20% chance
        this.emit('screen-sharing-started', {
          sourceId: 'screen-' + Math.floor(Math.random() * 1000),
          sourceName: 'Primary Display',
          userId: 'user-123',
          resolution: { width: 1920, height: 1080 }
        });
      }
    }, 6000);

    // Simulate incoming calls
    const callInterval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(callInterval);
        return;
      }

      if (Math.random() > 0.85) { // 15% chance
        this.emit('incoming-call', {
          callId: 'call-' + Date.now(),
          callerId: 'caller-' + Math.floor(Math.random() * 100),
          callerName: 'John Doe',
          callType: Math.random() > 0.5 ? 'video' : 'audio',
          urgent: Math.random() > 0.8
        });
      }
    }, 3000);
  }

  stop() {
    this.isRunning = false;
    console.log('[Mock-IPC] Stopping webhook IPC simulation');
  }
}

// Main spike execution
async function runWebhookIntegrationSpike() {
  console.log('=== Webhook Integration Spike ===');
  console.log('Objective: Validate AsyncAPI benefits for webhook delivery systems\n');

  // 1. Set up webhook client
  const webhookClient = new MockWebhookClient();
  
  // 2. Set up webhook delivery system
  const webhookDelivery = new IPCWebhookDelivery(webhookClient);
  
  // 3. Configure webhook subscriptions (this would come from user configuration)
  webhookDelivery.subscribe('teams.user.status_changed', {
    url: 'https://api.example.com/webhooks/teams/status',
    secret: 'webhook-secret-123',
    retryPolicy: { enabled: true, maxRetries: 3 },
    filters: {} // No filters for this subscription
  });
  
  webhookDelivery.subscribe('teams.screen_sharing.started', {
    url: 'https://monitor.company.com/screen-sharing',
    secret: 'monitor-secret-456',
    retryPolicy: { enabled: true, maxRetries: 2 },
    filters: { 'data.userId': 'user-123' } // Only for specific user
  });
  
  webhookDelivery.subscribe('teams.call.incoming', {
    url: 'https://phone-system.company.com/teams-integration',
    secret: 'phone-secret-789',
    retryPolicy: { enabled: true, maxRetries: 5 },
    filters: { 'data.urgent': true } // Only urgent calls
  });
  
  // 4. Set up mock IPC events
  const mockIPC = new MockIPCForWebhooks();
  
  // 5. Connect IPC events to webhook delivery
  mockIPC.on('user-status-changed', (data) => 
    webhookDelivery.processIPCEvent('teams.user.status_changed', data)
  );
  mockIPC.on('screen-sharing-started', (data) => 
    webhookDelivery.processIPCEvent('teams.screen_sharing.started', data)
  );
  mockIPC.on('incoming-call', (data) => 
    webhookDelivery.processIPCEvent('teams.call.incoming', data)
  );
  
  // 6. Start simulation
  console.log('--- Starting Webhook Delivery Simulation ---\n');
  mockIPC.start();
  
  // Run simulation for 20 seconds
  await new Promise(resolve => {
    setTimeout(() => {
      mockIPC.stop();
      
      console.log('\n--- Spike Results ---');
      const stats = webhookDelivery.getStats();
      console.log(`Total webhook deliveries attempted: ${stats.total}`);
      console.log(`Successful deliveries: ${stats.success}`);
      console.log(`Failed deliveries: ${stats.failed}`);
      console.log(`Retry attempts: ${stats.retries}`);
      console.log(`Active subscriptions: ${stats.subscriptions}`);
      console.log(`Success rate: ${stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0}%`);
      
      console.log('\n--- Technical Analysis ---');
      console.log('✅ Schema validation ensures consistent webhook payloads');
      console.log('✅ Event transformation allows IPC -> webhook format conversion');
      console.log('✅ Subscription filters enable targeted webhook delivery');
      console.log('✅ Retry mechanisms handle delivery failures gracefully');
      
      console.log('\n--- AsyncAPI Value Assessment ---');
      console.log('❓ Schema definition: JSON schemas work well for webhook validation');
      console.log('❓ Documentation: Webhook schemas could be documented without AsyncAPI');
      console.log('❓ Code generation: No clear benefit for webhook delivery logic');
      console.log('❓ Standardization: AsyncAPI might help with webhook contract management');
      
      console.log('\n--- Key Questions for Decision ---');
      console.log('1. Do we have external systems that need webhook integration?');
      console.log('2. Would AsyncAPI help manage webhook contracts with external teams?');
      console.log('3. Is the AsyncAPI toolchain overhead worth it for webhook scenarios?');
      console.log('4. Could simple JSON schemas + documentation achieve the same goals?');
      
      console.log('\n--- Recommendation Based on Spike ---');
      console.log('🤔 Webhook delivery can be implemented effectively without AsyncAPI');
      console.log('🤔 Schema validation is valuable but doesn\'t require AsyncAPI specifically');
      console.log('🤔 Documentation benefits are unclear without concrete external consumers');
      console.log('🤔 Need to validate actual external integration requirements first');
      
      resolve();
    }, 20000);
  });
}

// Execute the spike
if (require.main === module) {
  runWebhookIntegrationSpike().catch(console.error);
}

module.exports = { IPCWebhookDelivery, MockWebhookClient, validateWebhookPayload };