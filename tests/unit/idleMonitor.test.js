'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

const electronPath = require.resolve('electron');
const idleMonitorPath = require.resolve('../../app/idle/monitor');

// Controls for the electron mock, mutated per-test.
let registeredHandlers;
let systemIdleState;
let systemIdleTime;

function installElectronMock() {
  registeredHandlers = {};
  systemIdleState = 'active';
  systemIdleTime = 0;

  require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: {
      ipcMain: {
        handle: (channel, handler) => {
          registeredHandlers[channel] = handler;
        },
      },
      powerMonitor: {
        getSystemIdleState: () => systemIdleState,
        getSystemIdleTime: () => systemIdleTime,
      },
    },
  };
}

function restoreElectronMock() {
  delete require.cache[electronPath];
  delete require.cache[idleMonitorPath];
}

function loadFreshIdleMonitor() {
  delete require.cache[idleMonitorPath];
  return require(idleMonitorPath);
}

const baseConfig = {
  appIdleTimeout: 300,
  appIdleTimeoutCheckInterval: 10,
  appActiveCheckInterval: 2,
};

describe('IdleMonitor - system idle state handling', () => {
  let handler;
  let userStatus;

  beforeEach(() => {
    installElectronMock();
    const IdleMonitor = loadFreshIdleMonitor();
    userStatus = -1;
    const monitor = new IdleMonitor(baseConfig, () => userStatus);
    monitor.initialize();
    handler = registeredHandlers['get-system-idle-state'];
  });

  afterEach(() => {
    restoreElectronMock();
  });

  it('registers the get-system-idle-state IPC handler on initialize', () => {
    assert.strictEqual(typeof handler, 'function');
  });

  it('reports userCurrent from the injected status while active', async () => {
    userStatus = 1; // Available
    systemIdleState = 'active';

    const result = await handler();

    assert.strictEqual(result.system, 'active');
    assert.strictEqual(result.userIdle, -1);
    assert.strictEqual(result.userCurrent, 1);
  });

  it('captures the user status at the moment of transition to idle', async () => {
    userStatus = 1; // Available when the machine goes idle
    systemIdleState = 'idle';

    const result = await handler();

    assert.strictEqual(result.system, 'idle');
    // userIdle is the status snapshot taken when idle began; the renderer
    // uses userCurrent === 1 to decide whether to push the user to Away.
    assert.strictEqual(result.userIdle, 1);
    assert.strictEqual(result.userCurrent, 1);
  });

  it('resets the idle snapshot when the machine becomes active again', async () => {
    userStatus = 1;

    systemIdleState = 'idle';
    await handler();

    systemIdleState = 'active';
    const result = await handler();

    assert.strictEqual(result.system, 'active');
    assert.strictEqual(result.userIdle, -1);
    assert.strictEqual(result.userCurrent, 1);
  });

  // Regression guard for #2383: when the wrapper never learns the user's
  // Teams status, userStatus stays at its -1 sentinel, so userCurrent is -1
  // on idle and the renderer's Away branch (which requires userCurrent === 1)
  // never fires. This pins the observable gap rather than asserting it is
  // correct behaviour.
  it('reports userCurrent as -1 on idle when the status was never learned', async () => {
    userStatus = -1; // never learned (no MQTT, no status change observed)
    systemIdleState = 'idle';

    const result = await handler();

    assert.strictEqual(result.system, 'idle');
    assert.strictEqual(result.userIdle, -1);
    assert.strictEqual(result.userCurrent, -1);
  });
});
