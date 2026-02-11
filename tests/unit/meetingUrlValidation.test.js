/**
 * Unit tests for Teams meeting URL validation
 *
 * Run with: node --test tests/unit/meetingUrlValidation.test.js
 *
 * These tests verify that the meetupJoinRegEx pattern correctly matches
 * various Teams meeting URL formats. This is critical because Microsoft
 * occasionally changes URL formats.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const defaults = require('../../app/config/defaults');

// Use the shared default regex pattern from app/config/defaults.js
const meetupJoinRegEx = defaults.meetupJoinRegEx;

function isValidTeamsMeetingUrl(text) {
  if (typeof text !== 'string') {
    return false;
  }
  const pattern = new RegExp(meetupJoinRegEx);
  return pattern.test(text);
}

describe('Teams Meeting URL Validation', () => {
  describe('Valid URLs - should be accepted', () => {
    const validUrls = [
      // Classic meetup-join format
      ['https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc123@thread.v2/0', 'classic meetup-join'],
      ['https://teams.microsoft.com/l/meetup-join/19:meeting_YWZmYTIzNj@thread.v2/0?context=%7B%7D', 'meetup-join with context'],

      // Meeting format
      ['https://teams.microsoft.com/l/meeting/19%3ameeting_xyz789', 'meeting format'],

      // Meet format (personal meetings)
      ['https://teams.microsoft.com/meet/user@example.com', 'meet format'],
      ['https://teams.live.com/meet/user@example.com', 'teams.live.com meet'],
      ['https://teams.cloud.microsoft/meet/abc123', 'teams.cloud.microsoft meet'],
      ['https://teams.microsoft.com/meet/abc123?p=hashedPasscode', 'meet with passcode'],
      ['https://teams.live.com/meet/abc123?p=hashedPasscode', 'teams.live.com meet with passcode'],

      // V2 web app format
      ['https://teams.microsoft.com/v2/?meetingjoin=true#/l/meetup-join/19:meeting_abc.v2/0', 'v2 meetingjoin format'],

      // Channel meetings
      ['https://teams.microsoft.com/l/channel/19%3achannel_abc123', 'channel format'],

      // Call format
      ['https://teams.microsoft.com/l/call/19%3acall_abc123', 'call format'],

      // Chat format
      ['https://teams.microsoft.com/l/chat/19%3achat_abc123', 'chat format'],

      // Other supported formats
      ['https://teams.microsoft.com/l/app/some-app-id', 'app format'],
      ['https://teams.microsoft.com/l/entity/some-entity', 'entity format'],
      ['https://teams.microsoft.com/l/file/some-file-id', 'file format'],
      ['https://teams.microsoft.com/l/message/19%3amessage_abc', 'message format'],
      ['https://teams.microsoft.com/l/task/some-task', 'task format'],
      ['https://teams.microsoft.com/l/team/19%3ateam_abc', 'team format'],
    ];

    for (const [url, description] of validUrls) {
      it(`accepts ${description}: ${url}`, () => {
        assert.strictEqual(isValidTeamsMeetingUrl(url), true);
      });
    }
  });

  describe('Invalid URLs - should be rejected', () => {
    const invalidUrls = [
      // Other meeting platforms
      ['https://zoom.us/j/123456789', 'Zoom URL'],
      ['https://meet.google.com/abc-defg-hij', 'Google Meet URL'],
      ['https://webex.com/meet/user', 'Webex URL'],

      // Wrong domain
      ['https://teams.example.com/l/meetup-join/123', 'wrong domain'],
      ['https://faketeams.microsoft.com/l/meetup-join/123', 'fake teams domain'],

      // Wrong path structure
      ['https://teams.microsoft.com/other/path', 'wrong path'],
      ['https://teams.microsoft.com/', 'root path only'],
      ['https://teams.microsoft.com/l/', 'incomplete l/ path'],
      ['https://teams.microsoft.com/l/unknown/123', 'unknown l/ subpath'],

      // Malformed URLs
      ['not a url at all', 'plain text'],
      ['', 'empty string'],
      ['https://', 'incomplete URL'],
      ['teams.microsoft.com/l/meetup-join/123', 'missing protocol'],

      // HTTP (not HTTPS)
      ['http://teams.microsoft.com/l/meetup-join/123', 'http instead of https'],
    ];

    for (const [url, description] of invalidUrls) {
      it(`rejects ${description}: ${url}`, () => {
        assert.strictEqual(isValidTeamsMeetingUrl(url), false);
      });
    }

    it('rejects null value', () => {
      assert.strictEqual(isValidTeamsMeetingUrl(null), false);
    });

    it('rejects undefined value', () => {
      assert.strictEqual(isValidTeamsMeetingUrl(undefined), false);
    });

    it('rejects number value', () => {
      assert.strictEqual(isValidTeamsMeetingUrl(123), false);
    });
  });

  describe('Edge cases', () => {
    it('URL with query parameters is valid', () => {
      const url = 'https://teams.microsoft.com/l/meetup-join/123?foo=bar&baz=qux';
      assert.strictEqual(isValidTeamsMeetingUrl(url), true);
    });

    it('URL with fragment is valid', () => {
      const url = 'https://teams.microsoft.com/l/meetup-join/123#section';
      assert.strictEqual(isValidTeamsMeetingUrl(url), true);
    });

    it('URL with encoded characters is valid', () => {
      const url = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_OGQ4ZGY5%40thread.v2/0';
      assert.strictEqual(isValidTeamsMeetingUrl(url), true);
    });

    it('Case sensitivity - uppercase domain should fail', () => {
      const url = 'https://TEAMS.MICROSOFT.COM/l/meetup-join/123';
      // Regex is case-sensitive by default, uppercase should fail
      assert.strictEqual(isValidTeamsMeetingUrl(url), false);
    });
  });
});
