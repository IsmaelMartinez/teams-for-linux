'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { installFakeRendererEnv } = require('./helpers/fakeRendererEnv');

const rendererPath = require.resolve('../../app/browser/tools/windowIconRenderer');

const ICON = 'data:image/png;base64,ICON';

// Records the drawing calls, so a test can ask where the dot ended up without
// decoding the icon. scale() is recorded rather than applied: the dot is
// placed on the renderer's 140-pixel grid, which is what the arcs report.
class RecordingContext {
  constructor() {
    this.ops = [];
    this.fillStyle = null;
  }
  drawImage(_image, x, y, w, h) { this.ops.push({ op: 'drawImage', x, y, w, h }); }
  beginPath() {}
  fill() {}
  arc(x, y, r) { this.ops.push({ op: 'arc', x, y, r, color: this.fillStyle }); }
  fillRect(x, y, w, h) { this.ops.push({ op: 'fillRect', x, y, w, h, color: this.fillStyle }); }
  translate(x, y) { this.ops.push({ op: 'translate', x, y }); }
  scale(x, y) { this.ops.push({ op: 'scale', x, y }); }
}

let canvases;
let listeners;
let handlers;
let sent;
let iconPaths;
let iconSize;
let env;

function canvas() {
  const element = { width: 0, height: 0, ctx: new RecordingContext() };
  element.getContext = () => element.ctx;
  element.toDataURL = () => `data:image/png;base64,RENDERED${canvases.length}`;
  canvases.push(element);
  return element;
}

const ops = () => canvases.flatMap((element) => element.ctx.ops);
const arcs = () => ops().filter((op) => op.op === 'arc');
const updates = () =>
  sent.filter((message) => message.channel === 'window-icon-update').map((m) => m.data);
// Every page load first sends null (see the start-up test); the rest are the
// updates a test is about.
const statusUpdates = () => updates().slice(1);
const dispatch = (event, detail) => {
  for (const listener of listeners.get(event) || []) listener({ detail });
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

const BASE_CONFIG = { appIcon: '', appIconType: 'default' };

function initRenderer(config) {
  delete require.cache[rendererPath];
  const renderer = require(rendererPath);
  renderer.init({ ...BASE_CONFIG, ...config }, {
    send: (channel, data) => sent.push({ channel, data }),
    on: (channel, handler) => handlers.set(channel, handler),
  });
  return renderer;
}

describe('window icon presence overlay', () => {
  beforeEach(() => {
    canvases = [];
    listeners = new Map();
    handlers = new Map();
    sent = [];
    iconPaths = [];
    iconSize = { width: 96, height: 96 };
    env = installFakeRendererEnv({
      createFromPath: (path) => {
        iconPaths.push(path);
        return { getSize: () => iconSize, toDataURL: () => ICON };
      },
      createCanvas: canvas,
      getListeners: () => listeners,
      rendererPath,
    });
  });

  afterEach(() => {
    env.restore();
  });

  it('registers nothing while the setting is off', async () => {
    initRenderer({ window: { showStatus: false } });

    dispatch('user-status-changed-local', { status: 1 });
    await tick();

    assert.equal(listeners.size, 0);
    assert.equal(handlers.size, 0);
    assert.deepEqual(sent, []);
  });

  it('registers nothing on macOS, where the Dock shows instead', async () => {
    env.setPlatform('darwin');
    initRenderer({ window: { showStatus: true } });

    assert.equal(listeners.size, 0);
    assert.deepEqual(sent, []);
  });

  it('starts every page load from the plain icon', () => {
    initRenderer({ window: { showStatus: true } });

    assert.deepEqual(updates(), [null], 'a reload or sign-in page must not keep the previous dot');
  });

  it('draws the dot in the bottom right, like the tray, scaled to the icon', async () => {
    initRenderer({ window: { showStatus: true } });

    dispatch('user-status-changed-local', { status: 1 });
    await tick();

    const canvasElement = canvases[0];
    assert.equal(canvasElement.width, 96, 'the composite keeps the icon size');
    assert.deepEqual(ops().find((op) => op.op === 'scale'), { op: 'scale', x: 96 / 140, y: 96 / 140 });
    assert.deepEqual(ops().find((op) => op.op === 'translate'), { op: 'translate', x: 0, y: 0 });
    assert.deepEqual(arcs().map((op) => [op.x, op.y, op.r, op.color]), [
      [108, 104, 30, '#ffffff'],
      [108, 104, 24, '#107c41'],
    ]);
    assert.deepEqual(statusUpdates(), ['data:image/png;base64,RENDERED1']);
  });

  it('draws the Do Not Disturb bar inside the dot', async () => {
    initRenderer({ window: { showStatus: true } });

    dispatch('user-status-changed-local', { status: 3 });
    await tick();

    assert.deepEqual(
      ops().filter((op) => op.op === 'fillRect').map((op) => [op.x, op.y, op.w, op.h, op.color]),
      [[95, 100, 26, 8, '#ffffff']],
    );
  });

  it('caps a large custom icon at the window icon limit', async () => {
    iconSize = { width: 512, height: 512 };
    initRenderer({ window: { showStatus: true }, appIcon: '/icons/big.png' });

    dispatch('user-status-changed-local', { status: 1 });
    await tick();

    assert.equal(canvases[0].width, 128);
    assert.deepEqual(iconPaths, ['/icons/big.png']);
  });

  // A wide custom icon keeps its proportions, as the plain icon does
  // (TrayIconChooser.windowImage), and the dot keeps its size: the grid is a
  // square on the shorter side, anchored to the bottom-right corner.
  it('keeps a non-square icon\'s proportions and anchors the dot bottom-right', async () => {
    iconSize = { width: 256, height: 128 };
    initRenderer({ window: { showStatus: true }, appIcon: '/icons/wide.png' });

    dispatch('user-status-changed-local', { status: 1 });
    await tick();

    assert.deepEqual([canvases[0].width, canvases[0].height], [128, 64]);
    assert.deepEqual(ops().find((op) => op.op === 'drawImage'), { op: 'drawImage', x: 0, y: 0, w: 128, h: 64 });
    assert.deepEqual(ops().find((op) => op.op === 'translate'), { op: 'translate', x: 64, y: 0 });
    assert.deepEqual(ops().find((op) => op.op === 'scale'), { op: 'scale', x: 64 / 140, y: 64 / 140 });
    assert.deepEqual(arcs().map((op) => [op.x, op.y]), [[108, 104], [108, 104]]);
  });

  it('sends null for an unknown status, so main restores the plain icon', async () => {
    initRenderer({ window: { showStatus: true } });

    dispatch('user-status-changed-local', { status: 1 });
    await tick();
    dispatch('user-status-changed-local', { status: -1 });
    await tick();

    assert.deepEqual(statusUpdates(), ['data:image/png;base64,RENDERED1', null]);
  });

  it('ignores a repeated or malformed status', async () => {
    initRenderer({ window: { showStatus: true } });

    dispatch('user-status-changed-local', { status: 4 });
    await tick();
    dispatch('user-status-changed-local', { status: 4 });
    dispatch('user-status-changed-local', { status: '4' });
    dispatch('user-status-changed-local', {});
    await tick();

    assert.equal(statusUpdates().length, 1);
  });

  it('draws each status once and reuses it', async () => {
    initRenderer({ window: { showStatus: true } });

    for (const status of [1, 2, 1]) {
      dispatch('user-status-changed-local', { status });
      await tick();
    }

    assert.equal(canvases.length, 2);
    assert.deepEqual(statusUpdates(), [
      'data:image/png;base64,RENDERED1',
      'data:image/png;base64,RENDERED2',
      'data:image/png;base64,RENDERED1',
    ]);
  });

  it('drops a render overtaken by a newer status', async () => {
    initRenderer({ window: { showStatus: true } });

    dispatch('user-status-changed-local', { status: 1 });
    dispatch('user-status-changed-local', { status: 2 });
    await tick();
    await tick();

    assert.equal(statusUpdates().length, 1, 'only the newer status is sent');
    assert.equal(arcs().at(-1).color, '#d83b01');
  });

  it('re-composites on the new base icon after an App Icon change', async () => {
    initRenderer({ window: { showStatus: true } });

    dispatch('user-status-changed-local', { status: 1 });
    await tick();
    handlers.get('config-changed')({}, { appIcon: '/icons/new.png', disableBadgeCount: false });
    await tick();

    assert.equal(canvases.length, 2, 'the cached composite of the old icon is not reused');
    assert.equal(iconPaths.at(-1), '/icons/new.png');
    assert.equal(statusUpdates().length, 2);
  });

  // The App Icon menu sets the plain icon even when the same file is picked
  // again, so the dot has to be re-sent; the composite comes from the cache.
  it('re-sends the dot from the cache when the icon is unchanged', async () => {
    initRenderer({ window: { showStatus: true } });

    dispatch('user-status-changed-local', { status: 1 });
    await tick();
    handlers.get('config-changed')({}, { appIcon: '', disableBadgeCount: true });
    await tick();

    assert.equal(canvases.length, 1, 'nothing is redrawn');
    assert.deepEqual(statusUpdates(), [
      'data:image/png;base64,RENDERED1',
      'data:image/png;base64,RENDERED1',
    ]);
  });

  it('ignores a config change without appIcon', async () => {
    initRenderer({ window: { showStatus: true } });

    dispatch('user-status-changed-local', { status: 1 });
    await tick();
    handlers.get('config-changed')({}, { disableBadgeCount: true });
    await tick();

    assert.equal(statusUpdates().length, 1);
  });

  it('sends nothing for an icon change before any status is known', async () => {
    initRenderer({ window: { showStatus: true } });

    handlers.get('config-changed')({}, { appIcon: '/icons/new.png' });
    await tick();

    assert.deepEqual(statusUpdates(), []);
  });

  it('falls back to the plain icon when the canvas fails', async () => {
    globalThis.document = {
      createElement: () => ({ getContext: () => { throw new Error('no context'); } }),
    };
    const errors = [];
    const originalError = console.error;
    console.error = (...args) => errors.push(args);
    try {
      initRenderer({ window: { showStatus: true } });
      dispatch('user-status-changed-local', { status: 1 });
      await tick();
      await tick();
    } finally {
      console.error = originalError;
    }

    assert.deepEqual(statusUpdates(), [null]);
    assert.equal(errors.length, 1);
  });
});
