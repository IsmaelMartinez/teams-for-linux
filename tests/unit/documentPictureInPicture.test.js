'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');

const tool = require('../../app/browser/tools/documentPictureInPicture');
const main = require('../../app/mainAppWindow/documentPictureInPicture');
const { createProfileWindowOpenHandler } = require('../../app/mainAppWindow/profileWindowOpenPolicy');

// app/index.js adds the per-launch frame name to the config the renderer gets.
const ENABLED = {
  media: { documentPictureInPicture: true },
  documentPictureInPictureFrameName: main.PIP_FRAME_NAME,
};

// Popup returned by the fake window.open: an EventTarget with the `closed`
// flag and a close() that fires pagehide, as a real same-origin popup does.
class FakePopup extends EventTarget {
  constructor() {
    super();
    this.closed = false;
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.dispatchEvent(new Event('pagehide'));
  }
}

// Opener stand-in: records window.open calls; `open` returns null when
// `blocked` is set, as Chromium does for a refused popup.
class FakeWindow extends EventTarget {
  constructor() {
    super();
    this.opened = [];
    this.blocked = false;
    this.handlers = {};
    const handlers = this.handlers;
    this.navigator = {
      mediaSession: {
        setActionHandler(action, handler) {
          handlers[action] = handler;
        },
      },
    };
    // The native API, which the tool must replace.
    Object.defineProperty(this, 'documentPictureInPicture', {
      value: { native: true },
      configurable: true,
    });
  }
  open(url, name, features) {
    if (this.blocked) return null;
    const popup = new FakePopup();
    this.opened.push({ url, name, features, popup });
    return popup;
  }
}

describe('documentPictureInPicture browser tool', () => {
  let logs;
  beforeEach(() => {
    logs = [];
    globalThis.console = {
      ...console,
      debug: () => {},
      info: (...args) => logs.push(args[0]),
      warn: () => {},
    };
  });

  it('leaves the native API in place when the option is off', () => {
    const win = new FakeWindow();
    tool.init({ media: { documentPictureInPicture: false } }, win);
    assert.strictEqual(win.documentPictureInPicture.native, true);
    tool.init({}, win);
    assert.strictEqual(win.documentPictureInPicture.native, true);
  });

  it('leaves the native API in place without a frame name from the main process', () => {
    const win = new FakeWindow();
    tool.init({ media: { documentPictureInPicture: true } }, win);
    assert.strictEqual(win.documentPictureInPicture.native, true);
  });

  it('opens an about:blank popup with the frame name the main process allows', async () => {
    const win = new FakeWindow();
    tool.init(ENABLED, win);
    const pip = await win.documentPictureInPicture.requestWindow({ width: 320, height: 180 });
    assert.strictEqual(win.opened.length, 1);
    const [{ url, name, features, popup }] = win.opened;
    assert.strictEqual(pip, popup);
    assert.strictEqual(url, 'about:blank');
    assert.strictEqual(name, main.PIP_FRAME_NAME);
    assert.strictEqual(features, 'popup,width=320,height=180');
    assert.strictEqual(win.documentPictureInPicture.window, pip);
  });

  it('uses a default size and clamps requested sizes to the main-process cap', async () => {
    const win = new FakeWindow();
    tool.init(ENABLED, win);
    const api = win.documentPictureInPicture;
    await api.requestWindow();
    await api.requestWindow({ width: 5000, height: 4000 });
    await api.requestWindow({ width: 10, height: 'nope' });
    assert.deepStrictEqual(
      win.opened.map((o) => o.features),
      [
        'popup,width=400,height=300',
        `popup,width=${main.PIP_MAX_WIDTH},height=${main.PIP_MAX_HEIGHT}`,
        'popup,width=100,height=300',
      ]
    );
  });

  it('fires enter (listener and onenter) with the PiP window', async () => {
    const win = new FakeWindow();
    tool.init(ENABLED, win);
    const api = win.documentPictureInPicture;
    const seen = [];
    api.addEventListener('enter', (e) => seen.push(['listener', e.window]));
    api.onenter = (e) => seen.push(['onenter', e.window]);
    const pip = await api.requestWindow();
    assert.deepStrictEqual(seen.map(([kind]) => kind).sort(), ['listener', 'onenter']);
    assert.ok(seen.every(([, w]) => w === pip));
  });

  it('replaces an open PiP window on a new request', async () => {
    const win = new FakeWindow();
    tool.init(ENABLED, win);
    const api = win.documentPictureInPicture;
    const first = await api.requestWindow();
    const second = await api.requestWindow();
    assert.strictEqual(first.closed, true);
    assert.strictEqual(api.window, second);
  });

  it('clears window when the user closes the PiP window', async () => {
    const win = new FakeWindow();
    tool.init(ENABLED, win);
    const api = win.documentPictureInPicture;
    const pip = await api.requestWindow();
    pip.close();
    assert.strictEqual(api.window, null);
  });

  it('closes the PiP window when the opener unloads', async () => {
    const win = new FakeWindow();
    tool.init(ENABLED, win);
    const pip = await win.documentPictureInPicture.requestWindow();
    win.dispatchEvent(new Event('pagehide'));
    assert.strictEqual(pip.closed, true);
  });

  it('rejects with NotAllowedError when the popup is refused', async () => {
    const win = new FakeWindow();
    win.blocked = true;
    tool.init(ENABLED, win);
    await assert.rejects(
      win.documentPictureInPicture.requestWindow(),
      (error) => error.name === 'NotAllowedError'
    );
    assert.strictEqual(win.documentPictureInPicture.window, null);
  });

  it('logs enterpictureinpicture registration and still forwards it', () => {
    const win = new FakeWindow();
    tool.init(ENABLED, win);
    const handler = () => {};
    win.navigator.mediaSession.setActionHandler('enterpictureinpicture', handler);
    win.navigator.mediaSession.setActionHandler('enterpictureinpicture', null);
    win.navigator.mediaSession.setActionHandler('play', handler);
    assert.strictEqual(win.handlers.play, handler);
    assert.strictEqual(win.handlers.enterpictureinpicture, null);
    const pipLogs = logs.filter((l) => l.includes('enterpictureinpicture'));
    assert.strictEqual(pipLogs.length, 2);
    assert.match(pipLogs[0], /registered/);
    assert.match(pipLogs[1], /cleared/);
  });
});

describe('documentPictureInPicture frame name', () => {
  it('is random per launch so cross-origin frames cannot guess it', () => {
    const modulePath = require.resolve('../../app/mainAppWindow/documentPictureInPicture');
    delete require.cache[modulePath];
    const relaunched = require(modulePath);
    assert.match(main.PIP_FRAME_NAME, /^teams-for-linux-document-pip-[0-9a-f-]{36}$/);
    assert.notStrictEqual(relaunched.PIP_FRAME_NAME, main.PIP_FRAME_NAME);
    // The fixed name that shipped in 2.26.0 must no longer open the window.
    assert.strictEqual(
      main.isDocumentPictureInPictureRequest({ url: 'about:blank', frameName: 'teams-for-linux-document-pip' }, ENABLED),
      false
    );
  });
});

describe('documentPictureInPicture window-open decision', () => {
  const pipDetails = { url: 'about:blank', frameName: main.PIP_FRAME_NAME };

  it('recognises the PiP popup only when the option is on', () => {
    assert.strictEqual(main.isDocumentPictureInPictureRequest(pipDetails, ENABLED), true);
    assert.strictEqual(
      main.isDocumentPictureInPictureRequest(pipDetails, { media: { documentPictureInPicture: false } }),
      false
    );
    assert.strictEqual(main.isDocumentPictureInPictureRequest(pipDetails, {}), false);
  });

  it('does not match other about:blank popups or a non-blank URL with the frame name', () => {
    for (const details of [
      { url: 'about:blank', frameName: '' },
      { url: 'about:blank#blocked', frameName: main.PIP_FRAME_NAME },
      { url: 'https://example.com/', frameName: main.PIP_FRAME_NAME },
      {},
      undefined,
    ]) {
      assert.strictEqual(main.isDocumentPictureInPictureRequest(details, ENABLED), false, JSON.stringify(details));
    }
  });

  it('allows the popup as an always-on-top window without max size hints, so the user can maximize it', () => {
    const response = new main.DocumentPictureInPictureWindows().windowOpenResponse({
      ...pipDetails,
      features: 'popup,width=500,height=350',
    });
    assert.deepStrictEqual(response, {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 500,
        height: 350,
        alwaysOnTop: true,
        autoHideMenuBar: true,
        fullscreenable: false,
        // Must match the opener's sandbox setting or window.open() returns null.
        // The rest is pinned to the secure values, and no preload is given.
        webPreferences: { sandbox: false, contextIsolation: true, nodeIntegration: false },
      },
    });
  });

  it('locks the PiP window on about:blank: no navigation, no popups', () => {
    const listeners = {};
    let openHandler;
    main.lockDocumentPictureInPictureWindow({
      on: (name, fn) => { listeners[name] = fn; },
      setWindowOpenHandler: (fn) => { openHandler = fn; },
    });
    let prevented = false;
    listeners['will-navigate']({ preventDefault: () => { prevented = true; } }, 'https://example.com/');
    assert.strictEqual(prevented, true);
    assert.deepStrictEqual(openHandler({ url: 'https://example.com/' }), { action: 'deny' });
  });

  it('hands out a fresh webPreferences object each time', () => {
    const windows = new main.DocumentPictureInPictureWindows();
    const first = windows.windowOpenResponse(pipDetails);
    first.overrideBrowserWindowOptions.webPreferences.sandbox = true;
    assert.strictEqual(
      windows.windowOpenResponse(pipDetails).overrideBrowserWindowOptions.webPreferences.sandbox,
      false,
    );
  });

  it('sizes the window itself, clamping what the page asks for to the cap', () => {
    const windows = new main.DocumentPictureInPictureWindows();
    const sizeFor = (features) => {
      const { width, height } = windows.windowOpenResponse({ ...pipDetails, features }).overrideBrowserWindowOptions;
      return { width, height };
    };
    assert.deepStrictEqual(sizeFor('popup,width=5000,height=5000'), { width: main.PIP_MAX_WIDTH, height: main.PIP_MAX_HEIGHT });
    assert.deepStrictEqual(sizeFor('popup, WIDTH = 10 , height=abc'), { width: 100, height: 300 });
    assert.deepStrictEqual(sizeFor(undefined), { width: 400, height: 300 });
  });

  it('profile views give the PiP popup the same window options', () => {
    const handler = createProfileWindowOpenHandler({
      config: { meetupJoinRegEx: '^https://teams\\.microsoft\\.com/l/meetup-join/', ...ENABLED },
      loadInView: () => assert.fail('PiP popup must not load in the view'),
    });
    assert.deepStrictEqual(handler(pipDetails), main.documentPictureInPictureWindows.windowOpenResponse(pipDetails));
    // Other about:blank popups keep the profile default.
    assert.deepStrictEqual(handler({ url: 'about:blank' }), { action: 'allow' });
  });
});

// BrowserWindow stand-in: emits resize/closed like Electron and applies
// setBounds; its webContents emits content-bounds-updated.
class FakeBrowserWindow extends EventEmitter {
  constructor(width, height) {
    super();
    this.bounds = { x: 0, y: 0, width, height };
    this.webContents = new EventEmitter();
  }
  getBounds() {
    return { ...this.bounds };
  }
  getNormalBounds() {
    return { ...this.bounds };
  }
  setBounds(bounds) {
    const resized = bounds.width !== this.bounds.width || bounds.height !== this.bounds.height;
    this.bounds = { ...bounds };
    if (resized) this.emit('resize');
  }
  userResize(width, height) {
    this.bounds = { ...this.bounds, width, height };
    this.emit('resize');
  }
  // As Electron does, applies the request unless a listener prevents it.
  pageRequests(bounds) {
    let prevented = false;
    this.webContents.emit('content-bounds-updated', { preventDefault: () => { prevented = true; } }, bounds);
    if (!prevented) this.setBounds(bounds);
    return prevented;
  }
}

describe('documentPictureInPicture window watch', () => {
  const pipDetails = { url: 'about:blank', frameName: main.PIP_FRAME_NAME };

  function setup() {
    const windows = new main.DocumentPictureInPictureWindows();
    const opener = new EventEmitter();
    windows.watchOpener(opener, ENABLED);
    const open = (width, height, details = pipDetails) => {
      const pip = new FakeBrowserWindow(width, height);
      opener.emit('did-create-window', pip, details);
      return pip;
    };
    const nextSize = () => {
      const { width, height } = windows.windowOpenResponse({ ...pipDetails, features: 'width=400,height=300' }).overrideBrowserWindowOptions;
      return { width, height };
    };
    return { open, nextSize };
  }

  it('clamps page-initiated growth past the cap', () => {
    const { open } = setup();
    const pip = open(400, 300);
    assert.strictEqual(pip.pageRequests({ x: 5, y: 5, width: 2400, height: 1300 }), true);
    assert.deepStrictEqual(pip.bounds, { x: 5, y: 5, width: main.PIP_MAX_WIDTH, height: main.PIP_MAX_HEIGHT });
    assert.strictEqual(pip.pageRequests({ x: 5, y: 5, width: 600, height: 400 }), false);
  });

  it('lets the page move a window the user enlarged without shrinking it, but not grow it further', () => {
    const { open } = setup();
    const pip = open(400, 300);
    pip.userResize(1600, 1000);
    assert.strictEqual(pip.pageRequests({ x: 40, y: 40, width: 1600, height: 1000 }), false);
    assert.strictEqual(pip.pageRequests({ x: 40, y: 40, width: 2400, height: 1300 }), true);
    assert.deepStrictEqual(pip.bounds, { x: 40, y: 40, width: 1600, height: 1000 });
  });

  it('reopens at the size the user last chose, even past the cap', () => {
    const { open, nextSize } = setup();
    const pip = open(400, 300);
    pip.userResize(1600, 1000);
    assert.deepStrictEqual(nextSize(), { width: 400, height: 300 }, 'remembered only once the window is gone');
    pip.emit('closed');
    assert.deepStrictEqual(nextSize(), { width: 1600, height: 1000 });
  });

  it('keeps the page size when the window closes at the size it opened with', () => {
    const { open, nextSize } = setup();
    const pip = open(500, 350);
    pip.userResize(900, 700);
    pip.userResize(500, 350);
    pip.emit('closed');
    assert.deepStrictEqual(nextSize(), { width: 400, height: 300 });
  });

  it('does not remember a size the page set', () => {
    const { open, nextSize } = setup();
    const pip = open(400, 300);
    pip.pageRequests({ x: 0, y: 0, width: 600, height: 400 });
    pip.pageRequests({ x: 0, y: 0, width: 2400, height: 1300 });
    assert.deepStrictEqual(pip.bounds, { x: 0, y: 0, width: main.PIP_MAX_WIDTH, height: main.PIP_MAX_HEIGHT });
    pip.emit('closed');
    assert.deepStrictEqual(nextSize(), { width: 400, height: 300 });
  });

  it("keeps the user's size when the page resizes the window afterwards", () => {
    const { open, nextSize } = setup();
    const pip = open(400, 300);
    pip.userResize(1600, 1000);
    pip.pageRequests({ x: 0, y: 0, width: 600, height: 400 });
    assert.deepStrictEqual(pip.bounds, { x: 0, y: 0, width: 600, height: 400 });
    pip.emit('closed');
    assert.deepStrictEqual(nextSize(), { width: 1600, height: 1000 });
  });

  it('does not remember a maximize the user did not follow with a resize', () => {
    const { open, nextSize } = setup();
    const pip = open(400, 300);
    pip.getNormalBounds = () => ({ x: 0, y: 0, width: 400, height: 300 });
    pip.userResize(2560, 1368);
    pip.emit('closed');
    assert.deepStrictEqual(nextSize(), { width: 400, height: 300 });
  });

  it('ignores windows that are not the PiP popup', () => {
    const { open } = setup();
    const other = open(400, 300, { url: 'about:blank', frameName: 'other' });
    assert.strictEqual(other.pageRequests({ x: 0, y: 0, width: 2400, height: 1300 }), false);
    assert.strictEqual(other.listenerCount('closed'), 0);
  });
});
