'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

const electronPath = require.resolve('electron');
const trayPath = require.resolve('../../app/menus/tray');

// ADR-020 Phase 2: with an aggregator attached, organic tray-update events
// route through it instead of being applied last-write-wins; applyAggregate
// applies the aggregator's composed state. Flag-off (no aggregator) keeps
// the direct path.

let trayInstances;
let trayUpdateHandler;

class FakeNativeTray {
  constructor() {
    this.images = [];
    this.tooltips = [];
    trayInstances.push(this);
  }
  setToolTip(text) {
    this.tooltips.push(text);
  }
  on() {}
  setContextMenu() {}
  setImage(image) {
    this.images.push(image);
  }
  isDestroyed() {
    return false;
  }
  destroy() {}
}

function installElectronMock() {
  require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: {
      Tray: FakeNativeTray,
      Menu: { buildFromTemplate: (template) => template },
      ipcMain: {
        on: (channel, handler) => {
          if (channel === 'tray-update') trayUpdateHandler = handler;
        },
      },
      nativeImage: {
        createFromDataURL: (url) => ({ kind: 'data', url, resize: () => ({}) }),
        createFromPath: (p) => ({ kind: 'path', p, resize: () => ({}) }),
      },
    },
  };
}

let ApplicationTray;

beforeEach(() => {
  trayInstances = [];
  trayUpdateHandler = null;
  installElectronMock();
  delete require.cache[trayPath];
  ApplicationTray = require(trayPath);
});

afterEach(() => {
  delete require.cache[trayPath];
  delete require.cache[electronPath];
});

function build() {
  const window = {
    flashes: [],
    flashFrame(flag) {
      this.flashes.push(flag);
    },
    isFocused: () => false,
  };
  const tray = new ApplicationTray(window, [], '/base/icon.png', {
    appTitle: 'Teams',
  });
  tray.initialize();
  return { tray, window };
}

describe('ApplicationTray aggregation', () => {
  it('without an aggregator, tray-update applies directly (flag-off path)', () => {
    const { window } = build();
    trayUpdateHandler({ sender: { id: 1 } }, { icon: 'data:x', flash: true, count: 3 });
    const nativeTray = trayInstances[0];
    assert.deepStrictEqual(nativeTray.images.at(-1), {
      kind: 'data',
      url: 'data:x',
      resize: nativeTray.images.at(-1).resize,
    });
    assert.deepStrictEqual(window.flashes, [true]);
    assert.strictEqual(nativeTray.tooltips.at(-1), 'Teams (3)');
  });

  it('with an aggregator, tray-update is delegated and not applied directly', () => {
    const { tray, window } = build();
    const seen = [];
    tray.setAggregator({ onTrayUpdate: (event, data) => seen.push([event.sender.id, data]) });
    trayUpdateHandler({ sender: { id: 9 } }, { icon: 'data:x', flash: true, count: 3 });
    assert.deepStrictEqual(seen, [[9, { icon: 'data:x', flash: true, count: 3 }]]);
    assert.deepStrictEqual(window.flashes, []); // nothing applied directly
    assert.strictEqual(trayInstances[0].images.length, 0);
  });

  it('applyAggregate applies the composed icon, flash, and tooltip; null icon falls back to base', () => {
    const { tray, window } = build();
    tray.applyAggregate({ icon: 'data:agg', flash: true, tooltip: 'Teams (9)\nWork: 7' });
    const nativeTray = trayInstances[0];
    assert.strictEqual(nativeTray.images.at(-1).url, 'data:agg');
    assert.strictEqual(nativeTray.tooltips.at(-1), 'Teams (9)\nWork: 7');
    assert.deepStrictEqual(window.flashes, [true]);
    tray.applyAggregate({ icon: null, flash: false, tooltip: 'Teams' });
    assert.strictEqual(nativeTray.images.at(-1).kind, 'path'); // base icon
    assert.strictEqual(nativeTray.images.at(-1).p, '/base/icon.png');
  });
});
