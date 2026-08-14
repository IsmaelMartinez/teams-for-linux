'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const identity = require('../../app/concurrentAccounts/identity');

function fakeJwt(claims) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
    'base64url'
  );
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.sig`;
}

describe('account identity helpers', () => {
  it('replaces This account with the signed-in email', () => {
    assert.strictEqual(
      identity.pickLabel({
        name: identity.PLACEHOLDER_NAME,
        identity: 'alex@contoso.example',
      }),
      'alex@contoso.example'
    );
  });

  it('keeps a custom name even when an identity is known', () => {
    assert.strictEqual(
      identity.pickLabel({
        name: 'Work',
        identity: 'alex@contoso.example',
      }),
      'Work'
    );
  });

  it('rejects values that are not emails', () => {
    assert.strictEqual(identity.normalizeIdentity('not-an-email'), null);
    assert.strictEqual(identity.normalizeIdentity(''), null);
    assert.strictEqual(identity.normalizeIdentity(42), null);
    assert.strictEqual(
      identity.normalizeIdentity('alex@contoso.example'),
      'alex@contoso.example'
    );
  });

  it('reads preferred_username from a JWT payload', () => {
    const token = fakeJwt({ preferred_username: 'alex@contoso.example' });
    assert.strictEqual(identity.identityFromJwt(token), 'alex@contoso.example');
  });

  it('reads an email from an auth object', () => {
    assert.strictEqual(
      identity.identityFromObject({ upn: 'alex@contoso.example' }),
      'alex@contoso.example'
    );
  });

  it('ignores non-auth storage keys', () => {
    const store = {
      'chat-draft': 'someone@contoso.example',
      'msal.idtoken': fakeJwt({ preferred_username: 'alex@contoso.example' }),
    };
    assert.strictEqual(
      identity.identityFromStorage((key) => store[key], Object.keys(store)),
      'alex@contoso.example'
    );
    assert.strictEqual(identity.isLikelyAuthStorageKey('chat-draft'), false);
    assert.strictEqual(identity.isLikelyAuthStorageKey('msal.token.keys'), true);
  });
});
