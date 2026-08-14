'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const registry = require('../../app/concurrentAccounts/registry');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't4l-accounts-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('concurrent accounts registry', () => {
  it('loads an empty registry when the file is missing', () => {
    const data = registry.loadRegistry(tmpDir);
    assert.deepStrictEqual(data.accounts, []);
  });

  it('bootstraps home then adds extras up to the cap of 3', () => {
    const data = { accounts: [] };
    registry.ensureHome(data, tmpDir, { name: 'This account' });
    const second = registry.addAccount(data, {
      name: 'Work',
      homeUserDataDir: tmpDir,
    });
    const third = registry.addAccount(data, {
      name: 'Personal',
      homeUserDataDir: tmpDir,
    });
    assert.strictEqual(data.accounts.length, 3);
    assert.strictEqual(second.isHome, false);
    assert.ok(second.userDataDir.startsWith(`${tmpDir}-instances`));
    assert.strictEqual(third.name, 'Personal');
    assert.throws(
      () =>
        registry.addAccount(data, {
          name: 'Fourth',
          homeUserDataDir: tmpDir,
        }),
      /at most 3/i
    );
  });

  it('rejects a duplicate name', () => {
    const data = { accounts: [] };
    registry.ensureHome(data, tmpDir, { name: 'Work' });
    assert.throws(
      () =>
        registry.addAccount(data, { name: 'work', homeUserDataDir: tmpDir }),
      /already exists/i
    );
  });

  it('rejects removing home and unknown ids', () => {
    const data = { accounts: [] };
    registry.ensureHome(data, tmpDir);
    assert.throws(() => registry.removeAccount(data, registry.HOME_ID), /cannot be removed/i);
    assert.throws(() => registry.removeAccount(data, 'missing'), /unknown account/i);
  });

  it('round-trips through save and load', () => {
    const data = { accounts: [] };
    registry.ensureHome(data, tmpDir, { name: 'This account' });
    registry.addAccount(data, { name: 'Work', homeUserDataDir: tmpDir });
    registry.saveRegistry(tmpDir, data);
    const loaded = registry.loadRegistry(tmpDir);
    assert.strictEqual(loaded.accounts.length, 2);
    assert.strictEqual(loaded.accounts[0].id, registry.HOME_ID);
    assert.strictEqual(loaded.accounts[1].name, 'Work');
  });

  it('writes and reads a family marker', () => {
    const extra = path.join(tmpDir, 'extra');
    registry.writeFamilyMarker(extra, tmpDir);
    assert.strictEqual(registry.readFamilyMarker(extra), tmpDir);
  });

  it('pid helpers persist and treat a dead pid as not running', () => {
    registry.writePid(tmpDir, process.pid);
    assert.strictEqual(registry.readPid(tmpDir), process.pid);
    registry.writePid(tmpDir, 99999999);
    assert.strictEqual(registry.isAccountRunning(tmpDir), false);
    registry.clearPid(tmpDir);
    assert.strictEqual(registry.isAccountRunning(tmpDir), false);
  });

  it('slugify and class derivation stay stable and unique-ish', () => {
    assert.strictEqual(registry.slugify('Work Account'), 'work-account');
    const className = registry.deriveClass('Work', 'abcdefgh-1234');
    assert.ok(className.startsWith('teams-for-linux-work-abcdefgh'));
    assert.strictEqual(registry.deriveAppTitle('Work'), 'Microsoft Teams — Work');
  });
});
