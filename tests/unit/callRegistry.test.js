const test = require("node:test");
const assert = require("node:assert");
const { EventEmitter } = require("node:events");

const { createCallRegistry } = require("../../app/mainAppWindow/callRegistry");

const sender = (id) => Object.assign(new EventEmitter(), { id });

test("a call is active from connect until that sender disconnects", () => {
  const registry = createCallRegistry();
  const root = sender(1);

  assert.strictEqual(registry.active, false);
  registry.connected(root);
  assert.strictEqual(registry.active, true);
  registry.disconnected(root);
  assert.strictEqual(registry.active, false);
});

test("one profile hanging up leaves another profile's call active", () => {
  const registry = createCallRegistry();
  const a = sender(1);
  const b = sender(2);
  registry.connected(a);
  registry.connected(b);

  registry.disconnected(a);

  assert.strictEqual(registry.active, true);
  registry.disconnected(b);
  assert.strictEqual(registry.active, false);
});

test("a sender's own navigation clears its entry only", () => {
  const registry = createCallRegistry();
  const a = sender(1);
  const b = sender(2);
  registry.connected(a);
  registry.connected(b);

  a.emit("did-navigate");
  assert.strictEqual(registry.active, true, "b is still in its call");
  b.emit("did-navigate");
  assert.strictEqual(registry.active, false);
});

test("a destroyed sender clears its entry", () => {
  const registry = createCallRegistry();
  const a = sender(1);
  registry.connected(a);

  a.emit("destroyed");

  assert.strictEqual(registry.active, false);
});

test("onIdle fires when the last entry leaves by navigation or destroy, not before", () => {
  let idle = 0;
  const registry = createCallRegistry({ onIdle: () => (idle += 1) });
  const a = sender(1);
  const b = sender(2);
  registry.connected(a);
  registry.connected(b);

  a.emit("did-navigate");
  assert.strictEqual(idle, 0, "b is still in a call");
  b.emit("destroyed");
  assert.strictEqual(idle, 1);
});

test("a disconnect does not fire onIdle: its handler decides what follows", () => {
  let idle = 0;
  const registry = createCallRegistry({ onIdle: () => (idle += 1) });
  const a = sender(1);
  registry.connected(a);

  registry.disconnected(a);
  a.emit("did-navigate");

  assert.strictEqual(idle, 0);
});

test("listeners are detached on disconnect and never stack on a repeated connect", () => {
  const registry = createCallRegistry();
  const a = sender(1);

  registry.connected(a);
  registry.connected(a);
  assert.strictEqual(a.listenerCount("did-navigate"), 1);
  assert.strictEqual(a.listenerCount("destroyed"), 1);
  registry.disconnected(a);
  assert.strictEqual(a.listenerCount("did-navigate"), 0);
  assert.strictEqual(a.listenerCount("destroyed"), 0);
});

test("activeIds lists the senders in a call, in connect order, until each leaves", () => {
  const registry = createCallRegistry();
  const a = sender(1);
  const b = sender(2);
  const c = sender(3);
  assert.deepStrictEqual(registry.activeIds(), []);
  registry.connected(a);
  registry.connected(b);
  registry.connected(c);
  assert.deepStrictEqual(registry.activeIds(), [1, 2, 3]);

  registry.disconnected(a);
  b.emit("did-navigate");
  assert.deepStrictEqual(registry.activeIds(), [3]);
  c.emit("destroyed");
  assert.deepStrictEqual(registry.activeIds(), []);
});
