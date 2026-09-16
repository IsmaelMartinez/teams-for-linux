'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const ProfileUnreadAggregator = require('../../app/profileUnread');

// ADR-020 Phase 2: per-profile unread buckets → one authoritative tray/badge.
// The module is pure (all side effects injected), so the aggregation rules
// are asserted directly: badge = sum, tooltip = total + top-3, single-bucket
// look identical to today's, coalesced aggregate renders.

function senderEvent(id) {
  return { sender: { id } };
}

let applied;
let badges;
let renders;
let renderResult;

function build({ resolve = () => null, names = {}, primary = () => true } = {}) {
  applied = [];
  badges = [];
  renders = [];
  renderResult = () => Promise.resolve('data:agg');
  return new ProfileUnreadAggregator({
    resolveProfileId: resolve,
    isPrimarySender: primary,
    getProfileName: (id) => names[id] ?? null,
    requestBadgeRender: (count) => {
      renders.push(count);
      return renderResult(count);
    },
    applyTray: (update) => applied.push(update),
    applyBadgeCount: (count) => badges.push(count),
    appTitle: 'Teams',
  });
}

// applyTray is invoked from an async method; flush microtasks before asserting.
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('ProfileUnreadAggregator', () => {
  beforeEach(() => {
    applied = [];
  });

  it('single unattributed sender behaves like today: own icon, own flash, plain tooltip', async () => {
    const agg = build();
    agg.onTrayUpdate(senderEvent(1), { icon: 'data:one', flash: true, count: 5 });
    agg.onBadgeCount(senderEvent(1), 5);
    await settle();
    assert.deepStrictEqual(applied.at(-1), {
      icon: 'data:one',
      flash: true,
      tooltip: 'Teams (5)',
    });
    assert.deepStrictEqual(badges, [5]);
    assert.deepStrictEqual(renders, []); // no aggregate render on the single path
  });

  it('zero unread falls back to the base icon and stops flashing', async () => {
    const agg = build();
    agg.onTrayUpdate(senderEvent(1), { icon: 'data:one', flash: true, count: 5 });
    agg.onTrayUpdate(senderEvent(1), { icon: null, flash: false, count: 0 });
    agg.onBadgeCount(senderEvent(1), 0);
    await settle();
    assert.deepStrictEqual(applied.at(-1), {
      icon: null,
      flash: false,
      tooltip: 'Teams',
    });
    assert.strictEqual(badges.at(-1), 0);
  });

  it('two unread profiles: badge = sum, aggregate icon rendered, tooltip lists both', async () => {
    const resolve = (e) => ({ 1: 'p-a', 2: 'p-b' })[e.sender.id] ?? null;
    const agg = build({ resolve, names: { 'p-a': 'Work', 'p-b': 'Client' } });
    agg.onTrayUpdate(senderEvent(1), { icon: 'data:a', flash: true, count: 2 });
    agg.onTrayUpdate(senderEvent(2), { icon: 'data:b', flash: false, count: 7 });
    agg.onBadgeCount(senderEvent(2), 7);
    await settle();
    assert.deepStrictEqual(renders, [9]);
    assert.deepStrictEqual(applied.at(-1), {
      icon: 'data:agg',
      flash: true, // OR across buckets
      tooltip: 'Teams (9)\nClient: 7\nWork: 2',
    });
    assert.strictEqual(badges.at(-1), 9);
  });

  it('tooltip lists at most the top-3 profiles by count', async () => {
    const map = { 1: 'p1', 2: 'p2', 3: 'p3', 4: 'p4' };
    const agg = build({
      resolve: (e) => map[e.sender.id],
      names: { p1: 'A', p2: 'B', p3: 'C', p4: 'D' },
    });
    for (const [id, count] of [[1, 1], [2, 4], [3, 3], [4, 2]]) {
      agg.onTrayUpdate(senderEvent(id), { icon: 'i', flash: false, count });
    }
    await settle();
    assert.strictEqual(applied.at(-1).tooltip, 'Teams (10)\nB: 4\nC: 3\nD: 2');
  });

  it('an unattributed bucket joins the sum but never the name lines', async () => {
    const resolve = (e) => (e.sender.id === 1 ? 'p-a' : null);
    const agg = build({ resolve, names: { 'p-a': 'Work' } });
    agg.onTrayUpdate(senderEvent(1), { icon: 'data:a', flash: false, count: 2 });
    agg.onTrayUpdate(senderEvent(9), { icon: 'data:x', flash: false, count: 3 });
    await settle();
    const last = applied.at(-1);
    assert.strictEqual(last.icon, 'data:agg');
    assert.strictEqual(last.tooltip, 'Teams (5)\nWork: 2');
  });

  it('a sender that becomes attributable stops double-counting its unattributed bucket', async () => {
    // The root window before Profile 0 bootstrap, then after.
    let bootstrapped = false;
    const resolve = (e) =>
      e.sender.id === 7 && bootstrapped ? 'p-0' : null;
    const agg = build({ resolve, names: { 'p-0': 'My account' } });
    agg.onTrayUpdate(senderEvent(7), { icon: 'data:r', flash: false, count: 3 });
    bootstrapped = true;
    agg.onTrayUpdate(senderEvent(7), { icon: 'data:r', flash: false, count: 3 });
    agg.onBadgeCount(senderEvent(7), 3);
    await settle();
    assert.strictEqual(badges.at(-1), 3); // not 6
    assert.strictEqual(applied.at(-1).tooltip, 'Teams (3)');
  });

  it('removeProfile drops the bucket and recomputes badge and tray', async () => {
    const resolve = (e) => ({ 1: 'p-a', 2: 'p-b' })[e.sender.id];
    const agg = build({ resolve, names: { 'p-a': 'Work', 'p-b': 'Client' } });
    agg.onTrayUpdate(senderEvent(1), { icon: 'data:a', flash: true, count: 2 });
    agg.onTrayUpdate(senderEvent(2), { icon: 'data:b', flash: false, count: 7 });
    await settle();
    agg.removeProfile('p-b');
    await settle();
    assert.strictEqual(badges.at(-1), 2);
    // Back to a single bucket: that profile's own icon, no aggregate render.
    assert.deepStrictEqual(applied.at(-1), {
      icon: 'data:a',
      flash: true,
      tooltip: 'Teams (2)',
    });
  });

  it('falls back on render failure: highest-count bucket icon, then last badged icon — never the bare base', async () => {
    const resolve = (e) => ({ 1: 'p-a', 2: 'p-b' })[e.sender.id];
    const agg = build({ resolve, names: { 'p-a': 'A', 'p-b': 'B' } });
    agg.onTrayUpdate(senderEvent(1), { icon: 'data:a', flash: false, count: 1 });
    agg.onTrayUpdate(senderEvent(2), { icon: 'data:b', flash: false, count: 1 });
    await settle();
    assert.strictEqual(applied.at(-1).icon, 'data:agg');
    renderResult = () => Promise.resolve(null); // renderer unavailable
    agg.onTrayUpdate(senderEvent(2), { icon: 'data:b2', flash: false, count: 2 });
    await settle();
    // Highest-count bucket (B, 2) still has its own composited icon.
    assert.strictEqual(applied.at(-1).icon, 'data:b2');
    assert.strictEqual(applied.at(-1).tooltip, 'Teams (3)\nB: 2\nA: 1');
    // Buckets without icons → the last badge-carrying icon, not null.
    agg.onTrayUpdate(senderEvent(1), { icon: null, flash: false, count: 3 });
    agg.onTrayUpdate(senderEvent(2), { icon: null, flash: false, count: 4 });
    await settle();
    assert.strictEqual(applied.at(-1).icon, 'data:b2');
  });

  it('ignores updates from non-primary surfaces (a popped-out chat must not zero its profile)', async () => {
    const resolve = (e) => 'p-a'; // popup attributes to the same profile
    const agg = build({
      resolve,
      names: { 'p-a': 'Work' },
      primary: (e) => e.sender.id === 1, // only the view is primary
    });
    agg.onTrayUpdate(senderEvent(1), { icon: 'data:a', flash: true, count: 5 });
    agg.onBadgeCount(senderEvent(1), 5);
    // The pop-out's title scrapes to 0 — must be ignored, not applied.
    agg.onTrayUpdate(senderEvent(77), { icon: null, flash: false, count: 0 });
    agg.onBadgeCount(senderEvent(77), 0);
    await settle();
    assert.strictEqual(badges.at(-1), 5);
    assert.deepStrictEqual(applied.at(-1), {
      icon: 'data:a',
      flash: true,
      tooltip: 'Teams (5)',
    });
  });

  it('a legacy tray-update without a count leaves the stored count alone', async () => {
    const agg = build({ resolve: () => 'p-a', names: { 'p-a': 'Work' } });
    agg.onTrayUpdate(senderEvent(1), { icon: 'data:a', flash: false, count: 4 });
    agg.onTrayUpdate(senderEvent(1), { icon: 'data:a2', flash: true }); // old format
    agg.onBadgeCount(senderEvent(1), 4);
    await settle();
    assert.strictEqual(badges.at(-1), 4);
    assert.deepStrictEqual(applied.at(-1), {
      icon: 'data:a2',
      flash: true,
      tooltip: 'Teams (4)',
    });
  });

  it('an out-of-band badge change re-renders the single-profile icon (stored one shows the old number)', async () => {
    const agg = build({ resolve: () => 'p-a', names: { 'p-a': 'Work' } });
    agg.onTrayUpdate(senderEvent(1), { icon: 'data:a', flash: false, count: 2 });
    await settle();
    assert.deepStrictEqual(renders, []); // organic path: stored icon reused
    assert.strictEqual(applied.at(-1).icon, 'data:a');
    agg.onBadgeCount(senderEvent(1), 6); // page script calling setBadgeCount directly
    await settle();
    assert.strictEqual(badges.at(-1), 6);
    assert.strictEqual(applied.at(-1).tooltip, 'Teams (6)');
    // The stored icon has "2" baked in — a re-render with 6 was requested.
    assert.deepStrictEqual(renders, [6]);
    assert.strictEqual(applied.at(-1).icon, 'data:agg');
  });

  it('a throwing dependency never escapes #refreshTray (fatal unhandledRejection policy)', async () => {
    const agg = build({ resolve: () => { throw new Error('store corrupt'); } });
    // resolveProfileId throws inside the refresh path — must be swallowed.
    assert.doesNotThrow(() =>
      agg.onTrayUpdate(senderEvent(1), { icon: 'i', flash: false, count: 1 })
    );
    await settle();
  });

  it('coalesces renders: a stale render never overwrites a newer state', async () => {
    const resolve = (e) => ({ 1: 'p-a', 2: 'p-b' })[e.sender.id];
    const agg = build({ resolve, names: { 'p-a': 'A', 'p-b': 'B' } });
    const gates = [];
    renderResult = () =>
      new Promise((resolveRender) => gates.push(resolveRender));
    agg.onTrayUpdate(senderEvent(1), { icon: 'data:a', flash: false, count: 1 });
    agg.onTrayUpdate(senderEvent(2), { icon: 'data:b', flash: false, count: 1 }); // render #1 pending
    agg.onTrayUpdate(senderEvent(2), { icon: 'data:b', flash: false, count: 5 }); // render #2 pending
    assert.strictEqual(gates.length, 2);
    gates[1]('data:new');
    await settle();
    gates[0]('data:stale');
    await settle();
    assert.strictEqual(applied.at(-1).icon, 'data:new');
    assert.strictEqual(applied.filter((u) => u.icon === 'data:stale').length, 0);
  });
});
