'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const modulePath = path.join(__dirname, '../../app/utils/quitGuard.js');
const fresh = () => {
  delete require.cache[modulePath];
  return require(modulePath);
};

describe('quitGuard', () => {
  it('leaves beforeunload alone until a quit is requested', () => {
    const guard = fresh();
    let prevented = false;
    guard.allowUnloadWhenQuitting({ preventDefault: () => { prevented = true; } });
    assert.strictEqual(prevented, false);
  });

  it('lets pages unload once quitting', () => {
    const guard = fresh();
    guard.markQuitting();
    let prevented = false;
    guard.allowUnloadWhenQuitting({ preventDefault: () => { prevented = true; } });
    assert.strictEqual(prevented, true);
    assert.strictEqual(guard.isQuitting(), true);
  });

  it('install marks quitting on before-quit and hooks new webContents', () => {
    const guard = fresh();
    const handlers = {};
    guard.install({ on: (name, fn) => { handlers[name] = fn; } });
    const contentsHandlers = {};
    handlers['web-contents-created']({}, { on: (n, fn) => { contentsHandlers[n] = fn; } });
    assert.strictEqual(typeof contentsHandlers['will-prevent-unload'], 'function');
    handlers['before-quit']();
    assert.strictEqual(guard.isQuitting(), true);
  });
});
