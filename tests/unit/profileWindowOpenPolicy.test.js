'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  createProfileWindowOpenHandler,
  installProfileWindowOpenHandler,
} = require('../../app/mainAppWindow/profileWindowOpenPolicy');
const defaults = require('../../app/config/defaults');

// ADR-020 Phase 2: window-open policy for profile views and their
// descendants. Pure factory + a thin installer, both asserted directly.

const MEETUP_RE = '^https://teams\\.microsoft\\.com/l/meetup-join/';

function build(overrides = {}) {
  const loads = [];
  const handler = createProfileWindowOpenHandler({
    config: {
      meetupJoinRegEx: MEETUP_RE,
      onNewWindowOpenMeetupJoinUrlInApp: true,
      ...overrides.config,
    },
    loadInView: (url) => loads.push(url),
  });
  return { handler, loads };
}

describe('createProfileWindowOpenHandler', () => {
  it('loads a meeting-join link in the originating view and denies the popup', () => {
    const { handler, loads } = build();
    const url = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc';
    assert.deepStrictEqual(handler({ url }), { action: 'deny' });
    assert.deepStrictEqual(loads, [url]);
  });

  it('denies a meeting-join popup without loading when in-app join is off', () => {
    const { handler, loads } = build({
      config: { onNewWindowOpenMeetupJoinUrlInApp: false },
    });
    const url = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc';
    assert.deepStrictEqual(handler({ url }), { action: 'deny' });
    assert.deepStrictEqual(loads, []);
  });

  it("leaves everything else on Electron's default allow (ordinary links, about:blank, login popups)", () => {
    const { handler, loads } = build();
    for (const url of [
      'https://example.com/doc',
      'about:blank',
      'about:blank#blocked',
      'https://login.microsoftonline.com/common/oauth2',
      'https://login.microsoftonline.us/common/oauth2',
      'https://adfs.example.org/adfs/ls/',
    ]) {
      assert.deepStrictEqual(handler({ url }), { action: 'allow' }, url);
    }
    assert.deepStrictEqual(loads, []);
  });

  it('the default meetupJoinRegEx also captures other Teams deep links (chat, channel) — documented blast radius', () => {
    const { handler, loads } = build({
      config: { meetupJoinRegEx: defaults.meetupJoinRegEx },
    });
    const chat = 'https://teams.microsoft.com/l/chat/0/0?users=someone';
    assert.deepStrictEqual(handler({ url: chat }), { action: 'deny' });
    assert.deepStrictEqual(loads, [chat]);
  });

  it('tolerates a missing meetupJoinRegEx and malformed details', () => {
    const { handler, loads } = build({ config: { meetupJoinRegEx: '' } });
    assert.deepStrictEqual(handler({}), { action: 'allow' });
    assert.deepStrictEqual(handler(null), { action: 'allow' });
    assert.strictEqual(loads.length, 0);
  });
});

describe('installProfileWindowOpenHandler', () => {
  function fakeWc() {
    return {
      loads: [],
      destroyed: false,
      handler: null,
      setWindowOpenHandler(fn) {
        this.handler = fn;
      },
      loadURL(url, opts) {
        this.loads.push({ url, opts });
      },
      isDestroyed() {
        return this.destroyed;
      },
    };
  }
  const config = {
    meetupJoinRegEx: MEETUP_RE,
    onNewWindowOpenMeetupJoinUrlInApp: true,
    chromeUserAgent: 'UA/1',
  };
  const meeting = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc';

  it('installs on the target but loads deep links into the ORIGINATING view, then activates it', () => {
    const popup = fakeWc();
    const profileView = fakeWc();
    let activated = 0;
    installProfileWindowOpenHandler(popup, {
      config,
      loadTargetWebContents: profileView,
      activate: () => activated++,
    });
    assert.deepStrictEqual(popup.handler({ url: meeting }), { action: 'deny' });
    assert.deepStrictEqual(popup.loads, []);
    assert.deepStrictEqual(profileView.loads, [
      { url: meeting, opts: { userAgent: 'UA/1' } },
    ]);
    assert.strictEqual(activated, 1);
  });

  it('defaults the load target to the target itself', () => {
    const view = fakeWc();
    installProfileWindowOpenHandler(view, { config });
    view.handler({ url: meeting });
    assert.strictEqual(view.loads.length, 1);
  });

  it('does not load into (or activate for) a destroyed originating view', () => {
    const popup = fakeWc();
    const profileView = fakeWc();
    profileView.destroyed = true;
    let activated = 0;
    installProfileWindowOpenHandler(popup, {
      config,
      loadTargetWebContents: profileView,
      activate: () => activated++,
    });
    assert.deepStrictEqual(popup.handler({ url: meeting }), { action: 'deny' });
    assert.deepStrictEqual(profileView.loads, []);
    assert.strictEqual(activated, 0);
  });
});
