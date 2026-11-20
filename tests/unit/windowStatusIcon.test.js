'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const WindowStatusIcon = require('../../app/windowStatusIcon');

const DOTTED = 'data:image/png;base64,DOTTED';
const PLAIN = { plain: true, isEmpty: () => false };

let handler;
let setIcons;
let windowState;
let active;
let senders;

function sender(id) {
  const listeners = new Map();
  const webContents = {
    id,
    once: (event, listener) => listeners.set(event, listener),
    destroy: () => listeners.get('destroyed')?.(),
  };
  senders.set(id, webContents);
  return webContents;
}

function create() {
  const icon = new WindowStatusIcon({
    ipcMain: {
      on: (channel, listener) => {
        assert.equal(channel, 'window-icon-update');
        handler = listener;
      },
    },
    nativeImage: {
      createFromDataURL: (dataUrl) => ({
        dataUrl,
        // Mirrors Electron: a malformed payload yields an empty image.
        isEmpty: () => dataUrl.endsWith('BROKEN'),
      }),
    },
    getWindow: () => windowState,
    getActiveWebContents: () => active,
    getPlainIcon: () => PLAIN,
  });
  icon.initialize();
  return icon;
}

const send = (webContents, payload) => handler({ sender: webContents }, payload);

describe('window status icon (main)', () => {
  beforeEach(() => {
    handler = null;
    setIcons = [];
    senders = new Map();
    windowState = {
      isDestroyed: () => false,
      setIcon: (image) => setIcons.push(image),
    };
    active = null;
  });

  it('applies the icon sent by the active page', () => {
    create();
    active = sender(1);

    send(active, DOTTED);

    assert.equal(setIcons.length, 1);
    assert.equal(setIcons[0].dataUrl, DOTTED);
  });

  it('restores the plain icon for a null payload', () => {
    create();
    active = sender(1);

    send(active, DOTTED);
    send(active, null);

    assert.equal(setIcons.at(-1), PLAIN);
  });

  it('treats anything but a PNG data URL as the plain icon', () => {
    create();
    active = sender(1);

    for (const payload of ['/etc/passwd', 'data:image/svg+xml;base64,AAA', 42, { icon: DOTTED }]) {
      send(active, payload);
    }

    assert.deepEqual(setIcons, [PLAIN, PLAIN, PLAIN, PLAIN]);
  });

  it('falls back to the plain icon when the image decodes empty', () => {
    create();
    active = sender(1);

    send(active, 'data:image/png;base64,BROKEN');

    assert.deepEqual(setIcons, [PLAIN]);
  });

  it('keeps an inactive page from setting the icon', () => {
    create();
    active = sender(1);

    send(sender(2), DOTTED);

    assert.deepEqual(setIcons, []);
  });

  it('shows the newly active page\'s last icon on refresh', () => {
    const icon = create();
    const first = sender(1);
    const second = sender(2);
    active = first;
    send(first, null);
    send(second, DOTTED);

    active = second;
    icon.refresh();

    assert.equal(setIcons.at(-1).dataUrl, DOTTED);
  });

  it('shows the plain icon on refresh for a page that has sent nothing yet', () => {
    const icon = create();
    active = sender(1);
    send(active, DOTTED);

    active = sender(2);
    icon.refresh();

    assert.equal(setIcons.at(-1), PLAIN);
  });

  it('forgets a page once it is destroyed', () => {
    const icon = create();
    const gone = sender(2);
    send(gone, DOTTED);
    gone.destroy();

    active = gone;
    icon.refresh();

    assert.equal(setIcons.at(-1), PLAIN);
  });

  it('ignores an event without a sender id', () => {
    create();
    active = sender(1);

    handler({}, DOTTED);
    handler({ sender: {} }, DOTTED);

    assert.deepEqual(setIcons, []);
  });

  it('does nothing once the window is gone', () => {
    const icon = create();
    active = sender(1);
    windowState = { isDestroyed: () => true, setIcon: () => assert.fail('setIcon on a destroyed window') };

    send(active, DOTTED);
    icon.refresh();
    windowState = null;
    icon.refresh();

    assert.deepEqual(setIcons, []);
  });
});

// app/index.js requires the electron runtime, so its wiring is checked as
// source text, like openInBrowserCatch.test.js does for mainAppWindow.
describe('window status icon wiring in app/index.js', () => {
  const { readFileSync } = require('node:fs');
  const { join } = require('node:path');
  const source = readFileSync(join(__dirname, '..', '..', 'app', 'index.js'), 'utf8');

  // Removing the active profile picks another one but emits "remove", not
  // "switch"; without a refresh there the removed account's dot stays up.
  for (const event of ['switch', 'remove']) {
    it(`re-applies the icon on the profiles "${event}" event`, () => {
      assert.match(source, new RegExp(`profilesManager\\.on\\("${event}", refreshWindowIcon\\)`));
    });
  }

  // The view manager must handle the event first, so the new profile is the
  // active page by the time the icon is re-applied.
  it('registers after the view manager has initialised', () => {
    const viewManagerReady = source.indexOf('profileViewManager.initialize();');
    const wiring = source.indexOf('profilesManager.on("switch", refreshWindowIcon)');
    assert.ok(viewManagerReady !== -1 && wiring > viewManagerReady);
  });
});
