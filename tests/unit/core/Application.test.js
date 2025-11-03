const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const Application = require('../../../app/core/Application');
const EventBus = require('../../../app/core/EventBus');

describe('Application', () => {
  let app;
  let mockConfig;
  let mockLogger;

  beforeEach(() => {
    EventBus.resetInstance();
    mockConfig = {
      get: (key) => `value-${key}`,
      set: () => {}
    };
    mockLogger = {
      info: () => {},
      error: () => {}
    };
    app = new Application(mockConfig, mockLogger);
  });

  afterEach(() => {
    EventBus.resetInstance();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await app.init();
      assert.strictEqual(app.isInitialized, true);
    });

    it('should throw if already initialized', async () => {
      await app.init();
      await assert.rejects(
        app.init(),
        /already initialized/
      );
    });

    it('should create plugin manager', async () => {
      await app.init();
      assert.ok(app.pluginManager);
    });

    it('should emit initialization event', async () => {
      let eventEmitted = false;
      const eventBus = EventBus.getInstance();
      eventBus.on('app.initialized', () => { eventEmitted = true; });
      await app.init();
      assert.strictEqual(eventEmitted, true);
    });

    it('should expose event bus', async () => {
      await app.init();
      assert.ok(app.eventBus);
    });
  });

  describe('Start', () => {
    beforeEach(async () => {
      await app.init();
    });

    it('should start successfully', async () => {
      await app.start();
      assert.strictEqual(app.isStarted, true);
    });

    it('should throw if not initialized', async () => {
      const uninitializedApp = new Application(mockConfig, mockLogger);
      await assert.rejects(
        uninitializedApp.start(),
        /not initialized/
      );
    });

    it('should throw if already started', async () => {
      await app.start();
      await assert.rejects(
        app.start(),
        /already started/
      );
    });

    it('should emit starting event', async () => {
      let eventEmitted = false;
      const eventBus = EventBus.getInstance();
      eventBus.on('app.starting', () => { eventEmitted = true; });
      await app.start();
      assert.strictEqual(eventEmitted, true);
    });

    it('should emit started event', async () => {
      let eventEmitted = false;
      const eventBus = EventBus.getInstance();
      eventBus.on('app.started', () => { eventEmitted = true; });
      await app.start();
      assert.strictEqual(eventEmitted, true);
    });
  });

  describe('Shutdown', () => {
    it('should do nothing if not started', async () => {
      await app.init();
      await assert.doesNotReject(app.shutdown());
    });

    it('should shutdown successfully', async () => {
      await app.init();
      await app.start();
      await app.shutdown();
      assert.strictEqual(app.isStarted, false);
    });

    it('should emit shutdown events', async () => {
      await app.init();
      await app.start();

      let shuttingDownEmitted = false;
      let shutdownEmitted = false;
      const eventBus = EventBus.getInstance();

      eventBus.on('app.shutting_down', () => { shuttingDownEmitted = true; });
      eventBus.on('app.shutdown', () => { shutdownEmitted = true; });

      await app.shutdown();

      assert.strictEqual(shuttingDownEmitted, true);
      assert.strictEqual(shutdownEmitted, true);
    });
  });

  describe('Properties', () => {
    it('should report initialized status', async () => {
      assert.strictEqual(app.isInitialized, false);
      await app.init();
      assert.strictEqual(app.isInitialized, true);
    });

    it('should report started status', async () => {
      await app.init();
      assert.strictEqual(app.isStarted, false);
      await app.start();
      assert.strictEqual(app.isStarted, true);
    });
  });
});
