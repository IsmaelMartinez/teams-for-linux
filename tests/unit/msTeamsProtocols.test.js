/**
 * Unit tests for msTeamsProtocols patterns (v1 and v2)
 *
 * Run with: node --test tests/unit/msTeamsProtocols.test.js
 *
 * These tests verify that the msTeamsProtocols regex patterns correctly match
 * msteams:// protocol links, including short meet links (issue #2228).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');

// Default patterns from app/config/index.js
const v1Pattern = new RegExp("^msteams:/(?:meet/|l/(?:app|call|channel|chat|entity|file|meet(?:ing|up-join)|message|task|team)/)");
const v2Pattern = new RegExp("^msteams://teams\\.(?:microsoft\\.com|live\\.com|cloud\\.microsoft)/(?:meet/|l/(?:app|call|channel|chat|entity|file|meet(?:ing|up-join)|message|task|team)/)");

describe('msTeamsProtocols v1 pattern', () => {
  describe('Valid v1 links - should match', () => {
    const validLinks = [
      // Short meet links (issue #2228)
      ['msteams:/meet/abc123', 'short meet link'],
      ['msteams:/meet/user@example.com', 'short meet link with email'],
      ['msteams:/meet/abc123?p=hashedPasscode', 'short meet link with passcode'],

      // Standard deep link paths
      ['msteams:/l/meetup-join/19%3ameeting_abc@thread.v2/0', 'meetup-join'],
      ['msteams:/l/channel/19%3Aabc123%40thread.tacv2/General', 'channel'],
      ['msteams:/l/chat/0/0?users=user@example.com', 'chat'],
      ['msteams:/l/message/19:abc123', 'message'],
      ['msteams:/l/app/some-app-id', 'app'],
      ['msteams:/l/call/19:call_abc123', 'call'],
      ['msteams:/l/entity/some-entity', 'entity'],
      ['msteams:/l/file/some-file-id', 'file'],
      ['msteams:/l/meeting/abc123', 'meeting'],
      ['msteams:/l/task/some-task', 'task'],
      ['msteams:/l/team/19:team_abc', 'team'],
    ];

    for (const [link, description] of validLinks) {
      it(`matches ${description}: ${link}`, () => {
        assert.strictEqual(v1Pattern.test(link), true);
      });
    }
  });

  describe('Invalid v1 links - should not match', () => {
    const invalidLinks = [
      ['msteams:/l/unknown/abc123', 'unknown path type'],
      ['msteams:/l/meetup-join', 'missing trailing slash'],
      ['msteams:/other/path', 'wrong path structure'],
      ['https://teams.microsoft.com/meet/abc123', 'https protocol (not msteams)'],
      ['msteams://teams.microsoft.com/meet/abc123', 'v2 format (double slash)'],
    ];

    for (const [link, description] of invalidLinks) {
      it(`rejects ${description}: ${link}`, () => {
        assert.strictEqual(v1Pattern.test(link), false);
      });
    }
  });
});

describe('msTeamsProtocols v2 pattern', () => {
  describe('Valid v2 links - should match', () => {
    const validLinks = [
      // Short meet links on microsoft.com (issue #2228)
      ['msteams://teams.microsoft.com/meet/abc123', 'short meet link (microsoft.com)'],
      ['msteams://teams.microsoft.com/meet/abc123?p=hashedPasscode', 'short meet link with passcode'],
      ['msteams://teams.microsoft.com/meet/user@example.com', 'short meet link with email'],

      // Short meet links on live.com
      ['msteams://teams.live.com/meet/abc123', 'short meet link (live.com)'],
      ['msteams://teams.live.com/meet/abc123?p=hashedPasscode', 'short meet link with passcode (live.com)'],

      // Short meet links on cloud.microsoft
      ['msteams://teams.cloud.microsoft/meet/abc123', 'short meet link (cloud.microsoft)'],

      // Standard deep link paths - microsoft.com
      ['msteams://teams.microsoft.com/l/meetup-join/19%3ameeting_abc@thread.v2/0', 'meetup-join'],
      ['msteams://teams.microsoft.com/l/channel/19%3Aabc123/General', 'channel'],
      ['msteams://teams.microsoft.com/l/chat/0/0?users=user@example.com', 'chat'],
      ['msteams://teams.microsoft.com/l/message/19:abc123', 'message'],
      ['msteams://teams.microsoft.com/l/app/some-app-id', 'app'],
      ['msteams://teams.microsoft.com/l/call/19:call_abc123', 'call'],
      ['msteams://teams.microsoft.com/l/entity/some-entity', 'entity'],
      ['msteams://teams.microsoft.com/l/file/some-file-id', 'file'],
      ['msteams://teams.microsoft.com/l/meeting/abc123', 'meeting'],
      ['msteams://teams.microsoft.com/l/task/some-task', 'task'],
      ['msteams://teams.microsoft.com/l/team/19:team_abc', 'team'],

      // Standard deep link paths - cloud.microsoft
      ['msteams://teams.cloud.microsoft/l/meetup-join/19%3ameeting_abc/0', 'meetup-join (cloud.microsoft)'],
      ['msteams://teams.cloud.microsoft/l/chat/0/0?users=user@example.com', 'chat (cloud.microsoft)'],

      // Standard deep link paths - live.com
      ['msteams://teams.live.com/l/meetup-join/19%3ameeting_abc/0', 'meetup-join (live.com)'],
    ];

    for (const [link, description] of validLinks) {
      it(`matches ${description}: ${link}`, () => {
        assert.strictEqual(v2Pattern.test(link), true);
      });
    }
  });

  describe('Invalid v2 links - should not match', () => {
    const invalidLinks = [
      ['msteams://teams.microsoft.com/l/unknown/abc123', 'unknown path type'],
      ['msteams://teams.microsoft.com/l/meetup-join', 'missing trailing slash'],
      ['msteams://teams.microsoft.com/other/path', 'wrong path structure'],
      ['msteams://teams.example.com/meet/abc123', 'wrong domain'],
      ['msteams://faketeams.microsoft.com/meet/abc123', 'fake teams subdomain'],
      ['https://teams.microsoft.com/meet/abc123', 'https protocol (not msteams)'],
      ['msteams:/meet/abc123', 'v1 format (single slash)'],
    ];

    for (const [link, description] of invalidLinks) {
      it(`rejects ${description}: ${link}`, () => {
        assert.strictEqual(v2Pattern.test(link), false);
      });
    }
  });
});

describe('processArgs URL transformation', () => {
  // Simulates the URL transformation logic from app/mainAppWindow/index.js
  const baseUrl = 'https://teams.cloud.microsoft';

  function transformV1(arg) {
    return baseUrl + arg.substring(8, arg.length);
  }

  function transformV2(arg) {
    return arg.replace('msteams', 'https');
  }

  it('v1 short meet link transforms correctly', () => {
    const input = 'msteams:/meet/abc123?p=passcode';
    const expected = 'https://teams.cloud.microsoft/meet/abc123?p=passcode';
    assert.strictEqual(transformV1(input), expected);
  });

  it('v1 meetup-join transforms correctly', () => {
    const input = 'msteams:/l/meetup-join/19:meeting_abc/0';
    const expected = 'https://teams.cloud.microsoft/l/meetup-join/19:meeting_abc/0';
    assert.strictEqual(transformV1(input), expected);
  });

  it('v2 short meet link transforms correctly', () => {
    const input = 'msteams://teams.microsoft.com/meet/abc123?p=passcode';
    const expected = 'https://teams.microsoft.com/meet/abc123?p=passcode';
    assert.strictEqual(transformV2(input), expected);
  });

  it('v2 meetup-join transforms correctly', () => {
    const input = 'msteams://teams.microsoft.com/l/meetup-join/19:meeting_abc/0';
    const expected = 'https://teams.microsoft.com/l/meetup-join/19:meeting_abc/0';
    assert.strictEqual(transformV2(input), expected);
  });

  it('v2 cloud.microsoft short meet link transforms correctly', () => {
    const input = 'msteams://teams.cloud.microsoft/meet/abc123';
    const expected = 'https://teams.cloud.microsoft/meet/abc123';
    assert.strictEqual(transformV2(input), expected);
  });
});
