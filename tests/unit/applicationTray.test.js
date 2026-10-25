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
        // resize returns the image itself so assertions hold on macOS too
        // (getIconImage resizes there); isEmpty models a decodable payload
        // unless the URL is marked bad.
        createFromDataURL: (url) => {
          const img = { kind: 'data', url, isEmpty: () => url.includes('bad') };
          img.resize = () => img;
          return img;
        },
        createFromPath: (p) => {
          const img = { kind: 'path', p, isEmpty: () => false };
          img.resize = () => img;
          return img;
        },
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
    multiAccount: { enabled: true },
  });
  tray.initialize();
  return { tray, window };
}

describe('ApplicationTray aggregation', () => {
  it('without an aggregator, tray-update applies directly (flag-off path)', () => {
    const { window } = build();
    trayUpdateHandler({ sender: { id: 1 } }, { icon: 'data:x', flash: true, count: 3 });
    const nativeTray = trayInstances[0];
    assert.strictEqual(nativeTray.images.at(-1).kind, 'data');
    assert.strictEqual(nativeTray.images.at(-1).url, 'data:x');
    assert.deepStrictEqual(window.flashes, [true]);
    assert.strictEqual(nativeTray.tooltips.at(-1), 'Teams (3)');
  });

  it('a redraw of the same unread state does not re-request attention', () => {
    const { window } = build();
    trayUpdateHandler({ sender: { id: 1 } }, { icon: 'data:dot', flash: true, count: 3 });
    // trayIconRenderer re-sends the same count with the new dot when the Teams
    // status changes: same unread state, so the window is not flashed again.
    trayUpdateHandler({ sender: { id: 1 } }, { icon: 'data:dot-busy', flash: true, count: 3 });
    assert.deepStrictEqual(window.flashes, [true]);
    // Reading the messages still stops the flash.
    trayUpdateHandler({ sender: { id: 1 } }, { icon: null, flash: false, count: 0 });
    assert.deepStrictEqual(window.flashes, [true, false]);
  });

  it('the aggregate path asks for attention only when its unread state changes', () => {
    const { tray, window } = build();
    tray.applyAggregate({ icon: 'data:agg', flash: true, tooltip: 'Teams (3)' });
    tray.applyAggregate({ icon: 'data:agg-dot', flash: true, tooltip: 'Teams (3)' });
    assert.deepStrictEqual(window.flashes, [true]);
    tray.applyAggregate({ icon: 'data:agg', flash: true, tooltip: 'Teams (4)' });
    assert.deepStrictEqual(window.flashes, [true, true]);
  });

  it('a redraw that omits flash leaves the window flash state untouched', () => {
    const { window } = build();
    trayUpdateHandler({ sender: { id: 1 } }, { icon: 'data:dot', flash: true, count: 3 });
    // #3098's redraw payload has no `flash` key: it is not a notification.
    trayUpdateHandler({ sender: { id: 1 } }, { icon: 'data:dot-busy', count: 3 });
    assert.deepStrictEqual(window.flashes, [true]);
    // Reading the messages is an explicit stop and must still get through.
    trayUpdateHandler({ sender: { id: 1 } }, { icon: null, flash: false, count: 0 });
    assert.deepStrictEqual(window.flashes, [true, false]);
  });

  it('the aggregate path skips attention when flash is omitted', () => {
    const { tray, window } = build();
    tray.applyAggregate({ icon: 'data:agg', flash: true, tooltip: 'Teams (3)' });
    tray.applyAggregate({ icon: 'data:agg-dot', tooltip: 'Teams (3)' });
    assert.deepStrictEqual(window.flashes, [true]);
    tray.applyAggregate({ icon: null, flash: false, tooltip: 'Teams' });
    assert.deepStrictEqual(window.flashes, [true, false]);
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

  it('setAggregator replays the last pre-attach update from EVERY sender, once', () => {
    const { tray } = build();
    trayUpdateHandler({ sender: { id: 4 } }, { icon: 'data:x', flash: false, count: 2 });
    trayUpdateHandler({ sender: { id: 4 } }, { icon: 'data:y', flash: true, count: 5 });
    trayUpdateHandler({ sender: { id: 9 } }, { icon: 'data:z', flash: false, count: 1 });
    const seen = [];
    tray.setAggregator({ onTrayUpdate: (event, data) => seen.push([event.sender.id, data]) });
    // Latest per sender, all senders — a single slot would have kept only id 9.
    assert.deepStrictEqual(seen, [
      [4, { icon: 'data:y', flash: true, count: 5 }],
      [9, { icon: 'data:z', flash: false, count: 1 }],
    ]);
    // Replay happens once, not again on a second attach.
    tray.setAggregator({ onTrayUpdate: (event, data) => seen.push(['again', data]) });
    assert.strictEqual(seen.length, 2);
  });

  it('does not stash direct updates with multi-account off (flag-off path identical to main)', () => {
    const window = { flashes: [], flashFrame(f) { this.flashes.push(f); }, isFocused: () => false };
    const tray = new ApplicationTray(window, [], '/base/icon.png', { appTitle: 'Teams' });
    tray.initialize();
    trayUpdateHandler({ sender: { id: 4 } }, { icon: 'data:x', flash: false, count: 2 });
    assert.strictEqual(tray.lastDirectUpdates, undefined);
  });

  it('applyAggregate falls back to the base icon when the payload decodes to an empty image', () => {
    const { tray } = build();
    tray.applyAggregate({ icon: 'data:image/png;base64,bad', flash: false, tooltip: 'Teams (3)' });
    const nativeTray = trayInstances[0];
    assert.strictEqual(nativeTray.images.at(-1).kind, 'path');
    assert.strictEqual(nativeTray.images.at(-1).p, '/base/icon.png');
    assert.strictEqual(nativeTray.tooltips.at(-1), 'Teams (3)');
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
