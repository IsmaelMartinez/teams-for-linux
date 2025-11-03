/**
 * Tests for Notifications Plugin Preload Script
 */

const { expect } = require('chai');
const sinon = require('sinon');

describe('Notifications Plugin Preload', () => {
  let preloadModule;
  let ipcRendererStub;
  let windowStub;

  beforeEach(() => {
    // Mock ipcRenderer
    ipcRendererStub = {
      invoke: sinon.stub().resolves(),
      on: sinon.stub(),
      send: sinon.stub()
    };

    // Mock window
    windowStub = {
      dispatchEvent: sinon.stub()
    };

    // Mock require for electron
    const Module = require('module');
    const originalRequire = Module.prototype.require;
    Module.prototype.require = function (id) {
      if (id === 'electron') {
        return { ipcRenderer: ipcRendererStub };
      }
      return originalRequire.apply(this, arguments);
    };

    // Mock global objects
    global.window = windowStub;
    global.globalThis = {};

    // Load preload module
    delete require.cache[require.resolve('../../../../app/plugins/core/notifications/preload.js')];
    preloadModule = require('../../../../app/plugins/core/notifications/preload.js');

    // Restore require
    Module.prototype.require = originalRequire;
  });

  afterEach(() => {
    sinon.restore();
    delete global.window;
    delete global.globalThis;
  });

  describe('API Exposure', () => {
    it('should expose teamsNotifications on window', () => {
      expect(window.teamsNotifications).to.exist;
      expect(window.teamsNotifications).to.equal(preloadModule);
    });

    it('should expose teamsNotifications on globalThis', () => {
      expect(globalThis.teamsNotifications).to.exist;
      expect(globalThis.teamsNotifications).to.equal(preloadModule);
    });

    it('should have all required methods', () => {
      expect(preloadModule.show).to.be.a('function');
      expect(preloadModule.requestPermission).to.be.a('function');
      expect(preloadModule.getPermission).to.be.a('function');
      expect(preloadModule.clearAll).to.be.a('function');
      expect(preloadModule.setBadgeCount).to.be.a('function');
      expect(preloadModule.getBadgeCount).to.be.a('function');
      expect(preloadModule.setSoundEnabled).to.be.a('function');
      expect(preloadModule.getActiveCount).to.be.a('function');
      expect(preloadModule.onShown).to.be.a('function');
      expect(preloadModule.onClicked).to.be.a('function');
      expect(preloadModule.onClosed).to.be.a('function');
      expect(preloadModule.onFailed).to.be.a('function');
      expect(preloadModule.removeAllListeners).to.be.a('function');
    });
  });

  describe('show()', () => {
    it('should validate notification options', async () => {
      await expect(preloadModule.show(null))
        .to.be.rejectedWith('Invalid notification options');

      await expect(preloadModule.show({}))
        .to.be.rejectedWith('Invalid notification options');

      await expect(preloadModule.show({ body: 'test' }))
        .to.be.rejectedWith('Invalid notification options');
    });

    it('should sanitize and send valid notification', async () => {
      ipcRendererStub.invoke.resolves('notification-id-123');

      const notification = {
        title: 'Test Title',
        body: 'Test Body',
        icon: 'test-icon.png',
        tag: 'test-tag'
      };

      const result = await preloadModule.show(notification);

      expect(result).to.equal('notification-id-123');
      expect(ipcRendererStub.invoke).to.have.been.calledOnce;
      expect(ipcRendererStub.invoke).to.have.been.calledWith(
        'plugin:notification:show',
        sinon.match({
          title: 'Test Title',
          body: 'Test Body',
          icon: 'test-icon.png',
          tag: 'test-tag'
        })
      );
    });

    it('should truncate long strings', async () => {
      ipcRendererStub.invoke.resolves('notification-id-123');

      const longTitle = 'a'.repeat(600);
      const longBody = 'b'.repeat(2500);

      await preloadModule.show({
        title: longTitle,
        body: longBody
      });

      const invokeCall = ipcRendererStub.invoke.firstCall.args[1];
      expect(invokeCall.title).to.have.length(500);
      expect(invokeCall.body).to.have.length(2000);
    });

    it('should sanitize urgency field', async () => {
      ipcRendererStub.invoke.resolves('notification-id-123');

      await preloadModule.show({
        title: 'Test',
        urgency: 'critical'
      });

      const invokeCall = ipcRendererStub.invoke.firstCall.args[1];
      expect(invokeCall.urgency).to.equal('critical');
    });

    it('should reject invalid urgency values', async () => {
      ipcRendererStub.invoke.resolves('notification-id-123');

      await preloadModule.show({
        title: 'Test',
        urgency: 'invalid'
      });

      const invokeCall = ipcRendererStub.invoke.firstCall.args[1];
      expect(invokeCall.urgency).to.be.undefined;
    });

    it('should handle data payload', async () => {
      ipcRendererStub.invoke.resolves('notification-id-123');

      const data = { userId: 123, action: 'reply' };

      await preloadModule.show({
        title: 'Test',
        data
      });

      const invokeCall = ipcRendererStub.invoke.firstCall.args[1];
      expect(invokeCall.data).to.deep.equal(data);
    });

    it('should reject non-serializable data', async () => {
      ipcRendererStub.invoke.resolves('notification-id-123');

      const circular = {};
      circular.self = circular;

      await preloadModule.show({
        title: 'Test',
        data: circular
      });

      const invokeCall = ipcRendererStub.invoke.firstCall.args[1];
      expect(invokeCall.data).to.be.undefined;
    });
  });

  describe('setBadgeCount()', () => {
    it('should validate badge count', async () => {
      await expect(preloadModule.setBadgeCount(-1))
        .to.be.rejectedWith('Invalid badge count');

      await expect(preloadModule.setBadgeCount(10000))
        .to.be.rejectedWith('Invalid badge count');

      await expect(preloadModule.setBadgeCount('invalid'))
        .to.be.rejectedWith('Invalid badge count');
    });

    it('should send valid badge count', async () => {
      ipcRendererStub.invoke.resolves();

      await preloadModule.setBadgeCount(5);

      expect(ipcRendererStub.invoke).to.have.been.calledWith(
        'plugin:notification:set-badge-count',
        5
      );
    });
  });

  describe('Event Handlers', () => {
    it('should register onShown handler', () => {
      const callback = sinon.stub();
      const unsubscribe = preloadModule.onShown(callback);

      expect(unsubscribe).to.be.a('function');
    });

    it('should register onClicked handler', () => {
      const callback = sinon.stub();
      const unsubscribe = preloadModule.onClicked(callback);

      expect(unsubscribe).to.be.a('function');
    });

    it('should register onClosed handler', () => {
      const callback = sinon.stub();
      const unsubscribe = preloadModule.onClosed(callback);

      expect(unsubscribe).to.be.a('function');
    });

    it('should register onFailed handler', () => {
      const callback = sinon.stub();
      const unsubscribe = preloadModule.onFailed(callback);

      expect(unsubscribe).to.be.a('function');
    });

    it('should throw error for non-function callbacks', () => {
      expect(() => preloadModule.onShown('not a function'))
        .to.throw('Callback must be a function');
    });

    it('should unsubscribe handler', () => {
      const callback1 = sinon.stub();
      const callback2 = sinon.stub();

      const unsubscribe1 = preloadModule.onShown(callback1);
      preloadModule.onShown(callback2);

      unsubscribe1();

      // Trigger event (would need to simulate ipcRenderer event)
      // For now, just verify unsubscribe doesn't throw
      expect(() => unsubscribe1()).to.not.throw();
    });

    it('should remove all listeners', () => {
      const callback = sinon.stub();
      preloadModule.onShown(callback);
      preloadModule.onClicked(callback);
      preloadModule.onClosed(callback);
      preloadModule.onFailed(callback);

      preloadModule.removeAllListeners();

      // Verify listeners are cleared (internal check)
      // This would require exposing internal state or testing behavior
      expect(() => preloadModule.removeAllListeners()).to.not.throw();
    });
  });

  describe('Permission Methods', () => {
    it('should request permission', async () => {
      ipcRendererStub.invoke.resolves('granted');

      const result = await preloadModule.requestPermission();

      expect(result).to.equal('granted');
      expect(ipcRendererStub.invoke).to.have.been.calledWith(
        'plugin:notification:request-permission'
      );
    });

    it('should get permission', async () => {
      ipcRendererStub.invoke.resolves('granted');

      const result = await preloadModule.getPermission();

      expect(result).to.equal('granted');
      expect(ipcRendererStub.invoke).to.have.been.calledWith(
        'plugin:notification:get-permission'
      );
    });
  });

  describe('Utility Methods', () => {
    it('should clear all notifications', async () => {
      ipcRendererStub.invoke.resolves();

      await preloadModule.clearAll();

      expect(ipcRendererStub.invoke).to.have.been.calledWith(
        'plugin:notification:clear-all'
      );
    });

    it('should get badge count', async () => {
      ipcRendererStub.invoke.resolves(5);

      const count = await preloadModule.getBadgeCount();

      expect(count).to.equal(5);
      expect(ipcRendererStub.invoke).to.have.been.calledWith(
        'plugin:notification:get-badge-count'
      );
    });

    it('should set sound enabled', async () => {
      ipcRendererStub.invoke.resolves();

      await preloadModule.setSoundEnabled(true);

      expect(ipcRendererStub.invoke).to.have.been.calledWith(
        'plugin:notification:set-sound-enabled',
        true
      );
    });

    it('should get active count', async () => {
      ipcRendererStub.invoke.resolves(3);

      const count = await preloadModule.getActiveCount();

      expect(count).to.equal(3);
      expect(ipcRendererStub.invoke).to.have.been.calledWith(
        'plugin:notification:get-active-count'
      );
    });
  });
});
