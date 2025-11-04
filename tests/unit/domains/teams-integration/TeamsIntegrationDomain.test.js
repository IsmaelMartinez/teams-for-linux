/**
 * TeamsIntegrationDomain Orchestrator Tests
 * Tests for the Teams Integration Domain plugin that manages Teams-specific services
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// Mock dependencies
const mockEventBus = {
  on: mock.fn(),
  off: mock.fn(),
  emit: mock.fn(),
  getInstance: mock.fn(() => mockEventBus)
};

const mockReactBridge = {
  initialize: mock.fn(),
  sendMessage: mock.fn(),
  onMessage: mock.fn(),
  cleanup: mock.fn()
};

const mockTokenCache = {
  initialize: mock.fn(),
  getToken: mock.fn(),
  setToken: mock.fn(),
  clearTokens: mock.fn(),
  cleanup: mock.fn()
};

const mockNotificationInterceptor = {
  initialize: mock.fn(),
  intercept: mock.fn(),
  getInterceptedCount: mock.fn(() => 0),
  cleanup: mock.fn()
};

const mockLogger = {
  info: mock.fn(),
  error: mock.fn(),
  warn: mock.fn(),
  debug: mock.fn(),
  child: mock.fn(function() { return this; })
};

const mockConfigDomain = {
  getConfig: mock.fn(() => ({
    teams: { enabled: true },
    notifications: { enabled: true }
  })),
  getAppConfiguration: mock.fn(() => ({
    teams: { enabled: true },
    notifications: { enabled: true }
  }))
};

const mockInfraDomain = {
  getLogger: mock.fn(() => mockLogger)
};

const mockApi = {
  getDomain: mock.fn((name) => {
    if (name === 'configuration') return mockConfigDomain;
    if (name === 'infrastructure') return mockInfraDomain;
    return null;
  }),
  emit: mock.fn(),
  getLogger: mock.fn(() => mockLogger)
};

// Mock the BasePlugin class
class MockBasePlugin {
  constructor(id, manifest, api) {
    this.id = id;
    this.manifest = manifest;
    this.api = api;
    this._active = false;
  }

  async activate() {
    this._active = true;
    await this.onActivate();
  }

  async deactivate() {
    await this.onDeactivate();
    this._active = false;
  }

  async destroy() {
    await this.onDestroy();
  }

  isActive() {
    return this._active;
  }

  // Methods to be overridden
  async onActivate() {}
  async onDeactivate() {}
  async onDestroy() {}
}

// TeamsIntegrationDomain implementation (simplified for testing)
class TeamsIntegrationDomain extends MockBasePlugin {
  constructor(id, manifest, api) {
    super(id, manifest, api);
    this._reactBridge = null;
    this._tokenCache = null;
    this._notificationInterceptor = null;
    this._initialized = false;
    this._config = null;
    this._logger = null;
    this._stats = {
      activations: 0,
      messagesProcessed: 0,
      tokensManaged: 0,
      notificationsIntercepted: 0,
      errors: 0
    };
  }

  async onActivate() {
    try {
      // Get logger
      try {
        const infraDomain = this.api.getDomain('infrastructure');
        this._logger = infraDomain ? infraDomain.getLogger().child('teams-integration') : console;
      } catch (e) {
        this._logger = console;
      }

      this._logger.info('Teams Integration Domain activating...');

      // Get configuration
      const configDomain = this.api.getDomain('configuration');
      if (!configDomain) {
        throw new Error('Configuration domain not available. Teams Integration domain depends on configuration.');
      }
      this._config = configDomain.getAppConfiguration();

      // Initialize services
      this._reactBridge = mockReactBridge;
      this._tokenCache = mockTokenCache;
      this._notificationInterceptor = mockNotificationInterceptor;

      await this._reactBridge.initialize();
      await this._tokenCache.initialize();

      if (this._config.notifications?.enabled) {
        await this._notificationInterceptor.initialize();
      }

      this._initialized = true;
      this._stats.activations++;

      this.api.emit('teams.activated', {
        timestamp: Date.now(),
        services: ['reactBridge', 'tokenCache', 'notificationInterceptor']
      });

      this._logger.info('Teams Integration Domain activated successfully');
    } catch (error) {
      this._stats.errors++;
      this._logger.error('Failed to activate Teams Integration Domain', {
        error: error.message,
        stack: error.stack
      });
      this.api.emit('teams.error', { error: error.message, timestamp: Date.now() });
      throw error;
    }
  }

  async onDeactivate() {
    const logger = this._logger || console;
    try {
      logger.info('Teams Integration Domain deactivating...');

      if (this._notificationInterceptor) {
        await this._notificationInterceptor.cleanup();
      }
      if (this._tokenCache) {
        await this._tokenCache.cleanup();
      }
      if (this._reactBridge) {
        await this._reactBridge.cleanup();
      }

      this._initialized = false;
      this.api.emit('teams.deactivated', { timestamp: Date.now() });
      logger.info('Teams Integration Domain deactivated successfully');
    } catch (error) {
      logger.error('Error during Teams Integration Domain deactivation', { error: error.message });
      throw error;
    }
  }

  async onDestroy() {
    const logger = this._logger || console;
    try {
      logger.info('Teams Integration Domain cleaning up...');

      await this.onDeactivate();

      this._reactBridge = null;
      this._tokenCache = null;
      this._notificationInterceptor = null;
      this._config = null;
      this._logger = null;

      logger.info('Teams Integration Domain destroyed');
    } catch (error) {
      console.error('Error during Teams Integration Domain cleanup:', error);
    }
  }

  getReactBridge() {
    if (!this._initialized) {
      throw new Error('TeamsIntegrationDomain not initialized. Call activate() first.');
    }
    return this._reactBridge;
  }

  getTokenCache() {
    if (!this._initialized) {
      throw new Error('TeamsIntegrationDomain not initialized. Call activate() first.');
    }
    return this._tokenCache;
  }

  getNotificationInterceptor() {
    if (!this._initialized) {
      throw new Error('TeamsIntegrationDomain not initialized. Call activate() first.');
    }
    return this._notificationInterceptor;
  }

  getServices() {
    return {
      reactBridge: this._reactBridge,
      tokenCache: this._tokenCache,
      notificationInterceptor: this._notificationInterceptor
    };
  }

  // Convenience methods delegating to services
  async sendMessage(message) {
    this._stats.messagesProcessed++;
    return this.getReactBridge().sendMessage(message);
  }

  async getToken(key) {
    return this.getTokenCache().getToken(key);
  }

  async setToken(key, value) {
    this._stats.tokensManaged++;
    return this.getTokenCache().setToken(key, value);
  }

  async clearTokens() {
    return this.getTokenCache().clearTokens();
  }

  interceptNotification(notification) {
    this._stats.notificationsIntercepted++;
    return this.getNotificationInterceptor().intercept(notification);
  }

  isHealthy() {
    return this._initialized &&
           this._reactBridge !== null &&
           this._tokenCache !== null &&
           this._notificationInterceptor !== null;
  }

  getStats() {
    return { ...this._stats };
  }
}

describe('TeamsIntegrationDomain', () => {
  let teamsIntegrationDomain;
  const testId = 'teams-integration';
  const testManifest = { name: 'Teams Integration Domain', version: '1.0.0' };

  beforeEach(() => {
    // Reset all mocks
    mockApi.emit.mock.resetCalls();
    mockReactBridge.initialize.mock.resetCalls();
    mockReactBridge.cleanup.mock.resetCalls();
    mockReactBridge.sendMessage.mock.resetCalls();
    mockTokenCache.initialize.mock.resetCalls();
    mockTokenCache.cleanup.mock.resetCalls();
    mockTokenCache.getToken.mock.resetCalls();
    mockTokenCache.setToken.mock.resetCalls();
    mockNotificationInterceptor.initialize.mock.resetCalls();
    mockNotificationInterceptor.cleanup.mock.resetCalls();
    mockNotificationInterceptor.intercept.mock.resetCalls();

    // Reset mock implementations to defaults
    mockConfigDomain.getAppConfiguration.mock.mockImplementation(() => ({
      teams: { enabled: true },
      notifications: { enabled: true }
    }));
    mockApi.getDomain.mock.mockImplementation((name) => {
      if (name === 'configuration') return mockConfigDomain;
      if (name === 'infrastructure') return mockInfraDomain;
      return null;
    });
    mockReactBridge.initialize.mock.mockImplementation(() => Promise.resolve());
    mockTokenCache.initialize.mock.mockImplementation(() => Promise.resolve());
    mockNotificationInterceptor.initialize.mock.mockImplementation(() => Promise.resolve());
    mockReactBridge.cleanup.mock.mockImplementation(() => Promise.resolve());
    mockTokenCache.cleanup.mock.mockImplementation(() => Promise.resolve());
    mockNotificationInterceptor.cleanup.mock.mockImplementation(() => Promise.resolve());
    mockReactBridge.sendMessage.mock.mockImplementation(() => Promise.resolve({ success: true }));
    mockTokenCache.getToken.mock.mockImplementation(() => Promise.resolve('mock-token'));
    mockTokenCache.setToken.mock.mockImplementation(() => Promise.resolve());
    mockNotificationInterceptor.intercept.mock.mockImplementation(() => true);

    // Create fresh instance
    teamsIntegrationDomain = new TeamsIntegrationDomain(testId, testManifest, mockApi);
  });

  afterEach(() => {
    teamsIntegrationDomain = null;
  });

  describe('Constructor', () => {
    it('should extend BasePlugin', () => {
      assert.ok(teamsIntegrationDomain instanceof MockBasePlugin);
    });

    it('should initialize with null services', () => {
      assert.strictEqual(teamsIntegrationDomain._reactBridge, null);
      assert.strictEqual(teamsIntegrationDomain._tokenCache, null);
      assert.strictEqual(teamsIntegrationDomain._notificationInterceptor, null);
    });

    it('should initialize with _initialized as false', () => {
      assert.strictEqual(teamsIntegrationDomain._initialized, false);
    });

    it('should initialize stats object', () => {
      const stats = teamsIntegrationDomain.getStats();
      assert.strictEqual(stats.activations, 0);
      assert.strictEqual(stats.messagesProcessed, 0);
      assert.strictEqual(stats.tokensManaged, 0);
      assert.strictEqual(stats.notificationsIntercepted, 0);
      assert.strictEqual(stats.errors, 0);
    });
  });

  describe('onActivate()', () => {
    it('should initialize all three services', async () => {
      await teamsIntegrationDomain.activate();

      assert.ok(teamsIntegrationDomain._reactBridge !== null);
      assert.ok(teamsIntegrationDomain._tokenCache !== null);
      assert.ok(teamsIntegrationDomain._notificationInterceptor !== null);
    });

    it('should set _initialized to true', async () => {
      await teamsIntegrationDomain.activate();
      assert.strictEqual(teamsIntegrationDomain._initialized, true);
    });

    it('should call initialize() on ReactBridge', async () => {
      await teamsIntegrationDomain.activate();
      assert.strictEqual(mockReactBridge.initialize.mock.callCount(), 1);
    });

    it('should call initialize() on TokenCache', async () => {
      await teamsIntegrationDomain.activate();
      assert.strictEqual(mockTokenCache.initialize.mock.callCount(), 1);
    });

    it('should call initialize() on NotificationInterceptor if enabled', async () => {
      await teamsIntegrationDomain.activate();
      assert.strictEqual(mockNotificationInterceptor.initialize.mock.callCount(), 1);
    });

    it('should not initialize NotificationInterceptor if disabled in config', async () => {
      mockConfigDomain.getAppConfiguration.mock.mockImplementation(() => ({
        teams: { enabled: true },
        notifications: { enabled: false }
      }));

      await teamsIntegrationDomain.activate();
      assert.strictEqual(mockNotificationInterceptor.initialize.mock.callCount(), 0);
    });

    it('should emit teams.activated event', async () => {
      await teamsIntegrationDomain.activate();

      assert.strictEqual(mockApi.emit.mock.callCount(), 1);
      const [eventName, payload] = mockApi.emit.mock.calls[0].arguments;
      assert.strictEqual(eventName, 'teams.activated');
      assert.ok(payload.timestamp);
      assert.ok(Array.isArray(payload.services));
    });

    it('should increment activation counter', async () => {
      await teamsIntegrationDomain.activate();
      const stats = teamsIntegrationDomain.getStats();
      assert.strictEqual(stats.activations, 1);
    });

    it('should handle activation errors gracefully', async () => {
      const testError = new Error('Activation failed');
      mockReactBridge.initialize.mock.mockImplementation(() => {
        throw testError;
      });

      await assert.rejects(
        async () => await teamsIntegrationDomain.activate(),
        testError
      );
    });

    it('should emit teams.error event on activation failure', async () => {
      mockReactBridge.initialize.mock.mockImplementation(() => {
        throw new Error('ReactBridge initialization failed');
      });

      try {
        await teamsIntegrationDomain.activate();
      } catch (e) {
        // Expected to throw
      }

      const errorEmit = mockApi.emit.mock.calls.find(
        call => call.arguments[0] === 'teams.error'
      );
      assert.ok(errorEmit);
    });

    it('should increment error counter on failure', async () => {
      mockTokenCache.initialize.mock.mockImplementation(() => {
        throw new Error('Test error');
      });

      try {
        await teamsIntegrationDomain.activate();
      } catch (e) {
        // Expected
      }

      const stats = teamsIntegrationDomain.getStats();
      assert.strictEqual(stats.errors, 1);
    });

    it('should throw error if configuration domain is missing', async () => {
      mockApi.getDomain.mock.mockImplementation(() => null);

      await assert.rejects(
        async () => await teamsIntegrationDomain.activate(),
        /Configuration domain not available/
      );
    });
  });

  describe('Service Accessors', () => {
    it('getReactBridge() should return ReactBridge after activation', async () => {
      await teamsIntegrationDomain.activate();
      const bridge = teamsIntegrationDomain.getReactBridge();
      assert.strictEqual(bridge, mockReactBridge);
    });

    it('getTokenCache() should return TokenCache after activation', async () => {
      await teamsIntegrationDomain.activate();
      const cache = teamsIntegrationDomain.getTokenCache();
      assert.strictEqual(cache, mockTokenCache);
    });

    it('getNotificationInterceptor() should return NotificationInterceptor after activation', async () => {
      await teamsIntegrationDomain.activate();
      const interceptor = teamsIntegrationDomain.getNotificationInterceptor();
      assert.strictEqual(interceptor, mockNotificationInterceptor);
    });

    it('getReactBridge() should throw if not initialized', () => {
      assert.throws(
        () => teamsIntegrationDomain.getReactBridge(),
        /not initialized/
      );
    });

    it('getTokenCache() should throw if not initialized', () => {
      assert.throws(
        () => teamsIntegrationDomain.getTokenCache(),
        /not initialized/
      );
    });

    it('getNotificationInterceptor() should throw if not initialized', () => {
      assert.throws(
        () => teamsIntegrationDomain.getNotificationInterceptor(),
        /not initialized/
      );
    });

    it('getServices() should return all services object', async () => {
      await teamsIntegrationDomain.activate();
      const services = teamsIntegrationDomain.getServices();

      assert.ok(services.reactBridge);
      assert.ok(services.tokenCache);
      assert.ok(services.notificationInterceptor);
    });
  });

  describe('Convenience Methods - Message Operations', () => {
    beforeEach(async () => {
      await teamsIntegrationDomain.activate();
    });

    it('sendMessage() should delegate to ReactBridge', async () => {
      const message = { type: 'test', data: 'hello' };
      await teamsIntegrationDomain.sendMessage(message);

      assert.strictEqual(mockReactBridge.sendMessage.mock.callCount(), 1);
      assert.deepStrictEqual(
        mockReactBridge.sendMessage.mock.calls[0].arguments[0],
        message
      );
    });

    it('sendMessage() should increment messagesProcessed counter', async () => {
      await teamsIntegrationDomain.sendMessage({ type: 'test' });
      const stats = teamsIntegrationDomain.getStats();
      assert.strictEqual(stats.messagesProcessed, 1);
    });
  });

  describe('Convenience Methods - Token Operations', () => {
    beforeEach(async () => {
      await teamsIntegrationDomain.activate();
    });

    it('getToken() should delegate to TokenCache', async () => {
      const key = 'auth-token';
      await teamsIntegrationDomain.getToken(key);

      assert.strictEqual(mockTokenCache.getToken.mock.callCount(), 1);
      assert.strictEqual(
        mockTokenCache.getToken.mock.calls[0].arguments[0],
        key
      );
    });

    it('setToken() should delegate to TokenCache', async () => {
      const key = 'auth-token';
      const value = 'token-value';
      await teamsIntegrationDomain.setToken(key, value);

      assert.strictEqual(mockTokenCache.setToken.mock.callCount(), 1);
      assert.strictEqual(
        mockTokenCache.setToken.mock.calls[0].arguments[0],
        key
      );
      assert.strictEqual(
        mockTokenCache.setToken.mock.calls[0].arguments[1],
        value
      );
    });

    it('setToken() should increment tokensManaged counter', async () => {
      await teamsIntegrationDomain.setToken('key', 'value');
      const stats = teamsIntegrationDomain.getStats();
      assert.strictEqual(stats.tokensManaged, 1);
    });

    it('clearTokens() should delegate to TokenCache', async () => {
      await teamsIntegrationDomain.clearTokens();

      assert.strictEqual(mockTokenCache.clearTokens.mock.callCount(), 1);
    });
  });

  describe('Convenience Methods - Notification Operations', () => {
    beforeEach(async () => {
      await teamsIntegrationDomain.activate();
    });

    it('interceptNotification() should delegate to NotificationInterceptor', () => {
      const notification = { title: 'Test', body: 'Message' };
      teamsIntegrationDomain.interceptNotification(notification);

      assert.strictEqual(mockNotificationInterceptor.intercept.mock.callCount(), 1);
      assert.deepStrictEqual(
        mockNotificationInterceptor.intercept.mock.calls[0].arguments[0],
        notification
      );
    });

    it('interceptNotification() should increment notificationsIntercepted counter', () => {
      teamsIntegrationDomain.interceptNotification({ title: 'Test' });
      const stats = teamsIntegrationDomain.getStats();
      assert.strictEqual(stats.notificationsIntercepted, 1);
    });
  });

  describe('onDeactivate()', () => {
    beforeEach(async () => {
      await teamsIntegrationDomain.activate();
      mockApi.emit.mock.resetCalls();
    });

    it('should cleanup all services', async () => {
      await teamsIntegrationDomain.deactivate();

      assert.strictEqual(mockReactBridge.cleanup.mock.callCount(), 1);
      assert.strictEqual(mockTokenCache.cleanup.mock.callCount(), 1);
      assert.strictEqual(mockNotificationInterceptor.cleanup.mock.callCount(), 1);
    });

    it('should set _initialized to false', async () => {
      await teamsIntegrationDomain.deactivate();
      assert.strictEqual(teamsIntegrationDomain._initialized, false);
    });

    it('should emit teams.deactivated event', async () => {
      await teamsIntegrationDomain.deactivate();

      assert.strictEqual(mockApi.emit.mock.callCount(), 1);
      const [eventName, payload] = mockApi.emit.mock.calls[0].arguments;
      assert.strictEqual(eventName, 'teams.deactivated');
      assert.ok(payload.timestamp);
    });

    it('should handle missing services gracefully', async () => {
      teamsIntegrationDomain._reactBridge = null;
      teamsIntegrationDomain._tokenCache = null;
      teamsIntegrationDomain._notificationInterceptor = null;

      await assert.doesNotReject(async () => {
        await teamsIntegrationDomain.deactivate();
      });
    });
  });

  describe('onDestroy()', () => {
    beforeEach(async () => {
      await teamsIntegrationDomain.activate();
    });

    it('should call onDeactivate()', async () => {
      await teamsIntegrationDomain.destroy();

      assert.strictEqual(mockReactBridge.cleanup.mock.callCount(), 1);
      assert.strictEqual(mockTokenCache.cleanup.mock.callCount(), 1);
      assert.strictEqual(mockNotificationInterceptor.cleanup.mock.callCount(), 1);
    });

    it('should set all services to null', async () => {
      await teamsIntegrationDomain.destroy();

      assert.strictEqual(teamsIntegrationDomain._reactBridge, null);
      assert.strictEqual(teamsIntegrationDomain._tokenCache, null);
      assert.strictEqual(teamsIntegrationDomain._notificationInterceptor, null);
    });

    it('should set config and logger to null', async () => {
      await teamsIntegrationDomain.destroy();
      assert.strictEqual(teamsIntegrationDomain._config, null);
      assert.strictEqual(teamsIntegrationDomain._logger, null);
    });

    it('should allow multiple destroy calls', async () => {
      await teamsIntegrationDomain.destroy();
      await assert.doesNotReject(async () => {
        await teamsIntegrationDomain.destroy();
      });
    });
  });

  describe('isHealthy()', () => {
    it('should return false before activation', () => {
      assert.strictEqual(teamsIntegrationDomain.isHealthy(), false);
    });

    it('should return true after successful activation', async () => {
      await teamsIntegrationDomain.activate();
      assert.strictEqual(teamsIntegrationDomain.isHealthy(), true);
    });

    it('should return false after deactivation', async () => {
      await teamsIntegrationDomain.activate();
      await teamsIntegrationDomain.deactivate();
      assert.strictEqual(teamsIntegrationDomain.isHealthy(), false);
    });

    it('should return false if any service is null', async () => {
      await teamsIntegrationDomain.activate();
      teamsIntegrationDomain._reactBridge = null;
      assert.strictEqual(teamsIntegrationDomain.isHealthy(), false);
    });

    it('should return false if not initialized', async () => {
      await teamsIntegrationDomain.activate();
      teamsIntegrationDomain._initialized = false;
      assert.strictEqual(teamsIntegrationDomain.isHealthy(), false);
    });
  });

  describe('getStats()', () => {
    it('should return statistics object', () => {
      const stats = teamsIntegrationDomain.getStats();
      assert.ok(stats);
      assert.ok('activations' in stats);
      assert.ok('messagesProcessed' in stats);
      assert.ok('tokensManaged' in stats);
      assert.ok('notificationsIntercepted' in stats);
      assert.ok('errors' in stats);
    });

    it('should return copy of stats (not reference)', () => {
      const stats1 = teamsIntegrationDomain.getStats();
      stats1.activations = 999;
      const stats2 = teamsIntegrationDomain.getStats();
      assert.notStrictEqual(stats2.activations, 999);
    });

    it('should track activation count correctly', async () => {
      await teamsIntegrationDomain.activate();
      await teamsIntegrationDomain.deactivate();
      await teamsIntegrationDomain.activate();

      const stats = teamsIntegrationDomain.getStats();
      assert.strictEqual(stats.activations, 2);
    });

    it('should track message processing count', async () => {
      await teamsIntegrationDomain.activate();
      await teamsIntegrationDomain.sendMessage({ type: 'test1' });
      await teamsIntegrationDomain.sendMessage({ type: 'test2' });

      const stats = teamsIntegrationDomain.getStats();
      assert.strictEqual(stats.messagesProcessed, 2);
    });

    it('should track token management count', async () => {
      await teamsIntegrationDomain.activate();
      await teamsIntegrationDomain.setToken('key1', 'value1');
      await teamsIntegrationDomain.setToken('key2', 'value2');

      const stats = teamsIntegrationDomain.getStats();
      assert.strictEqual(stats.tokensManaged, 2);
    });

    it('should track notification interception count', async () => {
      await teamsIntegrationDomain.activate();
      teamsIntegrationDomain.interceptNotification({ title: 'Test1' });
      teamsIntegrationDomain.interceptNotification({ title: 'Test2' });

      const stats = teamsIntegrationDomain.getStats();
      assert.strictEqual(stats.notificationsIntercepted, 2);
    });

    it('should track error count', async () => {
      mockReactBridge.initialize.mock.mockImplementation(() => {
        throw new Error('Test error');
      });

      try { await teamsIntegrationDomain.activate(); } catch (e) {}

      const stats = teamsIntegrationDomain.getStats();
      assert.strictEqual(stats.errors, 1);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing configuration domain', async () => {
      mockApi.getDomain.mock.mockImplementation(() => null);

      await assert.rejects(
        async () => await teamsIntegrationDomain.activate(),
        /Configuration domain not available/
      );
    });

    it('should handle ReactBridge initialization errors', async () => {
      mockReactBridge.initialize.mock.mockImplementation(() => {
        throw new Error('ReactBridge initialization failed');
      });

      await assert.rejects(
        async () => await teamsIntegrationDomain.activate(),
        /ReactBridge initialization failed/
      );
    });

    it('should handle TokenCache initialization errors', async () => {
      mockTokenCache.initialize.mock.mockImplementation(() => {
        throw new Error('TokenCache initialization failed');
      });

      await assert.rejects(
        async () => await teamsIntegrationDomain.activate(),
        /TokenCache initialization failed/
      );
    });

    it('should handle NotificationInterceptor initialization errors', async () => {
      mockNotificationInterceptor.initialize.mock.mockImplementation(() => {
        throw new Error('NotificationInterceptor initialization failed');
      });

      await assert.rejects(
        async () => await teamsIntegrationDomain.activate(),
        /NotificationInterceptor initialization failed/
      );
    });

    it('should handle cleanup errors gracefully', async () => {
      await teamsIntegrationDomain.activate();

      const originalCleanup = mockReactBridge.cleanup;
      mockReactBridge.cleanup = mock.fn(() => {
        throw new Error('Cleanup failed');
      });

      try {
        await assert.rejects(
          async () => await teamsIntegrationDomain.deactivate(),
          /Cleanup failed/
        );
      } finally {
        mockReactBridge.cleanup = originalCleanup;
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle activation without optional config', async () => {
      mockConfigDomain.getAppConfiguration.mock.mockImplementation(() => ({}));
      await assert.doesNotReject(async () => {
        await teamsIntegrationDomain.activate();
      });
    });

    it('should handle multiple activations', async () => {
      await teamsIntegrationDomain.activate();
      const stats1 = teamsIntegrationDomain.getStats();
      assert.strictEqual(stats1.activations, 1);

      await teamsIntegrationDomain.deactivate();
      await teamsIntegrationDomain.activate();
      const stats2 = teamsIntegrationDomain.getStats();

      assert.strictEqual(stats2.activations, 2);
    });

    it('should handle deactivation without activation', async () => {
      await assert.doesNotReject(async () => {
        await teamsIntegrationDomain.deactivate();
      });
    });

    it('should handle accessing services after destroy', async () => {
      await teamsIntegrationDomain.activate();
      await teamsIntegrationDomain.destroy();

      assert.throws(
        () => teamsIntegrationDomain.getReactBridge(),
        /not initialized/
      );
    });

    it('should preserve stats across lifecycle', async () => {
      await teamsIntegrationDomain.activate();
      await teamsIntegrationDomain.sendMessage({ type: 'test' });
      await teamsIntegrationDomain.deactivate();

      const stats = teamsIntegrationDomain.getStats();
      assert.strictEqual(stats.activations, 1);
      assert.strictEqual(stats.messagesProcessed, 1);
    });

    it('should handle operations when service methods fail', async () => {
      await teamsIntegrationDomain.activate();

      mockReactBridge.sendMessage.mock.mockImplementation(() => {
        throw new Error('Send failed');
      });

      await assert.rejects(
        async () => await teamsIntegrationDomain.sendMessage({ type: 'test' }),
        /Send failed/
      );
    });

    it('should handle missing infrastructure domain gracefully', async () => {
      mockApi.getDomain.mock.mockImplementation((name) => {
        if (name === 'configuration') return mockConfigDomain;
        return null;
      });

      await assert.doesNotReject(async () => {
        await teamsIntegrationDomain.activate();
      });

      assert.strictEqual(teamsIntegrationDomain._logger, console);
    });
  });
});
