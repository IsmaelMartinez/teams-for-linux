'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const electronPath = require.resolve('electron');
const rendererPath = require.resolve('../../app/browser/tools/trayIconRenderer');

const ICON = 'data:image/png;base64,ICON';
const RENDERED = 'data:image/png;base64,RENDERED';

// Records the drawing calls the renderer makes, so a test can ask where the
// presence dot and the unread badge ended up without decoding the icon.
class RecordingContext {
  constructor() {
    this.ops = [];
    this.fillStyle = null;
  }
  drawImage() { this.ops.push({ op: 'drawImage' }); }
  beginPath() {}
  fill() { this.ops.push({ op: 'fill', color: this.fillStyle }); }
  arc(x, y, r) { this.ops.push({ op: 'arc', x, y, r, color: this.fillStyle }); }
  ellipse(x, y, rx, ry) { this.ops.push({ op: 'ellipse', x, y, rx, ry, color: this.fillStyle }); }
  fillRect(x, y, w, h) { this.ops.push({ op: 'fillRect', x, y, w, h, color: this.fillStyle }); }
  fillText(text, x, y) { this.ops.push({ op: 'fillText', text, x, y, color: this.fillStyle }); }
  scale() {}
}

let canvases = [];
let listeners = new Map();
let handlers = new Map();
let sent = [];
let platform;

function canvas() {
  const element = { width: 0, height: 0, ctx: new RecordingContext() };
  element.getContext = () => element.ctx;
  element.toDataURL = () => RENDERED;
  canvases.push(element);
  return element;
}

const ops = () => canvases.flatMap((element) => element.ctx.ops);
const dispatch = (event, detail) => {
  for (const listener of listeners.get(event) || []) listener({ detail });
};
const trayUpdates = () => sent.filter((message) => message.channel === 'tray-update');
const lastUpdate = () => trayUpdates().at(-1)?.data;
const aggregateReplies = () =>
  sent.filter((message) => message.channel === 'aggregate-badge-rendered').map((m) => m.data);
const tick = () => new Promise((resolve) => setImmediate(resolve));

// The renderer is handed the fully defaulted config in the app; a test that
// omitted appIconType would fail inside TrayIconChooser instead of on an
// assertion.
const BASE_CONFIG = { appIcon: '', appIconType: 'default', disableBadgeCount: false };

function initRenderer(config) {
  listeners = new Map();
  handlers = new Map();
  canvases = [];
  sent = [];
  delete require.cache[rendererPath];
  const renderer = require(rendererPath);
  renderer.init({ ...BASE_CONFIG, ...config }, {
    send: (channel, data) => sent.push({ channel, data }),
    invoke: async () => {},
    on: (channel, handler) => handlers.set(channel, handler),
  });
  return renderer;
}

describe('tray presence status overlay', () => {
  beforeEach(() => {
    require.cache[electronPath] = {
      id: electronPath,
      filename: electronPath,
      loaded: true,
      exports: {
        nativeImage: {
          createFromPath: () => ({
            getSize: () => ({ width: 96, height: 96 }),
            toDataURL: () => ICON,
          }),
        },
      },
    };
    globalThis.document = { createElement: (tag) => (tag === 'canvas' ? canvas() : {}) };
    globalThis.Image = class {
      set src(_value) {
        setImmediate(() => this.onload && this.onload());
      }
    };
    globalThis.addEventListener = (event, listener) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(listener);
    };
    platform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { ...platform, value: 'linux' });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', platform);
    delete require.cache[electronPath];
    delete require.cache[rendererPath];
    delete globalThis.document;
    delete globalThis.Image;
    delete globalThis.addEventListener;
  });

  it('draws the status dot in the bottom right when the setting is on', async () => {
    initRenderer({ media: { showStatusOnDockIcon: true } });

    dispatch('user-status-changed-local', { status: 3 });
    await tick();

    const arcs = ops().filter((op) => op.op === 'arc');
    assert.deepEqual(arcs.map((op) => [op.x, op.y, op.color]), [
      [108, 104, '#ffffff'],
      [108, 104, '#a80000'],
    ]);
    assert.ok(
      ops().some((op) => op.op === 'fillRect' && op.color === '#ffffff'),
      'do not disturb draws the bar inside the dot',
    );
    assert.equal(lastUpdate().icon, RENDERED, 'the composited icon goes to the tray');
    assert.equal(lastUpdate().count, 0);
  });

  it('draws nothing while the setting is off', async () => {
    initRenderer({ media: { showStatusOnDockIcon: false } });

    dispatch('user-status-changed-local', { status: 3 });
    await tick();

    assert.deepEqual(ops(), []);
    assert.deepEqual(sent, []);
  });

  it('moves the unread badge to the bottom left while the dot is drawn', async () => {
    initRenderer({ media: { showStatusOnDockIcon: true } });
    dispatch('user-status-changed-local', { status: 1 });
    await tick();

    canvases = [];
    dispatch('unread-count', { number: 3 });
    await tick();

    const badge = ops().find((op) => op.op === 'ellipse');
    const dot = ops().find((op) => op.op === 'arc' && op.color === '#107c41');
    assert.equal(badge.x, 34, 'the badge leaves the corner the dot owns');
    assert.ok(badge.x + badge.rx < dot.x - 30, 'the two marks do not overlap');
    assert.ok(
      badge.x - badge.rx >= 0 && badge.y - badge.ry >= 0,
      'the whole badge stays inside the canvas, so the dot cannot clip its edge',
    );
  });

  it('keeps the presence dot when the aggregate badge renders at zero unread', async () => {
    initRenderer({
      media: { showStatusOnDockIcon: true },
      multiAccount: { enabled: true },
    });
    dispatch('user-status-changed-local', { status: 1 });
    await tick();

    canvases = [];
    sent = [];
    // Main asks for the aggregate icon when every profile is at zero unread
    // (ProfileUnreadAggregator), which is where the dot used to be lost.
    await handlers.get('render-aggregate-badge')({}, { requestId: 'r1', count: 0 });

    assert.equal(aggregateReplies().at(-1).icon, RENDERED);
    assert.ok(
      ops().some((op) => op.op === 'arc' && op.color === '#107c41'),
      'the dot is composited onto the zero-unread icon',
    );
  });

  it('replies with no icon when there is nothing to draw', async () => {
    initRenderer({ media: { showStatusOnDockIcon: true }, multiAccount: { enabled: true } });

    await handlers.get('render-aggregate-badge')({}, { requestId: 'r1', count: 0 });

    assert.equal(aggregateReplies().at(-1).icon, null);
    assert.deepEqual(ops(), [], 'no canvas work without a dot or a badge');
  });

  it('keeps the badge in its usual corner with the setting off', async () => {
    initRenderer({ media: { showStatusOnDockIcon: false }, disableBadgeCount: false });

    dispatch('unread-count', { number: 3 });
    await tick();

    assert.equal(ops().find((op) => op.op === 'ellipse').x, 100);
  });

  it('ignores an unchanged or unknown status', async () => {
    initRenderer({ media: { showStatusOnDockIcon: true } });

    dispatch('user-status-changed-local', { status: 4 });
    await tick();
    const afterFirst = trayUpdates().length;

    dispatch('user-status-changed-local', { status: 4 });
    dispatch('user-status-changed-local', { status: null });
    dispatch('user-status-changed-local', {});
    await tick();

    assert.equal(trayUpdates().length, afterFirst);
  });
});
