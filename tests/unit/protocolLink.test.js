/**
 * Unit tests for the web+msteams: launch argument normalisation.
 *
 * Run with: node --test tests/unit/protocolLink.test.js
 *
 * Teams' launcher page uses `web+msteams:` instead of `msteams:` when a
 * server-side flag is on. The app has to register the scheme and treat the link
 * like its `msteams:` form.
 */

const test = require("node:test");
const assert = require("node:assert");

const { PROTOCOL_SCHEMES, stripWebPrefix } = require("../../app/mainAppWindow/protocolLink");
const pkg = require("../../package.json");

// Default patterns from app/config/options.js
const v1Pattern = /^msteams:\/(?:meet\/|l\/(?:app|call|channel|chat|entity|file|meet(?:ing|up-join)|message|task|team)\/)/;
const v2Pattern = /^msteams:\/\/teams\.(?:microsoft\.com|live\.com|cloud\.microsoft)\/(?:meet\/|l\/(?:app|call|channel|chat|entity|file|meet(?:ing|up-join)|message|task|team)\/)/;

const LAUNCHER_QUERY =
  "launchAgent=join_launcher&type=meet&directDl=true&msLaunch=true&enableMobilePage=true&suppressPrompt=true&fqdn=teams.microsoft.com";

test("stripWebPrefix turns a web+msteams v1 link into the msteams form", () => {
  assert.strictEqual(
    stripWebPrefix(`web+msteams:/meet/abc123?p=pass&${LAUNCHER_QUERY}`),
    `msteams:/meet/abc123?p=pass&${LAUNCHER_QUERY}`
  );
});

test("stripWebPrefix turns a web+msteams v2 link into the msteams form", () => {
  assert.strictEqual(
    stripWebPrefix("web+msteams://teams.live.com/meet/abc123?p=pass"),
    "msteams://teams.live.com/meet/abc123?p=pass"
  );
});

test("stripWebPrefix ignores the case of the scheme", () => {
  assert.strictEqual(stripWebPrefix("WEB+MSTEAMS:/meet/abc123"), "MSTEAMS:/meet/abc123");
});

test("stripWebPrefix leaves other arguments untouched", () => {
  const untouched = [
    "msteams:/meet/abc123",
    "msteams://teams.microsoft.com/meet/abc123",
    "https://teams.microsoft.com/meet/abc123",
    "web+other:/meet/abc123",
    "web+msteams",
    "--ozone-platform=x11",
    "/opt/teams-for-linux/teams-for-linux",
    "",
  ];
  for (const arg of untouched) {
    assert.strictEqual(stripWebPrefix(arg), arg);
  }
});

test("stripWebPrefix only strips a leading prefix", () => {
  const arg = "https://example.com/?next=web+msteams:/meet/abc123";
  assert.strictEqual(stripWebPrefix(arg), arg);
});

test("stripWebPrefix passes non-string values through", () => {
  assert.strictEqual(stripWebPrefix(undefined), undefined);
  assert.strictEqual(stripWebPrefix(null), null);
});

test("a normalised web+msteams v1 link matches the default v1 pattern", () => {
  const arg = stripWebPrefix(`web+msteams:/meet/abc123?p=pass&${LAUNCHER_QUERY}`);
  assert.strictEqual(v1Pattern.test(arg), true);
  // The unnormalised form is what processArgs used to ignore.
  assert.strictEqual(v1Pattern.test(`web+msteams:/meet/abc123`), false);
});

test("a normalised web+msteams v2 link matches the default v2 pattern", () => {
  const arg = stripWebPrefix("web+msteams://teams.live.com/meet/abc123?p=pass");
  assert.strictEqual(v2Pattern.test(arg), true);
  assert.strictEqual(v2Pattern.test("web+msteams://teams.live.com/meet/abc123"), false);
});

test("a normalised link resolves to the same URL as the msteams form", () => {
  const baseUrl = "https://teams.cloud.microsoft";
  const v1 = stripWebPrefix("web+msteams:/l/meetup-join/19:meeting_abc/0");
  assert.strictEqual(
    baseUrl + v1.substring(8, v1.length),
    "https://teams.cloud.microsoft/l/meetup-join/19:meeting_abc/0"
  );
  const v2 = stripWebPrefix("web+msteams://teams.microsoft.com/meet/abc123");
  assert.strictEqual(v2.replace("msteams", "https"), "https://teams.microsoft.com/meet/abc123");
});

test("the packaged protocol schemes match the schemes registered at runtime", () => {
  assert.deepStrictEqual(pkg.build.protocols.schemes, PROTOCOL_SCHEMES);
});

test("both launcher schemes are registered", () => {
  assert.ok(PROTOCOL_SCHEMES.includes("msteams"));
  assert.ok(PROTOCOL_SCHEMES.includes("web+msteams"));
});
