/**
 * Unit tests for web+msteams: launch argument handling.
 *
 * Run with: node --test tests/unit/protocolLink.test.js
 *
 * Teams' launcher page uses `web+msteams:` instead of `msteams:` when a
 * server-side flag is on. The app has to register the scheme and treat the link
 * like its `msteams:` form. The link tests go through `resolveLaunchUrl`, the
 * handler behind `processArgs`, with the real option defaults.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const {
  PROTOCOL_SCHEMES,
  stripWebPrefix,
  resolveLaunchUrl,
} = require("../../app/mainAppWindow/protocolLink");
const options = require("../../app/config/options");
const pkg = require("../../package.json");

const config = {
  msTeamsProtocols: options.msTeamsProtocols.default,
  meetupJoinRegEx: options.meetupJoinRegEx.default,
  url: options.url.default,
};

const LAUNCHER_QUERY =
  "launchAgent=join_launcher&type=meet&directDl=true&msLaunch=true&enableMobilePage=true&suppressPrompt=true&fqdn=teams.microsoft.com";

// resolveLaunchUrl logs every argument at debug level.
test.before(() => {
  test.mock.method(console, "debug", () => {});
});

// [web+ link, expected URL, description]
const webLinks = [
  [
    `web+msteams:/meet/abc123?p=pass&${LAUNCHER_QUERY}`,
    `${config.url}/meet/abc123?p=pass&${LAUNCHER_QUERY}`,
    "v1 short meet link as sent by the launcher",
  ],
  [
    "web+msteams:/l/meetup-join/19:meeting_abc/0",
    `${config.url}/l/meetup-join/19:meeting_abc/0`,
    "v1 meetup-join link",
  ],
  [
    "web+msteams://teams.live.com/meet/abc123?p=pass",
    "https://teams.live.com/meet/abc123?p=pass",
    "v2 short meet link on teams.live.com",
  ],
  [
    "web+msteams://teams.microsoft.com/l/meetup-join/19:meeting_abc/0",
    "https://teams.microsoft.com/l/meetup-join/19:meeting_abc/0",
    "v2 meetup-join link on teams.microsoft.com",
  ],
];

for (const [link, expected, description] of webLinks) {
  test(`resolveLaunchUrl opens a web+msteams ${description}`, () => {
    assert.strictEqual(resolveLaunchUrl([link], config), expected);
  });

  test(`resolveLaunchUrl resolves the web+msteams and msteams forms alike: ${description}`, () => {
    assert.strictEqual(
      resolveLaunchUrl([link], config),
      resolveLaunchUrl([link.replace("web+", "")], config)
    );
  });
}

test("resolveLaunchUrl ignores the case of the web+msteams scheme", () => {
  assert.strictEqual(
    resolveLaunchUrl(["WEB+msteams:/meet/abc123"], config),
    `${config.url}/meet/abc123`
  );
});

test("resolveLaunchUrl finds the link among other launch arguments", () => {
  const args = ["/opt/teams-for-linux/teams-for-linux", "--ozone-platform=x11", "web+msteams:/meet/abc123"];
  assert.strictEqual(resolveLaunchUrl(args, config), `${config.url}/meet/abc123`);
});

test("resolveLaunchUrl still opens plain msteams v1 and v2 links", () => {
  assert.strictEqual(resolveLaunchUrl(["msteams:/meet/abc123"], config), `${config.url}/meet/abc123`);
  assert.strictEqual(
    resolveLaunchUrl(["msteams://teams.microsoft.com/meet/abc123"], config),
    "https://teams.microsoft.com/meet/abc123"
  );
});

test("resolveLaunchUrl still opens an https Teams link as is", () => {
  const link = "https://teams.microsoft.com/meet/abc123?p=pass";
  assert.strictEqual(resolveLaunchUrl([link], config), link);
});

test("resolveLaunchUrl returns null when no argument is a Teams link", () => {
  const args = [
    "/opt/teams-for-linux/teams-for-linux",
    "--ozone-platform=x11",
    "web+other:/meet/abc123",
    "web+msteams:/other/path",
    "https://example.com/meet/abc123",
  ];
  assert.strictEqual(resolveLaunchUrl(args, config), null);
  assert.strictEqual(resolveLaunchUrl([], config), null);
});

test("resolveLaunchUrl opens the first Teams link when there are several", () => {
  const args = ["web+msteams:/meet/first", "msteams:/meet/second"];
  assert.strictEqual(resolveLaunchUrl(args, config), `${config.url}/meet/first`);
});

test("processArgs hands launch arguments to resolveLaunchUrl", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../app/mainAppWindow/index.js"), "utf8");
  assert.match(source, /resolveLaunchUrl\(args, config\)/);
});

test("stripWebPrefix turns a web+msteams link into the msteams form", () => {
  assert.strictEqual(stripWebPrefix("web+msteams:/meet/abc123"), "msteams:/meet/abc123");
  assert.strictEqual(
    stripWebPrefix("web+msteams://teams.live.com/meet/abc123"),
    "msteams://teams.live.com/meet/abc123"
  );
});

test("stripWebPrefix leaves other arguments untouched", () => {
  const untouched = [
    "msteams:/meet/abc123",
    "msteams://teams.microsoft.com/meet/abc123",
    "https://teams.microsoft.com/meet/abc123",
    "https://example.com/?next=web+msteams:/meet/abc123",
    "web+other:/meet/abc123",
    "web+msteams",
    "--ozone-platform=x11",
    "",
  ];
  for (const arg of untouched) {
    assert.strictEqual(stripWebPrefix(arg), arg);
  }
});

test("stripWebPrefix passes non-string values through", () => {
  assert.strictEqual(stripWebPrefix(undefined), undefined);
  assert.strictEqual(stripWebPrefix(null), null);
});

test("the packaged protocol schemes match the schemes registered at runtime", () => {
  assert.deepStrictEqual(pkg.build.protocols.schemes, PROTOCOL_SCHEMES);
});

test("both launcher schemes are registered", () => {
  assert.ok(PROTOCOL_SCHEMES.includes("msteams"));
  assert.ok(PROTOCOL_SCHEMES.includes("web+msteams"));
});
