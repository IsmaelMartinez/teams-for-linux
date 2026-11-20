
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
