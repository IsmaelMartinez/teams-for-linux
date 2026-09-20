const test = require("node:test");
const assert = require("node:assert");

const {
  toHashRoute,
  findRouterFrame,
  navigateInPage,
  focusCompose,
  focusComposeBox,
} = require("../../app/mainAppWindow/deepLinkRouter");

const TEAMS_URL = "https://teams.cloud.microsoft";
const TEAMS_ORIGIN = new URL(TEAMS_URL).origin;
const DEEP_LINK = "https://teams.cloud.microsoft/l/chat/0/0?users=a@b.com";
const MEETING_LINK =
  "https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=%7B%22Tid%22%3A%22t%22%7D";

test("toHashRoute moves a path-form launcher route into the fragment", () => {
  assert.strictEqual(toHashRoute(DEEP_LINK), "#/l/chat/0/0?users=a@b.com");
});

test("toHashRoute accepts the fragment form Teams redirects to", () => {
  assert.strictEqual(
    toHashRoute("https://teams.cloud.microsoft/#/l/chat/0/0?users=a@b.com"),
    "#/l/chat/0/0?users=a@b.com"
  );
});

test("toHashRoute tolerates a trailing slash", () => {
  assert.strictEqual(
    toHashRoute("https://teams.cloud.microsoft/l/chat/0/0/?users=a@b.com"),
    "#/l/chat/0/0?users=a@b.com"
  );
});

test("toHashRoute carries group recipients through untouched", () => {
  assert.strictEqual(
    toHashRoute(
      "https://teams.cloud.microsoft/l/chat/0/0?users=a@b.com,c@d.com"
    ),
    "#/l/chat/0/0?users=a@b.com,c@d.com"
  );
});

test("toHashRoute routes a meeting link with its context blob", () => {
  assert.strictEqual(
    toHashRoute(MEETING_LINK),
    "#/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=%7B%22Tid%22%3A%22t%22%7D"
  );
});

test("toHashRoute routes a channel link", () => {
  assert.strictEqual(
    toHashRoute(
      "https://teams.microsoft.com/l/channel/19%3aabc/General?groupId=g"
    ),
    "#/l/channel/19%3aabc/General?groupId=g"
  );
});

test("toHashRoute keeps a chat link that names its thread", () => {
  // The widget/launcher form for a conversation without a message to land on;
  // declining it made the client reload, which drops an active call.
  const thread = "19%3A9e2b1a16123744ca8b6159cb33348835%40thread.v2";
  assert.strictEqual(
    toHashRoute(`https://teams.cloud.microsoft/l/chat/${thread}/conversations?context=%7B%7D`),
    `#/l/chat/${thread}/conversations?context=%7B%7D`
  );
});

test("toHashRoute declines links the SPA route cannot resolve", () => {
  const declined = [
    "https://teams.cloud.microsoft/l/chat/0/0",
    "https://teams.cloud.microsoft/l/chat/0/0?users=",
    "https://teams.cloud.microsoft/l/chat/0/0?topicName=x",
    "https://teams.microsoft.com/meet/241?p=secret",
    "https://teams.cloud.microsoft/l/meetup-join/",
    "https://teams.cloud.microsoft/",
    "not-a-url",
  ];

  for (const url of declined) {
    assert.strictEqual(toHashRoute(url), null, url);
  }
});

test("findRouterFrame returns the main frame when Teams is loaded", () => {
  const main = { url: "https://teams.cloud.microsoft/" };

  assert.strictEqual(findRouterFrame(main, TEAMS_ORIGIN), main);
});

test("findRouterFrame accepts the configured origin outside the known hosts", () => {
  // GovCloud runs on `gov.teams.microsoft.us`, reached through the `url`
  // override (ADR-020): not a known Teams host, accepted as the configured one.
  const gov = { url: "https://gov.teams.microsoft.us/v2/" };

  assert.strictEqual(findRouterFrame(gov, "https://gov.teams.microsoft.us"), gov);
  assert.strictEqual(findRouterFrame(gov, TEAMS_ORIGIN), null, "only when it is the configured one");
  assert.strictEqual(findRouterFrame(gov, null), null);
});

test("findRouterFrame accepts every Teams host, whatever the configured URL", () => {
  // Teams redirects `teams.microsoft.com` sessions to `teams.cloud.microsoft`;
  // comparing against the configured URL declined every route on such a
  // session and reached the fallback reload (#2976).
  for (const url of [
    "https://teams.microsoft.com/",
    "https://teams.live.com/v2/",
    "https://teams.cloud.microsoft.mcas.ms/",
  ]) {
    const main = { url };
    assert.strictEqual(findRouterFrame(main, TEAMS_ORIGIN), main, url);
  }
  for (const url of ["http://teams.microsoft.com/", "https://evil.com.teams.microsoft.com/", "not-a-url"]) {
    assert.strictEqual(findRouterFrame({ url }, TEAMS_ORIGIN), null, url);
  }
});

test("findRouterFrame declines while the window is on another origin", () => {
  const main = { url: "https://login.microsoftonline.com/common/oauth2/" };

  assert.strictEqual(findRouterFrame(main, TEAMS_ORIGIN), null);
});

function windowWith(frameUrl, executeJavaScript) {
  return {
    webContents: { mainFrame: { url: frameUrl, executeJavaScript } },
  };
}

test("navigateInPage succeeds when the SPA consumes the fragment", async () => {
  let script = null;
  const win = windowWith("https://teams.cloud.microsoft/", async (source) => {
    script = source;
    return true;
  });

  assert.strictEqual(await navigateInPage(win, DEEP_LINK, TEAMS_URL), true);
  assert.match(script, /const target = "#\/l\/chat\/0\/0\?users=a@b\.com"/);
  // The injected source is evaluated in the renderer, where a syntax error
  // would surface only as a rejected promise and a silent fallback.
  assert.doesNotThrow(() => new Function(`return ${script}`));
});

test("navigateInPage hands a meeting route to the loaded SPA", async () => {
  let script = null;
  const win = windowWith("https://teams.cloud.microsoft/", async (source) => {
    script = source;
    return true;
  });

  assert.strictEqual(await navigateInPage(win, MEETING_LINK, TEAMS_URL), true);
  assert.match(script, /const target = "#\/l\/meetup-join\//);
});

test("navigateInPage short-circuits when the fragment already holds the route", async () => {
  let script = null;
  const win = windowWith("https://teams.cloud.microsoft/", async (source) => {
    script = source;
    return true;
  });

  assert.strictEqual(await navigateInPage(win, DEEP_LINK, TEAMS_URL), true);
  // Re-assigning an identical fragment fires no `hashchange`, so without this
  // guard the wait would time out and reload a page already on the route.
  assert.match(script, /if \(previous === target\) \{ resolve\(true\); return; \}/);
});

test("navigateInPage also takes a document title change as consumption", async () => {
  let script = null;
  const win = windowWith("https://teams.cloud.microsoft/", async (source) => {
    script = source;
    return true;
  });

  assert.strictEqual(await navigateInPage(win, DEEP_LINK, TEAMS_URL), true);
  // Teams can open the target without rewriting the fragment; it always
  // retitles the document for it, so the title is watched as a second signal.
  assert.match(script, /const previousTitle = bareTitle\(\);/);
  assert.match(script, /new MutationObserver\(\(\) => \{\s*if \(bareTitle\(\) !== previousTitle\) settle\(true\);/);
  // Observed on <head>, not on the current <title>: Teams replaces the element on remounts.
  assert.match(script, /titleWatch\.observe\(document\.head, \{ childList: true, characterData: true, subtree: true \}\);/);
  assert.match(script, /titleWatch\.disconnect\(\);/);
  assert.doesNotThrow(() => new Function(`return ${script}`));
});

test("navigateInPage ignores an unread-count-only title change", async () => {
  let script = null;
  const win = windowWith("https://teams.cloud.microsoft/", async (source) => {
    script = source;
    return true;
  });
  await navigateInPage(win, DEEP_LINK, TEAMS_URL);

  // The injected comparison strips the "(N) " unread prefix that
  // mutationTitle.js reads, so a counter update alone is not consumption.
  // Evaluate the production expression itself, lifted out of the script.
  const normalize = script.match(/const bareTitle = \(\) => (document\.title\.replace\([^;]+\));/)[1];
  const bare = new Function("document", `return ${normalize};`);
  assert.strictEqual(bare({ title: "(3) Calendar | Microsoft Teams" }), "Calendar | Microsoft Teams");
  assert.strictEqual(bare({ title: "Calendar | Microsoft Teams" }), "Calendar | Microsoft Teams");
  assert.notStrictEqual(bare({ title: "(3) Calendar | Someone | Microsoft Teams" }), "Calendar | Microsoft Teams");
});

test("navigateInPage re-checks the fragment at the deadline", async () => {
  let script = null;
  const win = windowWith("https://teams.cloud.microsoft/", async (source) => {
    script = source;
    return true;
  });
  await navigateInPage(win, DEEP_LINK, TEAMS_URL);

  // The SPA can clear the assigned fragment through the history API, which
  // fires no hashchange and may leave the title alone (a link to the
  // conversation already open): at the deadline, a fragment that no longer
  // holds the assigned value counts as consumed, an untouched one as declined.
  assert.match(script, /timer = setTimeout\(\(\) => settle\(location\.hash !== assigned\), 750\);/);
});

test("navigateInPage falls back when the fragment is left untouched", async () => {
  const win = windowWith("https://teams.cloud.microsoft/", async () => false);

  assert.strictEqual(await navigateInPage(win, DEEP_LINK, TEAMS_URL), false);
});

test("navigateInPage declines when Teams is not the loaded origin", async () => {
  // Counted, not asserted inside the callback: navigateInPage swallows a
  // throw from the frame, so an assert.fail in there reads as a clean decline.
  let ran = 0;
  const win = windowWith("https://login.microsoftonline.com/", async () => {
    ran += 1;
    return true;
  });

  assert.strictEqual(await navigateInPage(win, DEEP_LINK, TEAMS_URL), false);
  assert.strictEqual(ran, 0, "nothing is injected off the Teams origin");
});

test("navigateInPage declines when the frame rejects", async () => {
  const win = windowWith("https://teams.cloud.microsoft/", async () => {
    throw new Error("frame disposed");
  });

  assert.strictEqual(await navigateInPage(win, DEEP_LINK, TEAMS_URL), false);
});

test("navigateInPage declines when the window is torn down mid-flight", async () => {
  // Electron throws on a destroyed object rather than returning undefined, so
  // optional chaining would not reach the fallback here.
  const destroyed = {
    get webContents() {
      throw new Error("Object has been destroyed");
    },
  };

  assert.strictEqual(
    await navigateInPage(destroyed, DEEP_LINK),
    false
  );
});

test("navigateInPage declines unsupported link shapes without touching the frame", async () => {
  let ran = 0;
  const win = windowWith("https://teams.cloud.microsoft/", async () => {
    ran += 1;
    return true;
  });

  assert.strictEqual(
    await navigateInPage(win, "https://teams.microsoft.com/meet/241", TEAMS_URL),
    false
  );
  assert.strictEqual(ran, 0, "an unsupported shape never reaches the frame");
});

test("navigateInPage routes a GovCloud session through its configured URL", async () => {
  let ran = 0;
  const win = windowWith("https://gov.teams.microsoft.us/v2/", async () => {
    ran += 1;
    return true;
  });
  const link = "https://gov.teams.microsoft.us/l/chat/0/0?users=a@b.com";

  assert.strictEqual(await navigateInPage(win, link, "https://gov.teams.microsoft.us"), true);
  // Counted rather than asserted inside the callback: navigateInPage swallows
  // a throw from the frame, which would read as a clean decline.
  assert.strictEqual(await navigateInPage(win, link, TEAMS_URL), false);
  assert.strictEqual(ran, 1, "declined without touching a frame that is not the configured one");
});

test("navigateInPage still routes on a Teams host when the configured URL is unusable", async () => {
  const win = windowWith("https://teams.cloud.microsoft/", async () => true);

  assert.strictEqual(await navigateInPage(win, DEEP_LINK, "not a url"), true);
  assert.strictEqual(await navigateInPage(win, DEEP_LINK, undefined), true);
});

test("navigateInPage does not let an opaque configured origin match a blank frame", async () => {
  // `file:` and `about:blank` both serialise their origin as "null".
  let ran = 0;
  const win = windowWith("about:blank", async () => {
    ran += 1;
    return true;
  });

  assert.strictEqual(await navigateInPage(win, DEEP_LINK, "file:///tmp/teams.html"), false);
  assert.strictEqual(ran, 0);
});

test("focusCompose only targets conversation routes on a Teams frame", async () => {
  let script = null;
  const win = windowWith("https://teams.cloud.microsoft/", async (source) => {
    script = source;
    return { focused: true, afterMs: 0 };
  });

  assert.strictEqual((await focusCompose(win, MEETING_LINK, TEAMS_URL)).focused, false);
  assert.strictEqual(script, null, "a meeting link has no compose box to focus");
  assert.strictEqual((await focusCompose(win, DEEP_LINK, TEAMS_URL)).focused, true);
  // The renderer function travels as source: a syntax slip would only show
  // up as a rejected promise, silently swallowed as "not found".
  assert.doesNotThrow(() => new Function(`return ${script}`));
  assert.match(script, /role=\\"textbox\\"/);

  // Counted, not asserted inside the callback: focusCompose swallows a throw
  // from the frame, so an assert.fail in there would read as a clean decline.
  let ranOnLogin = 0;
  const login = windowWith("https://login.microsoftonline.com/", async () => {
    ranOnLogin += 1;
    return true;
  });
  assert.strictEqual((await focusCompose(login, DEEP_LINK, TEAMS_URL)).focused, false);
  assert.strictEqual(ranOnLogin, 0, "nothing is injected off a Teams host");
  const rejecting = windowWith("https://teams.cloud.microsoft/", async () => {
    throw new Error("frame disposed");
  });
  assert.strictEqual((await focusCompose(rejecting, DEEP_LINK, TEAMS_URL)).focused, false);
});

// Unit tests have no DOM (CLAUDE.md): the injected function is pinned by its
// source text, and its behaviour is checked in a real renderer with an
// Electron probe (hidden BrowserWindow + executeJavaScript), see the PR.
function injectedSource() {
  return focusComposeBox.toString();
}

test("focusComposeBox source is self-contained and parses", () => {
  const source = injectedSource();
  assert.doesNotThrow(() => new Function(`return ${source}`));
  // Nothing from the module scope may be closed over: it runs serialised.
  assert.doesNotMatch(source, /COMPOSE_SELECTORS|COMPOSE_FOCUS_TIMEOUT_MS|COMPOSE_SETTLE_MS|isTeamsHost/);
  assert.doesNotMatch(source, /require\(/);
});

test("focusComposeBox never takes the editor present when the route landed at once", () => {
  const source = injectedSource();
  // The outgoing chat's editor is still mounted right after the route; only a
  // new element is safe immediately, the initial one waits for DOM quiet.
  assert.match(source, /const initial = find\(document, selectors\);/);
  assert.match(source, /if \(el && el !== initial\) \{\s*clearTimeout\(settleTimer\);\s*focusNow\(\);/);
  assert.match(source, /settleTimer = setTimeout\(focusNow, settleMs\);/);
});

test("focusComposeBox follows the editor and reclaims focus the SPA moves away", () => {
  const source = injectedSource();
  assert.match(source, /if \(focused\.isConnected && document\.activeElement === focused\) return;\s*focusNow\(\);/);
  assert.match(source, /addEventListener\("focusin", onActivity, true\);/);
  assert.match(source, /observer\.observe\(document\.body, \{ childList: true, subtree: true \}\);/);
});

test("focusComposeBox backs off on pointer input, field input and navigation keys only", () => {
  const source = injectedSource();
  assert.match(source, /addEventListener\("pointerdown", stop, true\);/);
  assert.match(source, /if \(editable\(event\.target\) \|\| !typing\(event\)\) stop\(\);/);
  // Evaluate the production classifier itself, lifted out of the source.
  const typingSrc = source.match(/const typing = \((event)\) => \{([\s\S]*?)\n {4}\};/);
  assert.ok(typingSrc, "typing classifier present");
  const typing = new Function("event", typingSrc[2]);
  const message = {};
  for (const event of [
    { key: "a" }, { key: "é" }, { key: "Dead" }, { key: "Process", isComposing: true },
    { key: "@", ctrlKey: true, altKey: true },
  ]) {
    assert.strictEqual(typing({ ...event, target: message }), true, `${event.key} is typing`);
  }
  for (const event of [
    { key: "Tab" }, { key: "ArrowDown" }, { key: "Enter" },
    { key: "k", ctrlKey: true }, { key: "f", altKey: true }, { key: "k", metaKey: true }, {},
  ]) {
    assert.strictEqual(typing({ ...event, target: message }), false, `${event.key} is navigation`);
  }
  const editableSrc = source.match(/const editable = \((el)\) =>\s*([\s\S]*?);\n/);
  assert.ok(editableSrc, "editable check present");
  const editable = new Function("el", `return ${editableSrc[2]};`);
  assert.strictEqual(editable({ isContentEditable: true }), true);
  assert.strictEqual(editable({ tagName: "INPUT" }), true);
  assert.strictEqual(editable({ tagName: "DIV", isContentEditable: false }), false);
  assert.strictEqual(editable(null), false);
});

test("focusComposeBox reports whether the box holds focus and when it first did", () => {
  const source = injectedSource();
  assert.match(source, /resolve\(\{ focused: focused !== null && document\.activeElement === focused, afterMs: firstFocusAt \}\);/);
  assert.match(source, /firstFocusAt \?\?= Date\.now\(\) - started;/);
});

test("focusCompose injects the shared finder, the cascade and both budgets", async () => {
  let script = null;
  const win = windowWith("https://teams.cloud.microsoft/", async (source) => {
    script = source;
    return { focused: true, afterMs: 0 };
  });

  await focusCompose(win, DEEP_LINK, TEAMS_URL);
  assert.match(script, /^\(function focusComposeBox\(/);
  assert.match(script, /\(function findCompose\(doc, selectors\)/);
  assert.match(script, /"div\[id\^=\\"new-message-\\"\]"/);
  assert.match(script, /, 1500, 100\)$/);
});

test("focusCompose accepts the configured origin like navigateInPage", async () => {
  let ran = 0;
  const gov = windowWith("https://gov.teams.microsoft.us/v2/", async () => {
    ran += 1;
    return { focused: true, afterMs: 0 };
  });
  const link = "https://gov.teams.microsoft.us/l/chat/0/0?users=a@b.com";

  assert.strictEqual((await focusCompose(gov, link, "https://gov.teams.microsoft.us")).focused, true);
  assert.strictEqual((await focusCompose(gov, link, TEAMS_URL)).focused, false);
  assert.strictEqual(ran, 1, "nothing is injected into a frame that is not the configured one");
});
