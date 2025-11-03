/**
 * Example: Plugin IPC Communication Test Template
 *
 * Demonstrates how to test IPC communication between plugins
 * and the main process or other components
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  createMockPluginEnvironment,
  createMockManifest,
  createMockIPC,
  createPluginIPCTest
} from '../helpers/plugin-test-utils.js';

// Example Plugin with IPC communication
class IPCPlugin {
  constructor(id, manifest, api) {
    this.id = id;
    this.manifest = manifest;
    this.api = api;
    this.isActive = false;
    this.ipc = api.ipc;
    this.logger = api.getLogger(id);
    this.messageHandlers = new Map();
  }

  async activate() {
    this.logger.info('Activating IPC plugin');
    this.isActive = true;

    // Register IPC handlers
    this.ipc.on('request-data', this.handleDataRequest.bind(this));
    this.ipc.on('command', this.handleCommand.bind(this));

    this.logger.info('IPC handlers registered');
  }

  async deactivate() {
    this.logger.info('Deactivating IPC plugin');
    this.isActive = false;

    // Unregister IPC handlers
    this.ipc.off('request-data', this.handleDataRequest.bind(this));
    this.ipc.off('command', this.handleCommand.bind(this));
  }

  async destroy() {
    this.logger.info('Destroying IPC plugin');
  }

  handleDataRequest(data) {
    this.logger.debug('Received data request', data);
    return { response: 'data', requestId: data.requestId };
  }

  handleCommand(command) {
    this.logger.debug('Received command', command);
    this.messageHandlers.set(command.id, command);
  }

  async sendMessage(channel, data) {
    if (!this.isActive) {
      throw new Error('Plugin is not active');
    }
    this.ipc.send(channel, data);
  }

  async invokeMain(channel, data) {
    if (!this.isActive) {
      throw new Error('Plugin is not active');
    }
    return await this.ipc.invoke(channel, data);
  }
}

// Basic IPC Tests
describe('Plugin IPC - Basic Communication', () => {
  it('should send messages via IPC', async () => {
    const env = createMockPluginEnvironment();
    const manifest = createMockManifest();
    const plugin = new IPCPlugin('ipc-plugin', manifest, env.api);

    await plugin.activate();

    // Send a message
    await plugin.sendMessage('test-channel', { message: 'hello' });

    // Verify IPC send was called
    assert.strictEqual(env.api.ipc.send.callCount(), 1);
    assert.ok(env.api.ipc.send.calledWith('test-channel', { message: 'hello' }));

    await plugin.deactivate();
    await plugin.destroy();
    env.cleanup();
  });

  it('should invoke main process methods', async () => {
    const env = createMockPluginEnvironment();
    const manifest = createMockManifest();
    const plugin = new IPCPlugin('ipc-plugin', manifest, env.api);

    // Mock the invoke response
    env.api.ipc.invoke = async (channel, data) => {
      if (channel === 'get-app-version') {
        return '3.0.0';
      }
      return null;
    };

    await plugin.activate();

    const version = await plugin.invokeMain('get-app-version', {});
    assert.strictEqual(version, '3.0.0');

    await plugin.deactivate();
    await plugin.destroy();
    env.cleanup();
  });

  it('should receive IPC messages', async () => {
    const env = createMockPluginEnvironment();
    const manifest = createMockManifest();
    const plugin = new IPCPlugin('ipc-plugin', manifest, env.api);

    await plugin.activate();

    // Simulate incoming IPC message
    env.api.ipc._trigger('request-data', { requestId: 'req-123' });

    // Check handler was registered
    assert.strictEqual(env.api.ipc.on.callCount(), 2); // 2 handlers registered

    await plugin.deactivate();
    await plugin.destroy();
    env.cleanup();
  });

  it('should handle IPC errors gracefully', async () => {
    const env = createMockPluginEnvironment();
    const manifest = createMockManifest();
    const plugin = new IPCPlugin('ipc-plugin', manifest, env.api);

    // Mock IPC to throw error
    env.api.ipc.invoke = async () => {
      throw new Error('IPC communication failed');
    };

    await plugin.activate();

    await assert.rejects(
      async () => await plugin.invokeMain('failing-channel', {}),
      { message: 'IPC communication failed' }
    );

    await plugin.deactivate();
    await plugin.destroy();
    env.cleanup();
  });
});

// Advanced IPC Tests
describe('Plugin IPC - Advanced Communication', () => {
  it('should handle bidirectional communication', async () => {
    const env = createMockPluginEnvironment();
    const ipc = createMockIPC();
    env.api.ipc = ipc;

    const manifest = createMockManifest();
    const plugin = new IPCPlugin('ipc-plugin', manifest, env.api);

    // Set up response handler in main process
    ipc.handle('request-data', (data) => {
      return { response: `Response to ${data.requestId}` };
    });

    await plugin.activate();

    // Plugin invokes main process
    const result = await plugin.invokeMain('request-data', { requestId: 'req-456' });

    assert.deepStrictEqual(result, { response: 'Response to req-456' });

    await plugin.deactivate();
    await plugin.destroy();
    env.cleanup();
  });

  it('should track all IPC invocations', async () => {
    const env = createMockPluginEnvironment();
    const ipc = createMockIPC();
    env.api.ipc = ipc;

    const manifest = createMockManifest();
    const plugin = new IPCPlugin('ipc-plugin', manifest, env.api);

    await plugin.activate();

    // Make multiple invocations
    await plugin.sendMessage('channel-1', { data: 1 });
    await plugin.sendMessage('channel-2', { data: 2 });
    await plugin.invokeMain('channel-3', { data: 3 });

    // Check invocation history
    const invocations = ipc.getInvocations();
    assert.strictEqual(invocations.length, 3);

    const sendInvocations = invocations.filter(inv => inv.type === 'send');
    const invokeInvocations = invocations.filter(inv => inv.type === 'invoke');

    assert.strictEqual(sendInvocations.length, 2);
    assert.strictEqual(invokeInvocations.length, 1);

    await plugin.deactivate();
    await plugin.destroy();
    ipc.reset();
    env.cleanup();
  });

  it('should filter invocations by channel', async () => {
    const env = createMockPluginEnvironment();
    const ipc = createMockIPC();
    env.api.ipc = ipc;

    const manifest = createMockManifest();
    const plugin = new IPCPlugin('ipc-plugin', manifest, env.api);

    await plugin.activate();

    // Make invocations to different channels
    await plugin.sendMessage('notifications', { type: 'info' });
    await plugin.sendMessage('updates', { version: '1.0' });
    await plugin.sendMessage('notifications', { type: 'warning' });

    // Filter by channel
    const notificationInvocations = ipc.getInvocations('notifications');
    assert.strictEqual(notificationInvocations.length, 2);

    const updateInvocations = ipc.getInvocations('updates');
    assert.strictEqual(updateInvocations.length, 1);

    await plugin.deactivate();
    await plugin.destroy();
    ipc.reset();
    env.cleanup();
  });

  it('should handle concurrent IPC operations', async () => {
    const env = createMockPluginEnvironment();
    const ipc = createMockIPC();
    env.api.ipc = ipc;

    // Set up handler with delay
    ipc.handle('slow-operation', async (data) => {
      await new Promise(resolve => setTimeout(resolve, 50));
      return { result: data.value * 2 };
    });

    const manifest = createMockManifest();
    const plugin = new IPCPlugin('ipc-plugin', manifest, env.api);

    await plugin.activate();

    // Make concurrent invocations
    const results = await Promise.all([
      plugin.invokeMain('slow-operation', { value: 1 }),
      plugin.invokeMain('slow-operation', { value: 2 }),
      plugin.invokeMain('slow-operation', { value: 3 })
    ]);

    assert.deepStrictEqual(results, [
      { result: 2 },
      { result: 4 },
      { result: 6 }
    ]);

    await plugin.deactivate();
    await plugin.destroy();
    ipc.reset();
    env.cleanup();
  });
});

// IPC Event Flow Tests
describe('Plugin IPC - Event Flow', () => {
  it('should handle request-response pattern', async () => {
    const env = createMockPluginEnvironment();
    const ipc = createMockIPC();
    env.api.ipc = ipc;

    let requestReceived = false;
    let responseData = null;

    // Set up main process handler
    ipc.handle('plugin-request', (data) => {
      requestReceived = true;
      return { status: 'success', data: data.payload };
    });

    const manifest = createMockManifest();
    const plugin = new IPCPlugin('ipc-plugin', manifest, env.api);

    await plugin.activate();

    // Send request and wait for response
    responseData = await plugin.invokeMain('plugin-request', { payload: 'test' });

    assert.strictEqual(requestReceived, true);
    assert.deepStrictEqual(responseData, { status: 'success', data: 'test' });

    await plugin.deactivate();
    await plugin.destroy();
    ipc.reset();
    env.cleanup();
  });

  it('should handle fire-and-forget pattern', async () => {
    const env = createMockPluginEnvironment();
    const ipc = createMockIPC();
    env.api.ipc = ipc;

    const receivedMessages = [];

    // Set up listener
    ipc.on('notification', (data) => {
      receivedMessages.push(data);
    });

    const manifest = createMockManifest();
    const plugin = new IPCPlugin('ipc-plugin', manifest, env.api);

    await plugin.activate();

    // Send notifications
    await plugin.sendMessage('notification', { type: 'info', message: 'Hello' });
    await plugin.sendMessage('notification', { type: 'warning', message: 'Warning' });

    // Wait a bit for messages to be processed
    await new Promise(resolve => setTimeout(resolve, 10));

    // Trigger the notifications manually since we're mocking
    ipc.trigger('notification', { type: 'info', message: 'Hello' });
    ipc.trigger('notification', { type: 'warning', message: 'Warning' });

    assert.strictEqual(receivedMessages.length, 2);

    await plugin.deactivate();
    await plugin.destroy();
    ipc.reset();
    env.cleanup();
  });

  it('should handle streaming data pattern', async () => {
    const env = createMockPluginEnvironment();
    const ipc = createMockIPC();
    env.api.ipc = ipc;

    const streamData = [];

    // Set up stream handler
    ipc.on('data-stream', (chunk) => {
      streamData.push(chunk);
    });

    const manifest = createMockManifest();
    const plugin = new IPCPlugin('ipc-plugin', manifest, env.api);

    await plugin.activate();

    // Send stream of data
    for (let i = 0; i < 5; i++) {
      await plugin.sendMessage('data-stream', { chunk: i, data: `data-${i}` });
      ipc.trigger('data-stream', { chunk: i, data: `data-${i}` });
    }

    assert.strictEqual(streamData.length, 5);
    assert.strictEqual(streamData[0].chunk, 0);
    assert.strictEqual(streamData[4].chunk, 4);

    await plugin.deactivate();
    await plugin.destroy();
    ipc.reset();
    env.cleanup();
  });
});

// Using Test Template
describe('Plugin IPC - Template Tests', () => {
  it('should pass basic IPC test',
    createPluginIPCTest('IPC communication', async (ipc, env) => {
      const manifest = createMockManifest();
      const plugin = new IPCPlugin('ipc-plugin', manifest, env.api);

      await plugin.activate();

      // Send message
      await plugin.sendMessage('test', { data: 'test' });

      // Verify
      assert.strictEqual(ipc.send.callCount(), 1);

      await plugin.deactivate();
      await plugin.destroy();
    })
  );

  it('should pass invoke test',
    createPluginIPCTest('IPC invocation', async (ipc, env) => {
      // Set up handler
      ipc.handle('get-config', () => ({ setting: 'value' }));

      const manifest = createMockManifest();
      const plugin = new IPCPlugin('ipc-plugin', manifest, env.api);

      await plugin.activate();

      // Invoke
      const config = await plugin.invokeMain('get-config', {});

      // Verify
      assert.deepStrictEqual(config, { setting: 'value' });
      assert.strictEqual(ipc.invoke.callCount(), 1);

      await plugin.deactivate();
      await plugin.destroy();
    })
  );
});

// Error Handling Tests
describe('Plugin IPC - Error Handling', () => {
  it('should handle timeout errors', async () => {
    const env = createMockPluginEnvironment();
    const ipc = createMockIPC();
    env.api.ipc = ipc;

    // Set up slow handler
    ipc.handle('slow-operation', async () => {
      await new Promise(resolve => setTimeout(resolve, 5000));
      return { result: 'done' };
    });

    const manifest = createMockManifest();
    const plugin = new IPCPlugin('ipc-plugin', manifest, env.api);

    await plugin.activate();

    // This should timeout (mock implementation)
    const timeoutPromise = Promise.race([
      plugin.invokeMain('slow-operation', {}),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('IPC timeout')), 1000)
      )
    ]);

    await assert.rejects(timeoutPromise, { message: 'IPC timeout' });

    await plugin.deactivate();
    await plugin.destroy();
    ipc.reset();
    env.cleanup();
  });

  it('should handle channel not found errors', async () => {
    const env = createMockPluginEnvironment();
    const ipc = createMockIPC();
    env.api.ipc = ipc;

    const manifest = createMockManifest();
    const plugin = new IPCPlugin('ipc-plugin', manifest, env.api);

    await plugin.activate();

    // Invoke non-existent channel (returns null in mock)
    const result = await plugin.invokeMain('non-existent-channel', {});
    assert.strictEqual(result, null);

    await plugin.deactivate();
    await plugin.destroy();
    ipc.reset();
    env.cleanup();
  });
});
