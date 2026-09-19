const test = require("node:test");
const assert = require("node:assert");

const { isTeamsHost, TEAMS_HOSTS } = require("../../app/helpers/teamsHosts");

test("isTeamsHost accepts the Teams hosts, one subdomain label and the MCAS proxy", () => {
  for (const host of TEAMS_HOSTS) {
    assert.strictEqual(isTeamsHost(host), true, host);
    assert.strictEqual(isTeamsHost(`eu.${host}`), true, host);
    assert.strictEqual(isTeamsHost(`${host}.mcas.ms`), true, host);
  }
});

test("isTeamsHost declines look-alikes and non-strings", () => {
  for (const host of [
    "evil.com.teams.microsoft.com",
    "teams.microsoft.com.evil.com",
    "a.b.teams.cloud.microsoft",
    "login.microsoftonline.com",
    "",
    undefined,
  ]) {
    assert.strictEqual(isTeamsHost(host), false, String(host));
  }
});
