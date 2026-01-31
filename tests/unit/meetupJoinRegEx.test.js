/**
 * Unit tests for meetupJoinRegEx pattern
 * Run with: node tests/unit/meetupJoinRegEx.test.js
 *
 * This tests the default meetupJoinRegEx pattern from app/config/defaults.js
 */

const defaults = require('../../app/config/defaults');
const pattern = new RegExp(defaults.meetupJoinRegEx);

// Test cases: [url, shouldMatch, description]
const testCases = [
  // Standard meetup-join URLs
  ['https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc123%40thread.v2/0?context=%7B%22Tid%22%3A%22xxx%22%7D', true, 'Standard meetup-join URL'],
  ['https://teams.microsoft.com/l/meetup-join/19:meeting_abc@thread.v2/0', true, 'Meetup-join without URL encoding'],

  // Short meet URLs (new format as of Jan 2026)
  ['https://teams.microsoft.com/meet/abc123', true, 'Short meet URL'],
  ['https://teams.microsoft.com/meet/abc123?p=hashedPasscode', true, 'Short meet URL with passcode'],

  // teams.live.com domain
  ['https://teams.live.com/meet/abc123', true, 'teams.live.com meet URL'],
  ['https://teams.live.com/l/meetup-join/19:meeting_abc@thread.v2/0', true, 'teams.live.com meetup-join URL'],

  // teams.cloud.microsoft domain (newer format)
  ['https://teams.cloud.microsoft/meet/abc123', true, 'teams.cloud.microsoft meet URL'],
  ['https://teams.cloud.microsoft/l/meetup-join/19:meeting_abc@thread.v2/0', true, 'teams.cloud.microsoft meetup-join URL'],

  // Channel URLs
  ['https://teams.microsoft.com/l/channel/19%3Aabc123%40thread.tacv2/General?groupId=xxx', true, 'Channel URL'],

  // Chat URLs
  ['https://teams.microsoft.com/l/chat/0/0?users=user@example.com', true, 'Chat URL'],

  // Meeting URLs (not meetup-join)
  ['https://teams.microsoft.com/l/meeting/abc123', true, 'Meeting URL'],

  // Other valid l/ paths
  ['https://teams.microsoft.com/l/app/abc123', true, 'App URL'],
  ['https://teams.microsoft.com/l/call/abc123', true, 'Call URL'],
  ['https://teams.microsoft.com/l/entity/abc123', true, 'Entity URL'],
  ['https://teams.microsoft.com/l/file/abc123', true, 'File URL'],
  ['https://teams.microsoft.com/l/message/abc123', true, 'Message URL'],
  ['https://teams.microsoft.com/l/task/abc123', true, 'Task URL'],
  ['https://teams.microsoft.com/l/team/abc123', true, 'Team URL'],

  // URLs that should NOT match
  ['https://teams.microsoft.com/', false, 'Root URL'],
  ['https://teams.microsoft.com/l/unknown/abc123', false, 'Unknown l/ path'],
  ['https://example.com/meet/abc123', false, 'Wrong domain'],
  ['http://teams.microsoft.com/meet/abc123', false, 'HTTP instead of HTTPS'],
  ['https://teams.microsoft.com/meetup-join/abc123', false, 'Missing /l/ prefix'],
  ['https://teams.microsoft.com/v2/l/meetup-join/abc123', false, '/v2/ prefix not supported'],
  ['https://teams.microsoft.com/l/meetup-join', false, 'Missing trailing slash'],
  ['https://microsoft.com/teams/meet/abc123', false, 'Wrong domain structure'],
];

let passed = 0;
let failed = 0;

console.log('Testing meetupJoinRegEx pattern:');
console.log(pattern.toString());
console.log('');

for (const [url, shouldMatch, description] of testCases) {
  const result = pattern.test(url);
  const success = result === shouldMatch;

  if (success) {
    passed++;
    console.log(`✓ ${description}`);
  } else {
    failed++;
    console.log(`✗ ${description}`);
    console.log(`  URL: ${url}`);
    console.log(`  Expected: ${shouldMatch ? 'MATCH' : 'NO MATCH'}, Got: ${result ? 'MATCH' : 'NO MATCH'}`);
  }
}

console.log('');
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
