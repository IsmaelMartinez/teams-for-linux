
const test = require("node:test");
const assert = require("node:assert");

const { isTeamsHost, stripMcasSuffix, TEAMS_HOSTS } = require("../../app/helpers/teamsHosts");

test("isTeamsHost accepts the Teams hosts, one subdomain label and the MCAS proxies", () => {
  for (const host of TEAMS_HOSTS) {
    assert.strictEqual(isTeamsHost(host), true, host);
    assert.strictEqual(isTeamsHost(`eu.${host}`), true, host);

    for (const suffix of [".mcas.ms", ".mcas-gov.us", ".mcas-gov.ms"]) {
      assert.strictEqual(isTeamsHost(`${host}${suffix}`), true, `${host}${suffix}`);
      assert.strictEqual(isTeamsHost(`eu.${host}${suffix}`), true, `eu.${host}${suffix}`);
    }
  }
});

test("isTeamsHost declines look-alikes and non-strings", () => {
  for (const host of [
    "evil.com.teams.microsoft.com",
    "teams.microsoft.com.evil.com",
    "a.b.teams.cloud.microsoft",
    "login.microsoftonline.com",
    "teams.cloud.microsoft.mcas-gov.ms.evil.com",
    "evil.com.teams.cloud.microsoft.mcas-gov.ms",
    "a.b.teams.cloud.microsoft.mcas-gov.us",
    "teams.cloud.microsoft.mcas-gov.us.evil.com",
    "teams.cloud.microsoft.mcas-gov.ms.mcas.ms",
    "",
    undefined,
  ]) {
    assert.strictEqual(isTeamsHost(host), false, String(host));
  }
});

test("stripMcasSuffix removes recognized MCAS proxy suffixes", () => {
  for (const suffix of [".mcas.ms", ".mcas-gov.us", ".mcas-gov.ms"]) {
    assert.strictEqual(
      stripMcasSuffix(`teams.cloud.microsoft${suffix}`),
      "teams.cloud.microsoft",
    );
    assert.strictEqual(
      stripMcasSuffix(`login.microsoftonline.com${suffix}`),
      "login.microsoftonline.com",
    );
  }

  assert.strictEqual(stripMcasSuffix("teams.cloud.microsoft"), "teams.cloud.microsoft");
  assert.strictEqual(stripMcasSuffix("teams.cloud.microsoft.evil.com"), "teams.cloud.microsoft.evil.com");
  assert.strictEqual(stripMcasSuffix(undefined), undefined);
});

// ---------------------------------------------------------------------------
// Every matcher, pinned against one table. Columns, in order:
//   A isTeamsHost            B isPermissionTrustedHost   D isTeamsContentUrl
//   E isAuthLoginUrl         F isAuthCookieDomain        G isTrustedAuthSource
//   H isPrefillLoginHost
// (C, the profile navigation check, is isTeamsHost plus an https check, so it
// answers as A.) Host-form inputs are wrapped as https://<input>/ for the URL
// matchers and handed over as `new URL(...).hostname` for the hostname
// matchers. URL-form inputs (blob:, http:, ...) are passed as they are. The
// cookie matcher gets the raw input, or the hostname for URL-form inputs. The columns differ between callers
// on purpose; see the header of app/helpers/teamsHosts.js.
// ---------------------------------------------------------------------------

const {
  GOV_TEAMS_DOMAIN,
  TEAMS_STATIC_HOST,
  SIGN_IN_HOSTS,
  GOV_SIGN_IN_HOST,
  AUTH_COOKIE_DOMAINS,
  TRUSTED_AUTH_SOURCE_HOSTS,
  hasDomainSuffix,
  hasAnyDomainSuffix,
  isTeamsContentUrl,
  isAuthLoginUrl,
  isTrustedAuthSource,
  isAuthCookieDomain,
  isPermissionTrustedHost,
  isPrefillLoginHost,
} = require("../../app/helpers/teamsHosts");

const MATCHERS = ["A", "B", "D", "E", "F", "G", "H"];

// input, then the seven answers A B D E F G H
const TABLE = [
  ["teams.microsoft.com", "Y Y Y - Y Y -"],
  ["teams.cloud.microsoft", "Y Y Y - Y Y -"],
  ["teams.live.com", "Y Y Y - Y - -"],
  ["gov.teams.microsoft.us", "- Y - - - - -"],
  ["dod.teams.microsoft.us", "- Y - - - - -"],
  ["teams.microsoft.us", "- Y - - - - -"],
  ["emea.teams.microsoft.com", "Y Y Y - Y Y -"],
  ["a.b.teams.microsoft.com", "- - Y - Y Y -"],
  ["teams.microsoft.com.mcas.ms", "Y Y Y - Y Y -"],
  ["teams.microsoft.com.evil.example", "- - - - - - -"],
  ["evilteams.microsoft.com", "- - - - Y - -"],
  ["teams.microsoft.com.evil.mcas.ms", "- - - - - - -"],
  ["login.microsoftonline.com", "- Y - Y Y Y Y"],
  ["login.microsoftonline.us", "- Y - - - - -"],
  ["login.live.com", "- Y - Y Y - Y"],
  ["outlook.office.com", "- - - - Y - -"],
  ["tenant.sharepoint.com", "- - - - - - -"],
  ["statics.teams.cdn.office.net", "- - Y - - - -"],
  ["https://evil.example/?x=teams.microsoft.com", "- - - - - - -"],
  ["https://evil.example/teams.microsoft.com", "- - - - - - -"],
  ["https://teams.microsoft.com@evil.example/", "- - - - - - -"],
  // Beyond the original table
  ["teams.microsoft.com.", "- - - - - - -"],
  ["TEAMS.Microsoft.COM", "Y Y Y - - Y -"],
  ["x.y.login.live.com", "- Y - Y Y - Y"],
  ["login.live.com.mcas.ms", "- - - Y Y - -"],
  ["login.microsoftonline.com.mcas.ms", "- - - Y Y Y -"],
  ["teams.microsoft.com.mcas-gov.us", "Y Y Y - Y Y -"],
  ["evil.teams.microsoft.com.mcas.ms", "Y Y Y - Y Y -"],
  ["http://teams.microsoft.com/", "Y Y Y - Y Y -"],
  ["http://login.microsoftonline.com/x", "- Y - Y Y Y Y"],
  ["blob:https://teams.microsoft.com/abc", "- - - - - Y -"],
  ["blob:https://evil.example/abc", "- - - - - - -"],
  ["https://evil.example/teams.microsoft.com.js", "- - - - - - -"],
  ["https://login.microsoftonline.com.evil.example/a.js", "- - - - - - -"],
  ["https://teams.microsoft.com/v2/main.js", "Y Y Y - Y Y -"],
  ["", "- - - - - - -"],
  ["not a url", "- - - - - - -"],
  [".teams.microsoft.com", "Y Y Y - Y Y -"],
  [".login.microsoftonline.com.mcas.ms", "- - - Y Y Y -"],
];

const isUrlForm = (input) => /^(https?|blob|file):/.test(input);
const urlOf = (input) => (isUrlForm(input) ? input : `https://${input}/`);
const hostnameOf = (input) => {
  try {
    return new URL(urlOf(input)).hostname;
  } catch {
    return null;
  }
};

function answersFor(input) {
  const host = hostnameOf(input);
  const url = urlOf(input);
  return {
    A: host !== null && isTeamsHost(host),
    B: host !== null && isPermissionTrustedHost(host),
    D: isTeamsContentUrl(url),
    E: isAuthLoginUrl(url),
    F: isAuthCookieDomain(isUrlForm(input) ? (host ?? "") : input),
    G: isTrustedAuthSource(url),
    H: host !== null && isPrefillLoginHost(host),
  };
}

test("every matcher answers as the table says", () => {
  for (const [input, expected] of TABLE) {
    const answers = answersFor(input);
    const got = MATCHERS.map((m) => (answers[m] ? "Y" : "-")).join(" ");
    assert.strictEqual(got, expected, JSON.stringify(input));
  }
});

test("the lists keep the members each purpose names", () => {
  assert.deepStrictEqual(TEAMS_HOSTS, ["teams.cloud.microsoft", "teams.microsoft.com", "teams.live.com"]);
  assert.strictEqual(GOV_TEAMS_DOMAIN, "teams.microsoft.us");
  assert.strictEqual(TEAMS_STATIC_HOST, "statics.teams.cdn.office.net");
  assert.deepStrictEqual(SIGN_IN_HOSTS, ["login.microsoftonline.com", "login.microsoft.com", "login.live.com"]);
  assert.strictEqual(GOV_SIGN_IN_HOST, "login.microsoftonline.us");
  assert.deepStrictEqual(TRUSTED_AUTH_SOURCE_HOSTS, [
    "teams.cloud.microsoft",
    "teams.microsoft.com",
    "login.microsoftonline.com",
  ]);
  assert.deepStrictEqual(AUTH_COOKIE_DOMAINS, [
    "login.microsoftonline.com",
    "login.microsoft.com",
    "teams.microsoft.com",
    "teams.cloud.microsoft",
    "microsoft.com",
    "office.com",
    "office365.com",
    "live.com",
    "microsoftonline.com",
  ]);
});

test("hasDomainSuffix matches the domain and its subdomains at any depth only", () => {
  assert.strictEqual(hasDomainSuffix("a.com", "a.com"), true);
  assert.strictEqual(hasDomainSuffix("x.y.a.com", "a.com"), true);
  assert.strictEqual(hasDomainSuffix("xa.com", "a.com"), false);
  assert.strictEqual(hasDomainSuffix("a.com.evil", "a.com"), false);
  assert.strictEqual(hasAnyDomainSuffix("x.b.com", ["a.com", "b.com"]), true);
  assert.strictEqual(hasAnyDomainSuffix("x.c.com", ["a.com", "b.com"]), false);
});

test("isPrefillLoginHost adds the user's extra hosts and nothing else", () => {
  assert.strictEqual(isPrefillLoginHost("sso.example.com"), false);
  assert.strictEqual(isPrefillLoginHost("sso.example.com", ["example.com"]), true);
  assert.strictEqual(isPrefillLoginHost("evilexample.com", ["example.com"]), false);
  assert.strictEqual(isPrefillLoginHost("login.live.com", ["example.com"]), true);
});

test("isTrustedAuthSource judges a blob: URL by the origin it embeds", () => {
  assert.strictEqual(isTrustedAuthSource("blob:https://teams.microsoft.com/0a1b"), true);
  assert.strictEqual(isTrustedAuthSource("blob:https://teams.microsoft.com.mcas.ms/0a1b"), true);
  assert.strictEqual(isTrustedAuthSource("blob:https://evil.example/0a1b"), false);
  assert.strictEqual(isTrustedAuthSource("blob:null/0a1b"), false);
});

test("isTrustedAuthSource rejects an empty or unparseable source; callers skip the check for empty", () => {
  assert.strictEqual(isTrustedAuthSource(""), false);
  assert.strictEqual(isTrustedAuthSource("not a url"), false);
  assert.strictEqual(isTrustedAuthSource(undefined), false);
});

// ---------------------------------------------------------------------------
// Derived tables must stay in step with the shared lists.
// ---------------------------------------------------------------------------

test("WebAuthn origins and log buckets derive from the shared sign-in hosts", () => {
  const { DEFAULT_ORIGINS } = require("../../app/webauthn/originAllowlist");
  const { classifyOrigin } = require("../../app/webauthn/log");
  assert.deepStrictEqual(DEFAULT_ORIGINS, SIGN_IN_HOSTS.map((h) => `https://${h}`));
  for (const host of SIGN_IN_HOSTS) {
    assert.strictEqual(classifyOrigin(`https://${host}`), host);
  }
  assert.strictEqual(classifyOrigin("https://login.microsoftonline.us"), "other");
});

test("the browser backend's metadata pages are keyed by exactly the sign-in origins", () => {
  const { _METADATA_PAGES } = require("../../app/webauthn/browserBackend");
  assert.deepStrictEqual(
    Object.keys(_METADATA_PAGES).sort(),
    SIGN_IN_HOSTS.map((h) => `https://${h}`).sort(),
  );
});

test("the default meeting-link and msteams v2 patterns accept exactly the Teams hosts", () => {
  const defaults = require("../../app/config/defaults");
  const options = require("../../app/config/options");
  const meetup = new RegExp(defaults.meetupJoinRegEx);
  const v2 = new RegExp(options.msTeamsProtocols.default.v2);

  // One definition, used by the flat option and by urlHandling
  assert.strictEqual(options.meetupJoinRegEx.default, defaults.meetupJoinRegEx);
  assert.strictEqual(options.urlHandling.default.meetupJoinRegEx, defaults.meetupJoinRegEx);

  for (const host of TEAMS_HOSTS) {
    assert.strictEqual(meetup.test(`https://${host}/meet/abc`), true, host);
    assert.strictEqual(v2.test(`msteams://${host}/meet/abc`), true, host);
  }
  for (const [input] of TABLE) {
    if (isUrlForm(input) || TEAMS_HOSTS.includes(input)) continue;
    assert.strictEqual(meetup.test(`https://${input}/meet/abc`), false, input);
    assert.strictEqual(v2.test(`msteams://${input}/meet/abc`), false, input);
  }
});
