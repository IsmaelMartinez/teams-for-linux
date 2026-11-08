'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

// ADR-020 Phase 2: clicking a custom in-app toast brings forward the profile
// whose renderer raised it.

const electronPath = require.resolve('electron');
const toastPath = require.resolve('../../app/notificationSystem/NotificationToast');
const managerPath = require.resolve('../../app/notificationSystem');

let handlers;
let toasts;

class FakeToast {
  constructor() {
    this.webContents = { id: toasts.length + 100 };
    this.closed = false;
    toasts.push(this);
  }
  show() {}
  close() {
    this.closed = true;
  }
  getWebContents() {
    return this.webContents;
  }
}

function load() {
  handlers = new Map();
  toasts = [];
  require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: { ipcMain: { on: (channel, fn) => handlers.set(channel, fn) } },
  };
  require.cache[toastPath] = {
    id: toastPath,
    filename: toastPath,
    loaded: true,
    exports: FakeToast,
  };
  delete require.cache[managerPath];
  return require(managerPath);
}

describe('CustomNotificationManager profile activation', () => {
  let originalDebug;
  let originalInfo;

  beforeEach(() => {
    originalDebug = console.debug;
    originalInfo = console.info;
    console.debug = () => {};
    console.info = () => {};
  });

  afterEach(() => {
    console.debug = originalDebug;
    console.info = originalInfo;
    delete require.cache[electronPath];
    delete require.cache[toastPath];
    delete require.cache[managerPath];
  });

  it('activates the raising renderer, closes the toast, then shows the window', () => {
    const CustomNotificationManager = load();
    const actions = [];
    const mainWindow = {
      isDestroyed: () => false,
      show: () => actions.push('show'),
      focus: () => actions.push('focus'),
    };
    const manager = new CustomNotificationManager({}, mainWindow);
    manager.setProfileActivator((origin) => actions.push(`activate:${origin.id}`));
    manager.initialize();

    const raisingView = { id: 7 };
    handlers.get('notification-show-toast')({ sender: raisingView }, { title: 'Hi' });
    handlers.get('notification-toast-click')({ sender: toasts[0].webContents });

    assert.strictEqual(toasts[0].closed, true);
    assert.deepStrictEqual(actions, ['activate:7', 'show', 'focus']);
  });

  it('without an activator (multi-account off) only closes and focuses', () => {
    const CustomNotificationManager = load();
    const actions = [];
    const manager = new CustomNotificationManager({}, {
      isDestroyed: () => false,
      show: () => actions.push('show'),
      focus: () => actions.push('focus'),
    });
    manager.initialize();
    handlers.get('notification-show-toast')({ sender: { id: 7 } }, { title: 'Hi' });
    handlers.get('notification-toast-click')({ sender: toasts[0].webContents });
    assert.deepStrictEqual(actions, ['show', 'focus']);
  });
});
