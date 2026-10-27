'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

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

  it('allows the popup as a capped, always-on-top window', () => {
    assert.deepStrictEqual(main.documentPictureInPictureResponse(), {
      action: 'allow',
      overrideBrowserWindowOptions: {
        alwaysOnTop: true,
        autoHideMenuBar: true,
        fullscreenable: false,
        maxWidth: main.PIP_MAX_WIDTH,
        maxHeight: main.PIP_MAX_HEIGHT,
      },
    });
  });

  it('profile views give the PiP popup the same window options', () => {
    const handler = createProfileWindowOpenHandler({
      config: { meetupJoinRegEx: '^https://teams\\.microsoft\\.com/l/meetup-join/', ...ENABLED },
      loadInView: () => assert.fail('PiP popup must not load in the view'),
    });
    assert.deepStrictEqual(handler(pipDetails), main.documentPictureInPictureResponse());
    // Other about:blank popups keep the profile default.
    assert.deepStrictEqual(handler({ url: 'about:blank' }), { action: 'allow' });
  });
});
