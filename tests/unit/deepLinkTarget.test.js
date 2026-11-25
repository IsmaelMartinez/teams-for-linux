const test = require("node:test");
const assert = require("node:assert");

const { createDeepLinkTarget } = require("../../app/mainAppWindow/deepLinkTarget");

const wc = (name, destroyed = false) => ({ name, isDestroyed: () => destroyed });

test("with no getter injected (multi-account off) the root window is the target", () => {
  const root = wc("root");
  const target = createDeepLinkTarget(() => root);

  assert.strictEqual(target.resolve(), root);
});

test("an injected getter aims links at the active profile's webContents", () => {
  const root = wc("root");
  const view = wc("profile-b view");
  const target = createDeepLinkTarget(() => root);
  target.set(() => view);

  assert.strictEqual(target.resolve(), view);
});

test("the getter is asked afresh each time, so a profile switch moves later links", () => {
  const root = wc("root");
  const a = wc("a");
  const b = wc("b");
  let active = a;
  const target = createDeepLinkTarget(() => root);
  target.set(() => active);

  assert.strictEqual(target.resolve(), a);
  active = b;
  assert.strictEqual(target.resolve(), b);
});

test("a null answer falls back to the root window", () => {
  const root = wc("root");
  const target = createDeepLinkTarget(() => root);
  target.set(() => null);

  assert.strictEqual(target.resolve(), root);
});

test("a destroyed answer falls back to the root window", () => {
  const root = wc("root");
  const target = createDeepLinkTarget(() => root);
  target.set(() => wc("gone", true));

  assert.strictEqual(target.resolve(), root);
});

test("a throwing getter falls back to the root window", (t) => {
  t.mock.method(console, "debug", () => {});
  const root = wc("root");
  const target = createDeepLinkTarget(() => root);
  target.set(() => {
    throw new Error("Object has been destroyed");
  });

  assert.strictEqual(target.resolve(), root);
});

test("clearing the getter returns links to the root window", () => {
  const root = wc("root");
  const target = createDeepLinkTarget(() => root);
  target.set(() => wc("view"));
  target.set(null);

  assert.strictEqual(target.resolve(), root);
});

test("isInstalled is false until a getter is set, and false again once cleared", () => {
  const target = createDeepLinkTarget(() => wc("root"));

  assert.strictEqual(target.isInstalled(), false);
  target.set(() => wc("view"));
  assert.strictEqual(target.isInstalled(), true);
  target.set(null);
  assert.strictEqual(target.isInstalled(), false);
});
