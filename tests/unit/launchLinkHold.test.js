const test = require("node:test");
const assert = require("node:assert");

const { createLaunchLinkHold } = require("../../app/mainAppWindow/launchLinkHold");

const LINK = "https://teams.cloud.microsoft/l/chat/0/0?users=a@b.com";
const isHttpsUrl = (url) => typeof url === "string" && url.startsWith("https://");

test("holds a link while the active profile's view is not ready, and hands it over once", () => {
  const hold = createLaunchLinkHold({ shouldHold: () => true, isHttpsUrl });

  assert.strictEqual(hold.offer(LINK), true);
  assert.strictEqual(hold.take(), LINK);
  assert.strictEqual(hold.take(), null);
});

test("holds nothing when the view is ready or multi-account is off", () => {
  const hold = createLaunchLinkHold({ shouldHold: () => false, isHttpsUrl });

  assert.strictEqual(hold.offer(LINK), false);
  assert.strictEqual(hold.take(), null);
});

test("holds nothing that is not https, or absent", () => {
  const hold = createLaunchLinkHold({ shouldHold: () => true, isHttpsUrl });

  assert.strictEqual(hold.offer("http://evil.example/"), false);
  assert.strictEqual(hold.offer(null), false);
  assert.strictEqual(hold.take(), null);
});

test("the newest link wins, and readiness is asked at each offer", () => {
  let ready = false;
  const hold = createLaunchLinkHold({ shouldHold: () => !ready, isHttpsUrl });

  hold.offer("https://teams.cloud.microsoft/l/chat/0/0?users=old@b.com");
  hold.offer(LINK);
  ready = true;
  assert.strictEqual(hold.offer("https://teams.cloud.microsoft/l/chat/0/0?users=late@b.com"), false);
  assert.strictEqual(hold.take(), LINK);
});
