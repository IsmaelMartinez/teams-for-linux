'use strict';

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');

const electronPath = require.resolve('electron');
const toastPath = require.resolve('../../app/notificationSystem/NotificationToast');
const positionerPath = require.resolve('../../app/utils/windowPositioner');

// NotificationToast.show() waits for the page's 'notification-toast-ready'
// ack (sent once the init style is applied) before showing the window, and
// shows it anyway after COLD_READY_TIMEOUT_MS until any toast page has acked
// in this process, then after READY_TIMEOUT_MS. The module is re-required for
// each test, so every test starts cold.

let windows;

class FakeBrowserWindow {
  constructor(options) {
    this.options = options;
    this.shown = 0;
    this.closed = false;
    this.handlers = {};
    this.readyHandler = null;
    this.webContents = {
      once: () => {},
      send: () => {},
      ipc: {
        once: (channel, handler) => {
          if (channel === 'notification-toast-ready') this.readyHandler = handler;
        },
      },
    };
    windows.push(this);
  }
  loadFile() {}
  on(event, handler) {
    this.handlers[event] = handler;
  }
  getBounds() {
    return { x: 0, y: 0, width: this.options.width, height: this.options.height };
  }
  setPosition() {}
  show() {
    this.shown += 1;
  }
  close() {
    this.closed = true;
    this.handlers.closed?.();
  }
  isDestroyed() {
    return this.closed;
  }
  ready() {
    this.readyHandler();
  }
}

let NotificationToast;
const options = { width: 360, height: 110, position: 'bottomRight', margin: 0, toastDuration: 5000, style: {} };

beforeEach(() => {
  windows = [];
  mock.timers.enable({ apis: ['setTimeout'] });
  mock.method(console, 'warn', () => {});
  require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: {
      BrowserWindow: FakeBrowserWindow,
      screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) },
    },
  };
  delete require.cache[positionerPath];
  delete require.cache[toastPath];
  NotificationToast = require(toastPath);
});

afterEach(() => {
  mock.timers.reset();
  mock.restoreAll();
  delete require.cache[toastPath];
  delete require.cache[positionerPath];
  delete require.cache[electronPath];
});

describe('NotificationToast.show', () => {
  it('waits for the page to be ready before showing', () => {
    const toast = new NotificationToast({ title: 't' }, options);
    toast.show();
    assert.strictEqual(windows[0].shown, 0);
    mock.timers.tick(50);
    windows[0].ready();
    assert.strictEqual(windows[0].shown, 1);
    mock.timers.tick(NotificationToast.COLD_READY_TIMEOUT_MS);
    assert.strictEqual(windows[0].shown, 1, 'the fallback must not show it again');
    assert.strictEqual(console.warn.mock.callCount(), 0);
  });

  it('shows straight away when the page was ready first', () => {
    const toast = new NotificationToast({ title: 't' }, options);
    windows[0].ready();
    assert.strictEqual(windows[0].shown, 0, 'ready alone does not show the toast');
    toast.show();
    assert.strictEqual(windows[0].shown, 1);
  });

  it('waits longer on a cold start, before any toast page has acked', () => {
    const toast = new NotificationToast({ title: 't' }, options);
    toast.show();
    mock.timers.tick(NotificationToast.READY_TIMEOUT_MS);
    assert.strictEqual(windows[0].shown, 0);
    mock.timers.tick(NotificationToast.COLD_READY_TIMEOUT_MS - NotificationToast.READY_TIMEOUT_MS - 1);
    assert.strictEqual(windows[0].shown, 0);
    mock.timers.tick(1);
    assert.strictEqual(windows[0].shown, 1);
  });

  it('stays cold while toasts time out without acking', () => {
    new NotificationToast({ title: 'a' }, options).show();
    mock.timers.tick(NotificationToast.COLD_READY_TIMEOUT_MS);
    new NotificationToast({ title: 'b' }, options).show();
    mock.timers.tick(NotificationToast.COLD_READY_TIMEOUT_MS - 1);
    assert.strictEqual(windows[1].shown, 0);
    mock.timers.tick(1);
    assert.strictEqual(windows[1].shown, 1);
  });

  it('shows anyway when the page is not ready in time once warm', () => {
    const first = new NotificationToast({ title: 'first' }, options);
    windows[0].ready();
    first.show();
    const toast = new NotificationToast({ title: 't' }, options);
    toast.show();
    mock.timers.tick(NotificationToast.READY_TIMEOUT_MS - 1);
    assert.strictEqual(windows[1].shown, 0);
    mock.timers.tick(1);
    assert.strictEqual(windows[1].shown, 1);
    assert.strictEqual(console.warn.mock.callCount(), 1);
    windows[1].ready();
    assert.strictEqual(windows[1].shown, 1, 'a late ack must not show it again');
  });

  it('counts the display duration from when the toast appears', () => {
    const toast = new NotificationToast({ title: 't' }, options);
    toast.show();
    mock.timers.tick(150);
    windows[0].ready();
    mock.timers.tick(options.toastDuration - 1);
    assert.strictEqual(windows[0].closed, false);
    mock.timers.tick(1);
    assert.strictEqual(windows[0].closed, true);
  });

  it('never shows a toast closed before it was ready', () => {
    const toast = new NotificationToast({ title: 't' }, options);
    toast.show();
    toast.close();
    mock.timers.tick(NotificationToast.COLD_READY_TIMEOUT_MS);
    assert.strictEqual(windows[0].shown, 0);
    assert.strictEqual(console.warn.mock.callCount(), 0);
  });
});
