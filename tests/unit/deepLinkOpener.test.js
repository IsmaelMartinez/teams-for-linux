const test = require("node:test");
const assert = require("node:assert");
const { EventEmitter } = require("node:events");

const { createDeepLinkOpener } = require("../../app/mainAppWindow/deepLinkOpener");
const { createDeepLinkTarget } = require("../../app/mainAppWindow/deepLinkTarget");

const DELAY = 5000;
const LINK = "https://teams.cloud.microsoft/l/chat/0/0?users=a@b.com";
const CONFIG = { url: "https://teams.cloud.microsoft", chromeUserAgent: "UA" };

class FakeWebContents extends EventEmitter {
  constructor(name) {
    super();
    this.name = name;
    this.loads = [];
    this.destroyed = false;
  }
  isDestroyed() {
    return this.destroyed;
  }
  loadURL(url, options) {
    this.loads.push({ url, options });
    return Promise.resolve();
  }
  destroy() {
    this.destroyed = true;
  }
}

// Mirrors how app wires it: the root window's webContents unless multi-account
// injected a getter for the active profile.
function build(t, { routedBy = () => false } = {}) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  t.mock.method(console, "debug", () => {});
  t.mock.method(console, "info", () => {});
  const root = new FakeWebContents("root");
  const targets = createDeepLinkTarget(() => root);
  const state = { callActive: false };
  const routed = [];
  const router = {
    navigateInPage: async (webContents, url) => {
      routed.push(webContents);
      return routedBy(webContents, url);
    },
    focusCompose: async () => ({ focused: true, afterMs: 0 }),
  };
  const opener = createDeepLinkOpener({
    router,
    resolveTarget: targets.resolve,
    getConfig: () => CONFIG,
    isCallActive: () => state.callActive,
    deferDelayMs: DELAY,
  });
  return { root, targets, state, routed, opener, tick: (ms) => t.mock.timers.tick(ms) };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("flag off: a link the SPA declines is loaded into the root window", async (t) => {
  const { root, opener } = build(t);

  await opener.open(LINK);

  assert.deepStrictEqual(root.loads, [{ url: LINK, options: { userAgent: "UA" } }]);
});

test("flag on, profile 2 active: the link is routed and loaded in that view, not the root", async (t) => {
  const { root, targets, routed, opener } = build(t);
  const view = new FakeWebContents("profile-2");
  targets.set(() => view);

  await opener.open(LINK);

  assert.deepStrictEqual(routed, [view]);
  assert.deepStrictEqual(view.loads, [{ url: LINK, options: { userAgent: "UA" } }]);
  assert.deepStrictEqual(root.loads, []);
});

test("a link the active view's SPA consumes in page loads nothing anywhere", async (t) => {
  const { root, targets, opener } = build(t, { routedBy: () => true });
  const view = new FakeWebContents("profile-2");
  targets.set(() => view);

  await opener.open(LINK);

  assert.deepStrictEqual(view.loads, []);
  assert.deepStrictEqual(root.loads, []);
});

test("a null active target falls back to the root window", async (t) => {
  const { root, targets, opener } = build(t);
  targets.set(() => null);

  await opener.open(LINK);

  assert.strictEqual(root.loads.length, 1);
});

test("a destroyed active target falls back to the root window", async (t) => {
  const { root, targets, opener } = build(t);
  const gone = new FakeWebContents("gone");
  gone.destroy();
  targets.set(() => gone);

  await opener.open(LINK);

  assert.strictEqual(root.loads.length, 1);
  assert.deepStrictEqual(gone.loads, []);
});

test("a call defers the link on the view it was aimed at, and a profile switch does not move it", async (t) => {
  const { root, targets, state, opener, tick } = build(t);
  const viewA = new FakeWebContents("profile-a");
  const viewB = new FakeWebContents("profile-b");
  let active = viewA;
  targets.set(() => active);
  state.callActive = true;

  await opener.open(LINK);
  assert.strictEqual(opener.deferred.pending, true);
  assert.deepStrictEqual(viewA.loads, [], "nothing loads during the call");

  active = viewB; // the user switches profile while the link waits
  state.callActive = false;
  opener.deferred.release();
  tick(DELAY);
  await settle();

  assert.deepStrictEqual(viewA.loads, [{ url: LINK, options: { userAgent: "UA" } }]);
  assert.deepStrictEqual(viewB.loads, []);
  assert.deepStrictEqual(root.loads, []);
});

test("a target destroyed before the deferred release drops the link", async (t) => {
  const { root, targets, state, opener, tick } = build(t);
  const view = new FakeWebContents("profile-a");
  targets.set(() => view);
  state.callActive = true;
  await opener.open(LINK);

  view.destroy(); // the profile was removed during the call
  state.callActive = false;
  opener.deferred.release();
  tick(DELAY);
  await settle();

  assert.deepStrictEqual(view.loads, []);
  assert.deepStrictEqual(root.loads, [], "the link is dropped, not redirected to the root window");
  assert.strictEqual(opener.deferred.pending, false);
});

test("a navigation in the target cancels the link deferred for it", async (t) => {
  const { targets, state, opener, tick } = build(t);
  const view = new FakeWebContents("profile-a");
  targets.set(() => view);
  state.callActive = true;
  await opener.open(LINK);

  view.emit("did-navigate");
  state.callActive = false;
  opener.deferred.release();
  tick(DELAY);
  await settle();

  assert.strictEqual(opener.deferred.pending, false);
  assert.deepStrictEqual(view.loads, []);
});

test("a navigation in a different profile's view leaves the deferred link alone", async (t) => {
  const { targets, state, opener, tick } = build(t);
  const viewA = new FakeWebContents("profile-a");
  const viewB = new FakeWebContents("profile-b");
  targets.set(() => viewA);
  state.callActive = true;
  await opener.open(LINK);

  viewB.emit("did-navigate");
  state.callActive = false;
  opener.deferred.release();
  tick(DELAY);
  await settle();

  assert.strictEqual(viewA.loads.length, 1);
});

test("a newer link supersedes one held for another profile", async (t) => {
  const { targets, state, opener, tick } = build(t);
  const viewA = new FakeWebContents("profile-a");
  const viewB = new FakeWebContents("profile-b");
  let active = viewA;
  targets.set(() => active);
  state.callActive = true;
  await opener.open("https://teams.cloud.microsoft/l/chat/0/0?users=old@b.com");

  active = viewB;
  await opener.open(LINK);
  state.callActive = false;
  opener.deferred.release();
  tick(DELAY);
  await settle();

  assert.deepStrictEqual(viewA.loads, []);
  assert.deepStrictEqual(viewB.loads, [{ url: LINK, options: { userAgent: "UA" } }]);
});

test("a target destroyed while in-page routing awaited drops the fallback instead of throwing", async (t) => {
  const { root, targets, opener } = build(t, {
    routedBy: (webContents) => {
      webContents.destroy();
      return false;
    },
  });
  const view = new FakeWebContents("profile-a");
  targets.set(() => view);

  await opener.open(LINK);

  assert.deepStrictEqual(view.loads, []);
  assert.deepStrictEqual(root.loads, []);
});

test("an explicit target is used as given, even if the active profile has changed since", async (t) => {
  const { root, targets, opener } = build(t);
  const pinned = new FakeWebContents("pinned");
  targets.set(() => new FakeWebContents("other"));

  await opener.open(LINK, pinned);

  assert.strictEqual(pinned.loads.length, 1);
  assert.deepStrictEqual(root.loads, []);
});

test("no debug line carries the link", async (t) => {
  const lines = [];
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const sink = (...args) => lines.push(args.join(" "));
  t.mock.method(console, "debug", sink);
  t.mock.method(console, "info", sink);
  const root = new FakeWebContents("root");
  const opener = createDeepLinkOpener({
    router: { navigateInPage: async () => false, focusCompose: async () => ({}) },
    resolveTarget: () => root,
    getConfig: () => CONFIG,
    isCallActive: () => true,
    deferDelayMs: DELAY,
  });
  await opener.open(LINK);
  root.destroy();
  opener.deferred.release();
  t.mock.timers.tick(DELAY);
  await settle();

  assert.ok(lines.length > 0);
  for (const line of lines) {
    assert.ok(!line.includes("a@b.com") && !line.includes("teams.cloud"), line);
  }
});
