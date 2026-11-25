const test = require("node:test");
const assert = require("node:assert");

const { DeferredDeepLink } = require("../../app/mainAppWindow/deferredDeepLink");

const DELAY = 5000;

function build(t) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const opened = [];
  const link = new DeferredDeepLink((url) => opened.push(url), DELAY);
  return { link, opened, tick: (ms) => t.mock.timers.tick(ms) };
}

test("a deferred link opens once, after the delay that follows the call", (t) => {
  const { link, opened, tick } = build(t);

  link.defer("https://teams.cloud.microsoft/l/a");
  assert.strictEqual(link.pending, true);
  tick(DELAY * 2);
  assert.deepStrictEqual(opened, [], "nothing opens while the call is still on");

  link.release();
  link.release();
  tick(DELAY - 1);
  assert.deepStrictEqual(opened, []);
  tick(1);
  assert.deepStrictEqual(opened, ["https://teams.cloud.microsoft/l/a"]);
  assert.strictEqual(link.pending, false);
  tick(DELAY);
  assert.strictEqual(opened.length, 1, "a second release does not open it twice");
});

test("the newest deferred link replaces the one already waiting", (t) => {
  const { link, opened, tick } = build(t);

  link.defer("https://teams.cloud.microsoft/l/old");
  link.defer("https://teams.cloud.microsoft/l/new");
  link.release();
  tick(DELAY);

  assert.deepStrictEqual(opened, ["https://teams.cloud.microsoft/l/new"]);
});

test("cancel drops a link that is still waiting for the call to end", (t) => {
  const { link, opened, tick } = build(t);

  link.defer("https://teams.cloud.microsoft/l/a");
  link.cancel();
  assert.strictEqual(link.pending, false);
  link.release();
  tick(DELAY);

  assert.deepStrictEqual(opened, []);
});

test("cancel still reaches a link already released", (t) => {
  // A navigation inside the teardown delay (a reload, auth recovery, a newer
  // link) must win over the link about to open.
  const { link, opened, tick } = build(t);

  link.defer("https://teams.cloud.microsoft/l/a");
  link.release();
  tick(DELAY - 1);
  link.cancel();
  tick(DELAY);

  assert.deepStrictEqual(opened, []);
  assert.strictEqual(link.pending, false);
});

test("release with nothing waiting is a no-op", (t) => {
  const { link, opened, tick } = build(t);

  link.release();
  tick(DELAY);

  assert.deepStrictEqual(opened, []);
});

test("the slot is free again by the time the link opens", (t) => {
  // Opening can decline again (a new call started inside the delay) and
  // defer the same link back: that must not be wiped by the opening itself.
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const opened = [];
  const link = new DeferredDeepLink((url) => {
    opened.push(url);
    if (opened.length === 1) link.defer(url);
  }, DELAY);

  link.defer("https://teams.cloud.microsoft/l/a");
  link.release();
  t.mock.timers.tick(DELAY);
  assert.strictEqual(link.pending, true, "re-deferred from inside open");
  link.release();
  t.mock.timers.tick(DELAY);

  assert.strictEqual(opened.length, 2);
});

test("a link opens on the surface it was held for", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const opened = [];
  const link = new DeferredDeepLink((url, target) => opened.push([url, target]), DELAY);
  const target = new (require("node:events").EventEmitter)();

  link.defer("https://teams.cloud.microsoft/l/a", target);
  link.release();
  t.mock.timers.tick(DELAY);

  assert.deepStrictEqual(opened, [["https://teams.cloud.microsoft/l/a", target]]);
  assert.strictEqual(target.listenerCount("did-navigate"), 0, "no listener outlives the hold");
});

test("a navigation of the held surface cancels the link; cancel and replace drop the listener", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const opened = [];
  const link = new DeferredDeepLink((url) => opened.push(url), DELAY);
  const { EventEmitter } = require("node:events");
  const first = new EventEmitter();
  const second = new EventEmitter();

  link.defer("https://teams.cloud.microsoft/l/a", first);
  assert.strictEqual(first.listenerCount("did-navigate"), 1);
  first.emit("did-navigate");
  assert.strictEqual(link.pending, false);
  assert.strictEqual(first.listenerCount("did-navigate"), 0);

  link.defer("https://teams.cloud.microsoft/l/b", first);
  link.defer("https://teams.cloud.microsoft/l/c", second);
  assert.strictEqual(first.listenerCount("did-navigate"), 0, "replacing a hold releases its surface");
  link.cancel();
  assert.strictEqual(second.listenerCount("did-navigate"), 0);

  link.release();
  t.mock.timers.tick(DELAY);
  assert.deepStrictEqual(opened, []);
});
