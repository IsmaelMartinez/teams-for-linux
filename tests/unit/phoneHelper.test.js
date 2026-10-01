const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { runBackend } = require("../../app/webauthn/phoneHelper");

function fakeProcess() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stdin = new PassThrough();
  child.kill = () => { child.killed = true; };
  return child;
}

test("helper protocol handles fragmented NDJSON without shell or argument credentials", async () => {
  const child = fakeProcess();
  const qr = [];
  const promise = runBackend({ helperPath: "/helper", request: { origin: "https://login.microsoft.com" }, timeout: 1000,
    onQr: value => qr.push(value), spawnProcess: (file, args, options) => {
      assert.equal(file, "/helper"); assert.deepEqual(args, []); assert.equal(options.shell, undefined); return child;
    } });
  child.stdout.write('{"type":"qr","svg":"<svg/>"}\n{"type":"res');
  child.stdout.write('ult","credential":{"id":"AQID","type":"public-key","response":{}}}\n');
  assert.equal((await promise).id, "AQID");
  assert.deepEqual(qr, ["<svg/>"]);
  assert.equal(child.killed, true);
});

test("cancellation terminates the helper and returns AbortError", async () => {
  const child = fakeProcess(); const controller = new AbortController();
  const promise = runBackend({ helperPath: "/helper", request: {}, timeout: 1000,
    signal: controller.signal, onQr: () => {}, spawnProcess: () => child });
  controller.abort();
  await assert.rejects(promise, { name: "AbortError" });
  assert.equal(child.killed, true);
});

test("invalid helper output and excess output fail closed", async () => {
  for (const output of ["not json\n", "x".repeat(1024 * 1024 + 1), '{"type":"unexpected"}\n']) {
    const child = fakeProcess();
    const promise = runBackend({ helperPath: "/helper", request: {}, timeout: 1000,
      onQr: () => {}, spawnProcess: () => child });
    child.stdout.write(output);
    await assert.rejects(promise, { name: "OperationError" });
    assert.equal(child.killed, true);
  }
});

test("timeout and premature exit reject instead of leaving a pending sign-in", async () => {
  const child = fakeProcess();
  await assert.rejects(runBackend({ helperPath: "/helper", request: {}, timeout: 5,
    onQr: () => {}, spawnProcess: () => child }), { name: "NotAllowedError" });
  assert.equal(child.killed, true);
  const early = fakeProcess();
  const promise = runBackend({ helperPath: "/helper", request: {}, timeout: 1000,
    onQr: () => {}, spawnProcess: () => early });
  early.emit("close", 1);
  await assert.rejects(promise, { name: "NotAllowedError" });
});
