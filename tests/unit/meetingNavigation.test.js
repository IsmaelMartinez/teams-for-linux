const test = require("node:test");
const assert = require("node:assert");

const MeetingNavigation = require("../../app/menus/meetingNavigation");

const CONFIG = {
  url: "https://teams.cloud.microsoft",
  chromeUserAgent: "UA",
  meetupJoinRegEx: String.raw`^https://teams\.(?:microsoft\.com|live\.com|cloud\.microsoft)/(meet/|l/meetup-join/)`,
};
const MEETING = "https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc/0?context=%7B%7D";

class FakeWebContents {
  constructor(url) {
    this.url = url;
    this.scripts = [];
    this.loads = [];
    this.destroyed = false;
  }
  getURL() {
    return this.url;
  }
  isDestroyed() {
    return this.destroyed;
  }
  async executeJavaScript(script) {
    this.scripts.push(script);
  }
  async loadURL(url, options) {
    this.loads.push({ url, options });
  }
}

function build(t, initialTarget) {
  t.mock.method(console, "error", () => {});
  const state = { target: initialTarget, shown: 0, errors: [] };
  const nav = new MeetingNavigation({
    getTarget: () => state.target,
    getConfig: () => CONFIG,
    showWindow: () => {
      state.shown += 1;
    },
    showError: (title, message) => state.errors.push([title, message]),
  });
  return { nav, state };
}

test("Join Meeting navigates the target it is given, in the Teams origin", async (t) => {
  const view = new FakeWebContents("https://teams.cloud.microsoft/v2/");
  const { nav, state } = build(t, view);

  await nav.join(MEETING);

  assert.strictEqual(view.scripts.length, 1);
  assert.match(view.scripts[0], /teams\.cloud\.microsoft\/l\/meetup-join\/19%3ameeting_abc\/0/);
  assert.strictEqual(state.shown, 1);
  assert.deepStrictEqual(state.errors, []);
});

test("Join Meeting acts on the active view, not the root window", async (t) => {
  const root = new FakeWebContents("https://teams.cloud.microsoft/root");
  const view = new FakeWebContents("https://teams.cloud.microsoft/profile-2");
  const { nav } = build(t, view);

  await nav.join(MEETING);

  assert.strictEqual(view.scripts.length, 1);
  assert.strictEqual(root.scripts.length, 0);
});

test("the Return-to-Teams snapshot is the active view's page, and Return loads it back there", async (t) => {
  const root = new FakeWebContents("https://teams.cloud.microsoft/root-page");
  const view = new FakeWebContents("https://teams.cloud.microsoft/v2/profile-2-page");
  const { nav, state } = build(t, view);

  await nav.join(MEETING);
  await nav.returnToTeams();

  assert.deepStrictEqual(view.loads, [
    { url: "https://teams.cloud.microsoft/v2/profile-2-page", options: { userAgent: "UA" } },
  ]);
  assert.deepStrictEqual(root.loads, []);
  assert.strictEqual(state.shown, 2);
});

test("Return to Teams goes back to the surface that joined, after a profile switch", async (t) => {
  const viewA = new FakeWebContents("https://teams.cloud.microsoft/a");
  const viewB = new FakeWebContents("https://teams.cloud.microsoft/b");
  const { nav, state } = build(t, viewA);

  await nav.join(MEETING);
  state.target = viewB;
  await nav.returnToTeams();

  assert.strictEqual(viewA.loads.length, 1);
  assert.strictEqual(viewA.loads[0].url, "https://teams.cloud.microsoft/a");
  assert.deepStrictEqual(viewB.loads, []);
});

test("Return to Teams does not apply a removed profile's snapshot to the active one", async (t) => {
  const viewA = new FakeWebContents("https://teams.cloud.microsoft/a");
  const viewB = new FakeWebContents("https://teams.cloud.microsoft/b");
  const { nav, state } = build(t, viewA);

  await nav.join(MEETING);
  viewA.destroyed = true; // profile A was removed
  state.target = viewB;
  await nav.returnToTeams();

  assert.deepStrictEqual(viewB.loads, [{ url: CONFIG.url, options: { userAgent: "UA" } }]);
  assert.ok(!viewB.loads.some((load) => load.url.endsWith("/a")), "A's page never reaches B");

  await nav.returnToTeams();
  assert.strictEqual(viewB.loads[1].url, CONFIG.url, "the discarded snapshot stays gone");
});

test("a second join from a meeting page keeps the first snapshot, as before", async (t) => {
  const view = new FakeWebContents("https://teams.cloud.microsoft/chat");
  const { nav } = build(t, view);

  await nav.join(MEETING);
  view.url = MEETING;
  await nav.join(MEETING);
  await nav.returnToTeams();

  assert.strictEqual(view.loads[0].url, "https://teams.cloud.microsoft/chat");
});

test("joining on another surface from a meeting page does not reuse the first surface's snapshot", async (t) => {
  const viewA = new FakeWebContents("https://teams.cloud.microsoft/a-chat");
  const viewB = new FakeWebContents(MEETING);
  const { nav, state } = build(t, viewA);

  await nav.join(MEETING);
  state.target = viewB;
  await nav.join(MEETING);
  await nav.returnToTeams();

  assert.deepStrictEqual(viewA.loads, []);
  assert.strictEqual(viewB.loads[0].url, CONFIG.url, "falls back to the configured Teams URL");
});

test("an invalid meeting URL reports an error and touches no surface", async (t) => {
  const view = new FakeWebContents("https://teams.cloud.microsoft/");
  const { nav, state } = build(t, view);

  await nav.join("https://example.com/not-a-meeting");

  assert.deepStrictEqual(view.scripts, []);
  assert.strictEqual(state.errors.length, 1);
});

test("Return to Teams without a snapshot loads the configured URL", async (t) => {
  const view = new FakeWebContents("https://teams.cloud.microsoft/");
  const { nav } = build(t, view);

  await nav.returnToTeams();

  assert.deepStrictEqual(view.loads, [{ url: CONFIG.url, options: { userAgent: "UA" } }]);
});
