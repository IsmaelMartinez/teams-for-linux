const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

// Mock services
class MockLogger {
  constructor(options = {}) {
    this._level = options.level || 'info';
    this._namespace = options.namespace || 'app';
    this._logs = [];
  }

  info(...args) { this._logs.push({ level: 'info', args }); }
  error(...args) { this._logs.push({ level: 'error', args }); }
  child(namespace, context) {
    return new MockLogger({
      level: this._level,
      namespace,
      context
    });
  }
}

class MockCacheManager {
  constructor(config) {
    this._config = config;
    this._stopped = false;
  }
  stop() { this._stopped = true; }
}

class MockNetworkMonitor {
  constructor(config) {
    this._config = config;
    this._stopped = false;
  }
  stop() { this._stopped = true; }
  cleanup() { this._stopped = true; }
}

// Mock EventBus
const mockEventBus = {
  _emitted: [],
  emit: function(event, data) {
    this._emitted.push({ event, data });
  },
  _reset() {
    this._emitted = [];
  }
};

// Mock PluginAPI
class MockPluginAPI {
  constructor() {
    this._config = {
      logLevel: 'debug',
      maxCacheSizeMB: 600,
      cacheCheckIntervalMs: 3600000,
      url: 'https://teams.microsoft.com',
      networkCheckIntervalMs: 30000
    };
  }

  getConfig() {
    return this._config;
  }

  emit(event, data) {
    mockEventBus.emit(event, data);
  }
}

// Setup mocks
const projectRoot = path.resolve(__dirname, '../../../..');

// Mock Logger
const loggerPath = path.join(projectRoot, 'app/domains/infrastructure/services/Logger.js');
require.cache[loggerPath] = {
  exports: MockLogger
};

// Mock CacheManager
const cacheManagerPath = path.join(projectRoot, 'app/cacheManager');
require.cache[cacheManagerPath] = {
  exports: MockCacheManager
};
require.cache[cacheManagerPath + '/index.js'] = {
  exports: MockCacheManager
};

// Mock NetworkMonitor
const networkMonitorPath = path.join(projectRoot, 'app/domains/infrastructure/services/NetworkMonitor.js');
require.cache[networkMonitorPath] = {
  exports: MockNetworkMonitor
};

// Mock BasePlugin
const BasePlugin = require(path.join(projectRoot, 'app/plugins/BasePlugin.js'));

const InfrastructureDomain = require(path.join(projectRoot, 'app/domains/infrastructure/InfrastructureDomain'));

describe('InfrastructureDomain', () => {
  let domain;
  let api;

  beforeEach(() => {
    mockEventBus._reset();
    api = new MockPluginAPI();

    const manifest = {
      id: 'infrastructure-domain',
      name: 'Infrastructure Domain',
      version: '1.0.0'
    };

    domain = new InfrastructureDomain('infrastructure', manifest, api);
  });

  afterEach(() => {
    if (domain && domain.isActive) {
      domain.deactivate().catch(() => {});
    }
  });

  describe('Constructor', () => {
    it('should create domain with proper initialization', () => {
      assert.strictEqual(domain.id, 'infrastructure');
      assert.strictEqual(domain.isActive, false);
    });

    it('should extend BasePlugin', () => {
      assert.ok(domain instanceof BasePlugin);
      assert.ok(domain.onActivate);
      assert.ok(domain.onDeactivate);
      assert.ok(domain.onDestroy);
    });

    it('should initialize with null services', () => {
      const services = domain.getServices();
      assert.strictEqual(services.logger, null);
      assert.strictEqual(services.cacheManager, null);
      assert.strictEqual(services.networkMonitor, null);
    });
  });

  describe('Activation', () => {
    it('should activate successfully', async () => {
      await domain.activate();

      assert.strictEqual(domain.isActive, true);
    });

    it('should initialize all three services', async () => {
      await domain.activate();

      const services = domain.getServices();
      assert.ok(services.logger);
      assert.ok(services.cacheManager);
      assert.ok(services.networkMonitor);
    });

    it('should initialize Logger first with correct config', async () => {
      await domain.activate();

      const logger = domain.getLogger();
      assert.ok(logger);
      assert.strictEqual(logger._level, 'debug');
      assert.strictEqual(logger._namespace, 'infrastructure');
    });

    it('should initialize CacheManager with config', async () => {
      await domain.activate();

      const cacheManager = domain.getCacheManager();
      assert.ok(cacheManager);
      assert.ok(cacheManager._config);
    });

    it('should initialize NetworkMonitor with config', async () => {
      await domain.activate();

      const networkMonitor = domain.getNetworkMonitor();
      assert.ok(networkMonitor);
      assert.ok(networkMonitor._config);
    });

    it('should emit infrastructure.activated event', async () => {
      await domain.activate();

      const activatedEvents = mockEventBus._emitted.filter(
        e => e.event === 'infrastructure.activated'
      );
      assert.strictEqual(activatedEvents.length, 1);
      assert.deepStrictEqual(activatedEvents[0].data.services, ['logger', 'cacheManager', 'networkMonitor']);
    });

    it('should throw error if already active', async () => {
      await domain.activate();

      await assert.rejects(
        async () => await domain.activate(),
        /already active/
      );
    });
  });

  describe('Service Access', () => {
    beforeEach(async () => {
      await domain.activate();
    });

    it('should return Logger service', () => {
      const logger = domain.getLogger();
      assert.ok(logger);
      assert.ok(logger.info);
      assert.ok(logger.error);
      assert.ok(logger.child);
    });

    it('should return CacheManager service', () => {
      const cacheManager = domain.getCacheManager();
      assert.ok(cacheManager);
      assert.ok(cacheManager.stop);
    });

    it('should return NetworkMonitor service', () => {
      const networkMonitor = domain.getNetworkMonitor();
      assert.ok(networkMonitor);
      assert.ok(networkMonitor.stop);
      assert.ok(networkMonitor.cleanup);
    });

    it('should return all services via getServices', () => {
      const services = domain.getServices();
      assert.ok(services.logger);
      assert.ok(services.cacheManager);
      assert.ok(services.networkMonitor);
    });

    it('should throw error when accessing Logger before activation', () => {
      const inactiveDomain = new InfrastructureDomain(
        'test',
        { id: 'test', name: 'Test', version: '1.0.0' },
        api
      );

      assert.throws(
        () => inactiveDomain.getLogger(),
        /not initialized/
      );
    });

    it('should throw error when accessing CacheManager before activation', () => {
      const inactiveDomain = new InfrastructureDomain(
        'test',
        { id: 'test', name: 'Test', version: '1.0.0' },
        api
      );

      assert.throws(
        () => inactiveDomain.getCacheManager(),
        /not initialized/
      );
    });

    it('should throw error when accessing NetworkMonitor before activation', () => {
      const inactiveDomain = new InfrastructureDomain(
        'test',
        { id: 'test', name: 'Test', version: '1.0.0' },
        api
      );

      assert.throws(
        () => inactiveDomain.getNetworkMonitor(),
        /not initialized/
      );
    });
  });

  describe('Health Check', () => {
    it('should report unhealthy before activation', () => {
      assert.strictEqual(domain.isHealthy(), false);
    });

    it('should report healthy after activation', async () => {
      await domain.activate();

      assert.strictEqual(domain.isHealthy(), true);
    });

    it('should check all three services', async () => {
      await domain.activate();

      assert.strictEqual(domain.isHealthy(), true);

      // Verify it checks for all services
      const services = domain.getServices();
      assert.ok(services.logger);
      assert.ok(services.cacheManager);
      assert.ok(services.networkMonitor);
    });
  });

  describe('Deactivation', () => {
    beforeEach(async () => {
      await domain.activate();
    });

    it('should deactivate successfully', async () => {
      await domain.deactivate();

      assert.strictEqual(domain.isActive, false);
    });

    it('should stop CacheManager', async () => {
      const cacheManager = domain.getCacheManager();

      await domain.deactivate();

      assert.strictEqual(cacheManager._stopped, true);
    });

    it('should stop NetworkMonitor', async () => {
      const networkMonitor = domain.getNetworkMonitor();

      await domain.deactivate();

      assert.strictEqual(networkMonitor._stopped, true);
    });

    it('should emit infrastructure.deactivated event', async () => {
      mockEventBus._reset();

      await domain.deactivate();

      const deactivatedEvents = mockEventBus._emitted.filter(
        e => e.event === 'infrastructure.deactivated'
      );
      assert.strictEqual(deactivatedEvents.length, 1);
    });

    it('should throw error when deactivating inactive domain', async () => {
      await domain.deactivate();

      await assert.rejects(
        async () => await domain.deactivate(),
        /not active/
      );
    });
  });

  describe('Cleanup', () => {
    beforeEach(async () => {
      await domain.activate();
    });

    it('should cleanup resources', async () => {
      await domain.destroy();

      assert.strictEqual(domain.isActive, false);
    });

    it('should stop CacheManager on cleanup', async () => {
      const cacheManager = domain.getCacheManager();

      await domain.destroy();

      assert.strictEqual(cacheManager._stopped, true);
    });

    it('should cleanup NetworkMonitor', async () => {
      const networkMonitor = domain.getNetworkMonitor();

      await domain.destroy();

      assert.strictEqual(networkMonitor._stopped, true);
    });

    it('should clear service references', async () => {
      await domain.destroy();

      const services = domain.getServices();
      assert.strictEqual(services.logger, null);
      assert.strictEqual(services.cacheManager, null);
      assert.strictEqual(services.networkMonitor, null);
    });
  });
});
