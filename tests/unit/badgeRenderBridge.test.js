'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const {
  createBadgeRenderBridge,
} = require('../../app/profileUnread/badgeRenderBridge');

// The race- and security-sensitive half of aggregate badge rendering:
// request/reply matching by unguessable id AND sender identity, timeout,
// destroyed-target short-circuit, payload validation, send-throw tolerance.

let replyHandler;
let sent;

function fakeIpcMain() {
  return {
    on: (channel, handler) => {
      assert.strictEqual(channel, 'aggregate-badge-rendered');
      replyHandler = handler;
    },
  };
}

function fakeTarget(id) {
  return {
    id,
    destroyed: false,
    isDestroyed() {
      return this.destroyed;
    },
    send(channel, payload) {
      sent.push({ channel, payload });
    },
  };
}

beforeEach(() => {
  replyHandler = null;
  sent = [];
});

describe('createBadgeRenderBridge', () => {
  it('resolves a valid data:image reply from the asked webContents', async () => {
    const target = fakeTarget(5);
    const render = createBadgeRenderBridge({
      ipcMain: fakeIpcMain(),
      getTarget: () => target,
      timeoutMs: 1000,
    });
    const promise = render(9);
    const { requestId, count } = sent[0].payload;
    assert.strictEqual(count, 9);
    assert.match(requestId, /^[0-9a-f-]{36}$/); // unguessable, not sequential
    replyHandler({ sender: { id: 5 } }, { requestId, icon: 'data:image/png;base64,AAA' });
    assert.strictEqual(await promise, 'data:image/png;base64,AAA');
  });

  it('ignores a reply from a different webContents (spoof from another view)', async () => {
    const target = fakeTarget(5);
    const render = createBadgeRenderBridge({
      ipcMain: fakeIpcMain(),
      getTarget: () => target,
      timeoutMs: 30,
    });
    const promise = render(3);
    const { requestId } = sent[0].payload;
    replyHandler({ sender: { id: 99 } }, { requestId, icon: 'data:image/png;base64,EVIL' });
    assert.strictEqual(await promise, null); // falls through to the timeout
  });

  it('refuses a non-data-URL icon (filesystem path) and oversized payloads', async () => {
    const target = fakeTarget(5);
    const render = createBadgeRenderBridge({
      ipcMain: fakeIpcMain(),
      getTarget: () => target,
      timeoutMs: 1000,
    });
    const first = render(3);
    replyHandler({ sender: { id: 5 } }, { requestId: sent[0].payload.requestId, icon: '/etc/passwd' });
    assert.strictEqual(await first, null);

    const second = render(3);
    const huge = 'data:image/png;base64,' + 'A'.repeat(3 * 1024 * 1024);
    replyHandler({ sender: { id: 5 } }, { requestId: sent[1].payload.requestId, icon: huge });
    assert.strictEqual(await second, null);
  });

  it('resolves null on timeout and drops a late reply silently', async () => {
    const target = fakeTarget(5);
    const render = createBadgeRenderBridge({
      ipcMain: fakeIpcMain(),
      getTarget: () => target,
      timeoutMs: 10,
    });
    const promise = render(3);
    const { requestId } = sent[0].payload;
    assert.strictEqual(await promise, null);
    // Late reply after the timeout: no pending entry, must not throw.
    assert.doesNotThrow(() =>
      replyHandler({ sender: { id: 5 } }, { requestId, icon: 'data:image/png;base64,AAA' })
    );
  });

  it('resolves null for a missing or destroyed target', async () => {
    const gone = fakeTarget(5);
    gone.destroyed = true;
    for (const getTarget of [() => null, () => gone]) {
      const render = createBadgeRenderBridge({
        ipcMain: fakeIpcMain(),
        getTarget,
        timeoutMs: 1000,
      });
      assert.strictEqual(await render(3), null);
    }
  });

  it('resolves null when send throws (webContents died between isDestroyed and send)', async () => {
    const target = fakeTarget(5);
    target.send = () => {
      throw new Error('Object has been destroyed');
    };
    const render = createBadgeRenderBridge({
      ipcMain: fakeIpcMain(),
      getTarget: () => target,
      timeoutMs: 1000,
    });
    assert.strictEqual(await render(3), null);
  });

  it('keeps concurrent requests independent', async () => {
    const target = fakeTarget(5);
    const render = createBadgeRenderBridge({
      ipcMain: fakeIpcMain(),
      getTarget: () => target,
      timeoutMs: 1000,
    });
    const first = render(2);
    const second = render(3);
    replyHandler({ sender: { id: 5 } }, { requestId: sent[1].payload.requestId, icon: 'data:image/png;base64,B' });
    replyHandler({ sender: { id: 5 } }, { requestId: sent[0].payload.requestId, icon: 'data:image/png;base64,A' });
    assert.strictEqual(await first, 'data:image/png;base64,A');
    assert.strictEqual(await second, 'data:image/png;base64,B');
  });
});
