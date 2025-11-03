const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const EventBus = require('../../../app/core/EventBus');

describe('EventBus', () => {
  let eventBus;

  beforeEach(() => {
    EventBus.resetInstance();
    eventBus = EventBus.getInstance();
  });

  afterEach(() => {
    EventBus.resetInstance();
  });

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const instance1 = EventBus.getInstance();
      const instance2 = EventBus.getInstance();
      assert.strictEqual(instance1, instance2);
    });

    it('should reset instance', () => {
      const instance1 = EventBus.getInstance();
      EventBus.resetInstance();
      const instance2 = EventBus.getInstance();
      assert.notStrictEqual(instance1, instance2);
    });
  });

  describe('Event Subscription', () => {
    it('should subscribe to events', () => {
      let called = false;
      eventBus.on('test', () => { called = true; });
      eventBus.emit('test');
      assert.strictEqual(called, true);
    });

    it('should throw error for non-function handler', () => {
      assert.throws(() => {
        eventBus.on('test', 'not a function');
      }, TypeError);
    });

    it('should pass data to handler', () => {
      let receivedData;
      eventBus.on('test', (data) => { receivedData = data; });
      eventBus.emit('test', { foo: 'bar' });
      assert.deepStrictEqual(receivedData, { foo: 'bar' });
    });

    it('should support multiple handlers', () => {
      let count = 0;
      eventBus.on('test', () => count++);
      eventBus.on('test', () => count++);
      eventBus.emit('test');
      assert.strictEqual(count, 2);
    });

    it('should return unsubscribe function', () => {
      let called = false;
      const unsubscribe = eventBus.on('test', () => { called = true; });
      unsubscribe();
      eventBus.emit('test');
      assert.strictEqual(called, false);
    });
  });

  describe('Event Unsubscription', () => {
    it('should unsubscribe specific handler', () => {
      let count = 0;
      const handler1 = () => count++;
      const handler2 = () => count++;
      eventBus.on('test', handler1);
      eventBus.on('test', handler2);
      eventBus.off('test', handler1);
      eventBus.emit('test');
      assert.strictEqual(count, 1);
    });

    it('should unsubscribe all handlers if no handler provided', () => {
      let count = 0;
      eventBus.on('test', () => count++);
      eventBus.on('test', () => count++);
      eventBus.off('test');
      eventBus.emit('test');
      assert.strictEqual(count, 0);
    });

    it('should handle unsubscribing non-existent event', () => {
      assert.doesNotThrow(() => {
        eventBus.off('nonexistent');
      });
    });
  });

  describe('Namespaced Events', () => {
    it('should support wildcard listeners', () => {
      let count = 0;
      eventBus.on('shell.*', () => count++);
      eventBus.emit('shell.window.created');
      eventBus.emit('shell.window.closed');
      assert.strictEqual(count, 2);
    });

    it('should trigger both direct and wildcard listeners', () => {
      let directCalled = false;
      let wildcardCalled = false;
      eventBus.on('shell.window.created', () => { directCalled = true; });
      eventBus.on('shell.*', () => { wildcardCalled = true; });
      eventBus.emit('shell.window.created');
      assert.strictEqual(directCalled, true);
      assert.strictEqual(wildcardCalled, true);
    });
  });

  describe('Event History', () => {
    it('should record event history', () => {
      eventBus.emit('test1', { data: 1 });
      eventBus.emit('test2', { data: 2 });
      const history = eventBus.getHistory();
      assert.strictEqual(history.length, 2);
      assert.strictEqual(history[0].event, 'test1');
      assert.strictEqual(history[1].event, 'test2');
    });

    it('should limit history size', () => {
      for (let i = 0; i < 150; i++) {
        eventBus.emit(`test${i}`);
      }
      const history = eventBus.getHistory(200);
      assert.strictEqual(history.length, 100);
    });

    it('should include timestamp in history', () => {
      eventBus.emit('test');
      const history = eventBus.getHistory();
      assert.ok(history[0].timestamp);
      assert.ok(typeof history[0].timestamp === 'number');
    });
  });

  describe('Error Handling', () => {
    it('should catch errors in handlers', () => {
      let called = false;
      eventBus.on('test', () => { throw new Error('Handler error'); });
      eventBus.on('test', () => { called = true; });
      eventBus.emit('test');
      assert.strictEqual(called, true);
    });
  });

  describe('Listener Count', () => {
    it('should return correct listener count', () => {
      eventBus.on('test', () => {});
      eventBus.on('test', () => {});
      assert.strictEqual(eventBus.listenerCount('test'), 2);
    });

    it('should return 0 for events with no listeners', () => {
      assert.strictEqual(eventBus.listenerCount('nonexistent'), 0);
    });
  });

  describe('Clear', () => {
    it('should clear all listeners and history', () => {
      eventBus.on('test', () => {});
      eventBus.emit('test');
      eventBus.clear();
      assert.strictEqual(eventBus.listenerCount('test'), 0);
      assert.strictEqual(eventBus.getHistory().length, 0);
    });
  });
});
