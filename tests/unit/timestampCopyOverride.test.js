'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

const reactHandlerPath = require.resolve('../../app/browser/tools/reactHandler');
const toolPath = require.resolve('../../app/browser/tools/timestampCopyOverride');

// Mirrors MAX_APPLY_ATTEMPTS in the module under test
const MAX_APPLY_ATTEMPTS = 120;

let coreServices;
let warnMessages;
let originalWarn;
let originalDebug;
let tool;

function installReactHandlerStub() {
  require.cache[reactHandlerPath] = {
    id: reactHandlerPath,
    filename: reactHandlerPath,
    loaded: true,
    exports: {
      _getTeams2CoreServices: () => coreServices,
    },
  };
}

function loadTool() {
  delete require.cache[toolPath];
  return require(toolPath);
}

function makeCoreSettings(composeSettings) {
  return {
    get: () => ({ ...composeSettings }),
    getLatestSettingsForCategory: () => ({ ...composeSettings }),
    categoryBehaviorSubjectMap: new Map(),
  };
}

describe('timestampCopyOverride', () => {
  beforeEach(() => {
    coreServices = null;
    warnMessages = [];
    originalWarn = console.warn;
    originalDebug = console.debug;
    console.warn = (...args) => warnMessages.push(args.join(' '));
    console.debug = () => {};
    installReactHandlerStub();
  });

  afterEach(() => {
    tool?.stop();
    tool = undefined;
    console.warn = originalWarn;
    console.debug = originalDebug;
    delete require.cache[reactHandlerPath];
    delete require.cache[toolPath];
  });

  it('warns exactly once and clears the interval at the attempt cap', () => {
    tool = loadTool();
    tool.init({ disableTimestampOnCopy: true });

    for (let i = 0; i < MAX_APPLY_ATTEMPTS; i++) {
      tool.applyOverride();
    }

    assert.strictEqual(warnMessages.length, 1, 'give-up warn must fire exactly once');
    assert.match(warnMessages[0], /disableTimestampOnCopy/);
    assert.strictEqual(tool.overrideInterval, null, 'interval must be cleared at the cap');
  });

  it('resets the attempt counter after a successful pass', () => {
    tool = loadTool();
    tool.config = { disableTimestampOnCopy: true };

    for (let i = 0; i < MAX_APPLY_ATTEMPTS - 1; i++) {
      tool.applyOverride();
    }
    assert.strictEqual(warnMessages.length, 0);

    // A successful pass resets the budget (setting differs from config so
    // the override installs without stopping the poll)
    coreServices = {
      coreSettings: makeCoreSettings({ disableTimestampOnCopy: false }),
    };
    tool.applyOverride();
    assert.strictEqual(warnMessages.length, 0);

    // A full fresh run of consecutive misses is needed to hit the cap
    coreServices = null;
    for (let i = 0; i < MAX_APPLY_ATTEMPTS - 1; i++) {
      tool.applyOverride();
    }
    assert.strictEqual(warnMessages.length, 0, 'cap must count consecutive misses only');
    tool.applyOverride();
    assert.strictEqual(warnMessages.length, 1);
  });

  it('charges a throwing settings API against the budget instead of escaping', () => {
    tool = loadTool();
    tool.config = { disableTimestampOnCopy: true };
    coreServices = {
      coreSettings: {
        get: () => {
          throw new Error('boom');
        },
      },
    };

    for (let i = 0; i < MAX_APPLY_ATTEMPTS; i++) {
      assert.doesNotThrow(() => tool.applyOverride());
    }

    assert.strictEqual(warnMessages.length, 1, 'throws must consume the same budget');
  });
});
