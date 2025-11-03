const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

// Mock electron before requiring ConfigurationDomain
const mockApp = {
  getPath: (name) => {
    if (name === 'userData') return '/mock/userData';
    return '/mock/path';
  },
  getVersion: () => '3.0.0-test'
};

// Mock electron-store
class MockStore {
  constructor(options) {
    this._name = options.name;
    this._data = new Map();
  }

  get(key, defaultValue) {
    return this._data.has(key) ? this._data.get(key) : defaultValue;
  }

  set(key, value) {
    this._data.set(key, value);
  }

  clear() {
    this._data.clear();
  }

  _reset() {
    this._data.clear();
  }
}

// Mock AppConfiguration
class MockAppConfiguration {
  constructor(configPath, appVersion) {
    this._configPath = configPath;
    this._appVersion = appVersion;
    this.legacyConfigStore = new MockStore({ name: 'config' });
    this.settingsStore = new MockStore({ name: 'settings' });
  }

  get configPath() {
    return this._configPath;
  }
}

// Mock StateManager
class MockStateManager {
  constructor() {
    this._snapshot = {
      userStatus: -1,
      idleTimeUserStatus: -1,
      screenSharingActive: false,
      currentScreenShareSourceId: null,
      customState: {}
    };
  }

  getSnapshot() {
    return { ...this._snapshot };
  }

  restoreSnapshot(snapshot) {
    this._snapshot = { ...snapshot };
  }

  reset() {
    this._snapshot = {
      userStatus: -1,
      idleTimeUserStatus: -1,
      screenSharingActive: false,
      currentScreenShareSourceId: null,
      customState: {}
    };
  }

  getStats() {
    return {
      userStatus: this._snapshot.userStatus,
      idleTimeUserStatus: this._snapshot.idleTimeUserStatus,
      screenSharingActive: this._snapshot.screenSharingActive,
      hasScreenShareSource: this._snapshot.currentScreenShareSourceId !== null,
      customStateCount: Object.keys(this._snapshot.customState).length
    };
  }
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
    this._config = {};
    this._domains = new Map();
  }

  getConfig() {
    return this._config;
  }

  emit(event, data) {
    mockEventBus.emit(event, data);
  }

  getDomain(id) {
    if (!this._domains.has(id)) {
      throw new Error(`Domain ${id} not found`);
    }
    return this._domains.get(id);
  }

  _setDomain(id, domain) {
    this._domains.set(id, domain);
  }
}

// Setup mocks using absolute paths
const path = require('path');
const projectRoot = path.resolve(__dirname, '../../../..');

require.cache[require.resolve('electron')] = {
  exports: { app: mockApp }
};
require.cache[require.resolve('electron-store')] = {
  exports: MockStore
};

// Mock BasePlugin
const basePluginPath = path.join(projectRoot, 'app/plugins/BasePlugin.js');
const BasePlugin = require(basePluginPath); // Load real BasePlugin
require.cache[basePluginPath] = {
  exports: BasePlugin
};

// Mock the AppConfiguration module using absolute path
const appConfigPath = path.join(projectRoot, 'app/appConfiguration');
require.cache[appConfigPath + '/index.js'] = {
  exports: { AppConfiguration: MockAppConfiguration }
};
require.cache[appConfigPath] = {
  exports: { AppConfiguration: MockAppConfiguration }
};

// Mock StateManager using absolute path
const stateManagerPath = path.join(projectRoot, 'app/domains/configuration/StateManager.js');
require.cache[stateManagerPath] = {
  exports: MockStateManager
};

const ConfigurationDomain = require(path.join(projectRoot, 'app/domains/configuration/ConfigurationDomain'));

describe('ConfigurationDomain', () => {
  let domain;
  let api;

  beforeEach(() => {
    mockEventBus._reset();
    api = new MockPluginAPI();

    const manifest = {
      id: 'configuration-domain',
      name: 'Configuration Domain',
      version: '1.0.0'
    };

    domain = new ConfigurationDomain('configuration', manifest, api);
  });

  afterEach(() => {
    if (domain && domain.isActive) {
      domain.deactivate().catch(() => {});
    }
  });

  describe('Constructor', () => {
    it('should create domain with proper initialization', () => {
      assert.strictEqual(domain.id, 'configuration');
      assert.strictEqual(domain.isActive, false);
    });

    it('should extend BasePlugin', () => {
      assert.ok(domain.onActivate);
      assert.ok(domain.onDeactivate);
      assert.ok(domain.onDestroy);
    });
  });

  describe('Activation', () => {
    it('should activate successfully', async () => {
      await domain.activate();

      assert.strictEqual(domain.isActive, true);
    });

    it('should initialize services with correct parameters', async () => {
      await domain.activate();

      const appConfig = domain.getAppConfiguration();
      assert.ok(appConfig);
      assert.strictEqual(appConfig.configPath, '/mock/userData');

      const stateManager = domain.getStateManager();
      assert.ok(stateManager);
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
    it('should throw error when accessing services before activation', () => {
      const inactiveDomain = new ConfigurationDomain(
        'test',
        { id: 'test', name: 'Test', version: '1.0.0' },
        api
      );

      assert.throws(
        () => inactiveDomain.getAppConfiguration(),
        /not initialized/
      );

      assert.throws(
        () => inactiveDomain.getStateManager(),
        /not initialized/
      );
    });
  });

  describe('Configuration Management', () => {
    beforeEach(async () => {
      await domain.activate();
    });

    it('should manage configuration get operations', () => {
      const appConfig = domain.getAppConfiguration();
      appConfig.settingsStore.set('theme', 'dark');
      appConfig.legacyConfigStore.set('oldSetting', 'value');

      const theme = domain.getConfig('settings.theme', 'light');
      assert.strictEqual(theme, 'dark');

      const oldValue = domain.getConfig('oldSetting', 'default');
      assert.strictEqual(oldValue, 'value');

      const defaultValue = domain.getConfig('settings.nonexistent', 'default');
      assert.strictEqual(defaultValue, 'default');
    });

    it('should manage configuration set operations', () => {
      mockEventBus._reset();

      domain.setConfig('settings.language', 'en');

      const appConfig = domain.getAppConfiguration();
      const language = appConfig.settingsStore.get('language');
      assert.strictEqual(language, 'en');

      const changedEvents = mockEventBus._emitted.filter(
        e => e.event === 'configuration.changed'
      );
      assert.strictEqual(changedEvents.length, 1);
      assert.strictEqual(changedEvents[0].data.keyPath, 'settings.language');
      assert.strictEqual(changedEvents[0].data.value, 'en');
    });
  });

  describe('State Management', () => {
    beforeEach(async () => {
      await domain.activate();
    });

    it('should get state snapshot', () => {
      const snapshot = domain.getStateSnapshot();

      assert.strictEqual(snapshot.userStatus, -1);
      assert.strictEqual(snapshot.idleTimeUserStatus, -1);
      assert.strictEqual(snapshot.screenSharingActive, false);
      assert.strictEqual(snapshot.currentScreenShareSourceId, null);
    });

    it('should restore state from snapshot', () => {
      const newSnapshot = {
        userStatus: 2,
        idleTimeUserStatus: -1,
        screenSharingActive: true,
        currentScreenShareSourceId: 'screen-1',
        customState: { key: 'value' }
      };

      domain.restoreStateSnapshot(newSnapshot);

      const stateManager = domain.getStateManager();
      const restoredSnapshot = stateManager.getSnapshot();

      assert.strictEqual(restoredSnapshot.userStatus, 2);
      assert.strictEqual(restoredSnapshot.screenSharingActive, true);
      assert.strictEqual(restoredSnapshot.currentScreenShareSourceId, 'screen-1');
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
  });

  describe('Statistics', () => {
    it('should return statistics for active and inactive states', async () => {
      const statsBeforeActivation = domain.getStats();
      assert.strictEqual(statsBeforeActivation.healthy, false);
      assert.strictEqual(statsBeforeActivation.services.appConfiguration, false);
      assert.strictEqual(statsBeforeActivation.services.stateManager, false);

      await domain.activate();

      const statsAfterActivation = domain.getStats();
      assert.strictEqual(statsAfterActivation.healthy, true);
      assert.strictEqual(statsAfterActivation.services.appConfiguration, true);
      assert.strictEqual(statsAfterActivation.services.stateManager, true);
      assert.strictEqual(statsAfterActivation.config.configPath, '/mock/userData');
      assert.ok(statsAfterActivation.state);
      assert.strictEqual(statsAfterActivation.state.userStatus, -1);
    });
  });

  describe('Deactivation', () => {
    beforeEach(async () => {
      await domain.activate();
    });

    it('should deactivate successfully and save state', async () => {
      const stateManager = domain.getStateManager();
      stateManager._snapshot.userStatus = 2;

      await domain.deactivate();

      assert.strictEqual(domain.isActive, false);

      const appConfig = domain.getAppConfiguration();
      const savedStatus = appConfig.settingsStore.get('lastUserStatus');
      assert.strictEqual(savedStatus, 2);
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

    it('should cleanup resources and reset state', async () => {
      const stateManager = domain.getStateManager();
      stateManager._snapshot.userStatus = 2;

      await domain.destroy();

      assert.strictEqual(domain.isActive, false);

      const snapshot = stateManager.getSnapshot();
      assert.strictEqual(snapshot.userStatus, -1);

      const services = domain.getServices();
      assert.strictEqual(services.appConfiguration, null);
      assert.strictEqual(services.stateManager, null);
    });
  });

  describe('Edge Cases', () => {
    it('should handle activation errors gracefully', async () => {
      // Create a domain with broken manifest
      const brokenDomain = new ConfigurationDomain(
        'broken',
        { id: 'broken', name: 'Broken', version: '1.0.0' },
        api
      );

      // Mock electron to throw error
      const originalApp = require.cache[require.resolve('electron')].exports.app;
      require.cache[require.resolve('electron')].exports.app = {
        getPath: () => { throw new Error('Test error'); },
        getVersion: () => '1.0.0'
      };

      await assert.rejects(
        async () => await brokenDomain.activate(),
        /Test error/
      );

      // Restore
      require.cache[require.resolve('electron')].exports.app = originalApp;
    });

    it('should handle missing infrastructure domain gracefully', async () => {
      // API without infrastructure domain
      const isolatedApi = new MockPluginAPI();
      const isolatedDomain = new ConfigurationDomain(
        'isolated',
        { id: 'isolated', name: 'Isolated', version: '1.0.0' },
        isolatedApi
      );

      // Should activate without infrastructure domain (uses console)
      await assert.doesNotReject(async () => {
        await isolatedDomain.activate();
      });

      assert.strictEqual(isolatedDomain.isActive, true);
    });
  });
});
