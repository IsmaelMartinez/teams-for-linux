const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

// Mock EventBus
const mockEventBus = {
  _emitted: [],
  getInstance: () => mockEventBus,
  emit: function(event, data) {
    this._emitted.push({ event, data });
  },
  _reset() {
    this._emitted = [];
  }
};

// Setup mocks
const path = require('path');
const projectRoot = path.resolve(__dirname, '../../../..');
const eventBusPath = path.join(projectRoot, 'app/core/EventBus.js');
require.cache[eventBusPath] = {
  exports: mockEventBus
};

const StateManager = require(path.join(projectRoot, 'app/domains/configuration/StateManager'));

describe('StateManager', () => {
  let stateManager;

  beforeEach(() => {
    mockEventBus._reset();
    stateManager = new StateManager();
  });

  describe('Constructor', () => {
    it('should initialize with default state values', () => {
      assert.strictEqual(stateManager.getUserStatus(), -1);
      assert.strictEqual(stateManager.getIdleTimeUserStatus(), -1);
      assert.strictEqual(stateManager.isScreenSharingActive(), false);
      assert.strictEqual(stateManager.getCurrentScreenShareSourceId(), null);
    });
  });

  describe('User Status Management', () => {
    it('should get user status', () => {
      const status = stateManager.getUserStatus();
      assert.strictEqual(status, -1);
    });

    it('should set user status and emit event', () => {
      stateManager.setUserStatus(2);
      assert.strictEqual(stateManager.getUserStatus(), 2);

      const events = mockEventBus._emitted.filter(e => e.event === 'state.user.statusChanged');
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].data.newStatus, 2);
    });
  });

  describe('Idle Time User Status Management', () => {
    it('should get idle time user status', () => {
      const status = stateManager.getIdleTimeUserStatus();
      assert.strictEqual(status, -1);
    });

    it('should set idle time user status and emit event', () => {
      stateManager.setIdleTimeUserStatus(2);
      assert.strictEqual(stateManager.getIdleTimeUserStatus(), 2);

      const events = mockEventBus._emitted.filter(e => e.event === 'state.user.idleStatusChanged');
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].data.newStatus, 2);
    });
  });

  describe('Screen Sharing State Management', () => {
    it('should get screen sharing active state', () => {
      assert.strictEqual(stateManager.isScreenSharingActive(), false);
    });

    it('should set screen sharing active state', () => {
      stateManager.setScreenSharingActive(true);
      assert.strictEqual(stateManager.isScreenSharingActive(), true);
    });

    it('should get screen share source ID', () => {
      assert.strictEqual(stateManager.getCurrentScreenShareSourceId(), null);
    });

    it('should set screen share source ID', () => {
      stateManager.setCurrentScreenShareSourceId('screen-123');
      assert.strictEqual(stateManager.getCurrentScreenShareSourceId(), 'screen-123');
    });

    it('should include sourceId in activeChanged event', () => {
      stateManager.setCurrentScreenShareSourceId('screen-789');
      mockEventBus._reset();

      stateManager.setScreenSharingActive(true);

      const events = mockEventBus._emitted.filter(e => e.event === 'state.screenshare.activeChanged');
      assert.strictEqual(events[0].data.sourceId, 'screen-789');
    });
  });

  describe('Custom State Management', () => {
    it('should get and set custom state value', () => {
      stateManager.setCustomState('theme', 'dark');
      const theme = stateManager.getCustomState('theme');
      assert.strictEqual(theme, 'dark');
    });

    it('should return default value when key not found', () => {
      const value = stateManager.getCustomState('missing', 'default');
      assert.strictEqual(value, 'default');
    });

    it('should update existing custom state value', () => {
      stateManager.setCustomState('count', 5);
      stateManager.setCustomState('count', 10);

      assert.strictEqual(stateManager.getCustomState('count'), 10);
    });

    it('should delete custom state value', () => {
      stateManager.setCustomState('temp', 'value');
      const deleted = stateManager.deleteCustomState('temp');

      assert.strictEqual(deleted, true);
      assert.strictEqual(stateManager.getCustomState('temp'), undefined);
    });

    it('should return false when deleting non-existent key', () => {
      const deleted = stateManager.deleteCustomState('nonexistent');
      assert.strictEqual(deleted, false);
    });

    it('should clear all custom state', () => {
      stateManager.setCustomState('key1', 'value1');
      stateManager.setCustomState('key2', 'value2');
      stateManager.setCustomState('key3', 'value3');

      stateManager.clearCustomState();

      assert.strictEqual(stateManager.getCustomState('key1'), undefined);
      assert.strictEqual(stateManager.getCustomState('key2'), undefined);
      assert.strictEqual(stateManager.getCustomState('key3'), undefined);
    });
  });

  describe('Snapshot & Restore', () => {
    it('should get complete state snapshot', () => {
      stateManager.setUserStatus(2);
      stateManager.setIdleTimeUserStatus(1);
      stateManager.setScreenSharingActive(true);
      stateManager.setCurrentScreenShareSourceId('screen-1');
      stateManager.setCustomState('theme', 'dark');

      const snapshot = stateManager.getSnapshot();

      assert.strictEqual(snapshot.userStatus, 2);
      assert.strictEqual(snapshot.idleTimeUserStatus, 1);
      assert.strictEqual(snapshot.screenSharingActive, true);
      assert.strictEqual(snapshot.currentScreenShareSourceId, 'screen-1');
      assert.deepStrictEqual(snapshot.customState, { theme: 'dark' });
    });

    it('should restore state from snapshot', () => {
      const snapshot = {
        userStatus: 3,
        idleTimeUserStatus: 2,
        screenSharingActive: false,
        currentScreenShareSourceId: 'screen-2',
        customState: { language: 'fr', theme: 'light' }
      };

      stateManager.restoreSnapshot(snapshot);

      assert.strictEqual(stateManager.getUserStatus(), 3);
      assert.strictEqual(stateManager.getIdleTimeUserStatus(), 2);
      assert.strictEqual(stateManager.isScreenSharingActive(), false);
      assert.strictEqual(stateManager.getCurrentScreenShareSourceId(), 'screen-2');
      assert.strictEqual(stateManager.getCustomState('language'), 'fr');
      assert.strictEqual(stateManager.getCustomState('theme'), 'light');
    });

    it('should handle partial snapshot restoration', () => {
      stateManager.setUserStatus(5);
      stateManager.setCustomState('key', 'value');

      const partialSnapshot = {
        userStatus: 1,
        screenSharingActive: true
      };

      stateManager.restoreSnapshot(partialSnapshot);

      assert.strictEqual(stateManager.getUserStatus(), 1);
      assert.strictEqual(stateManager.isScreenSharingActive(), true);
      assert.strictEqual(stateManager.getCustomState('key'), 'value');
    });

    it('should throw error for invalid snapshot', () => {
      assert.throws(() => {
        stateManager.restoreSnapshot(null);
      }, /Invalid snapshot/);

      assert.throws(() => {
        stateManager.restoreSnapshot('not an object');
      }, /Invalid snapshot/);
    });
  });

  describe('Reset', () => {
    it('should reset all state to defaults', () => {
      stateManager.setUserStatus(2);
      stateManager.setIdleTimeUserStatus(1);
      stateManager.setScreenSharingActive(true);
      stateManager.setCurrentScreenShareSourceId('screen-1');
      stateManager.setCustomState('key', 'value');

      stateManager.reset();

      assert.strictEqual(stateManager.getUserStatus(), -1);
      assert.strictEqual(stateManager.getIdleTimeUserStatus(), -1);
      assert.strictEqual(stateManager.isScreenSharingActive(), false);
      assert.strictEqual(stateManager.getCurrentScreenShareSourceId(), null);
      assert.strictEqual(stateManager.getCustomState('key'), undefined);
    });
  });

  describe('Statistics', () => {
    it('should return state statistics', () => {
      const stats = stateManager.getStats();

      assert.strictEqual(stats.userStatus, -1);
      assert.strictEqual(stats.idleTimeUserStatus, -1);
      assert.strictEqual(stats.screenSharingActive, false);
      assert.strictEqual(stats.hasScreenShareSource, false);
      assert.strictEqual(stats.customStateCount, 0);
    });

    it('should return accurate custom state count', () => {
      stateManager.setCustomState('a', 1);
      stateManager.setCustomState('b', 2);
      stateManager.setCustomState('c', 3);

      const stats = stateManager.getStats();
      assert.strictEqual(stats.customStateCount, 3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle setting same value multiple times', () => {
      stateManager.setUserStatus(2);
      stateManager.setUserStatus(2);
      stateManager.setUserStatus(2);

      // Should only emit one event (first change from -1 to 2)
      const events = mockEventBus._emitted.filter(e => e.event === 'state.user.statusChanged');
      assert.strictEqual(events.length, 1);
    });

    it('should handle complex custom state objects', () => {
      const complexState = {
        nested: { deeply: { value: 'test' } },
        array: [1, 2, 3],
        mixed: { a: [{ b: 'c' }] }
      };

      stateManager.setCustomState('complex', complexState);
      const retrieved = stateManager.getCustomState('complex');

      assert.deepStrictEqual(retrieved, complexState);
    });

    it('should handle setting source ID to null', () => {
      stateManager.setCurrentScreenShareSourceId('screen-1');
      stateManager.setCurrentScreenShareSourceId(null);

      assert.strictEqual(stateManager.getCurrentScreenShareSourceId(), null);
    });
  });
});
