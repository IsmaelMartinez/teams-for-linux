'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { reloadIfSignedOut } = require('../../app/mainAppWindow/signOutReload');

// Signing out ends on Microsoft's "You signed out of your account" page,
// which has no way back to sign-in. The root window and every profile view
// run this on did-finish-load to load Teams again from there.

function fakeWebContents(url) {
  return {
    loads: [],
    getURL: () => url,
    loadURL(...args) {
      this.loads.push(args);
      return Promise.resolve();
    },
  };
}

describe('reloadIfSignedOut', () => {
  for (const path of ['/common/oauth2/v2.0/logout', '/common/oauth2/logoutsession']) {
    it(`loads the given URL once from ${path} and tells the caller to stop`, () => {
      const wc = fakeWebContents(`https://login.microsoftonline.com${path}?post_logout_redirect_uri=x`);
      assert.strictEqual(reloadIfSignedOut(wc, 'https://teams.cloud.microsoft', 'UA'), true);
      assert.deepStrictEqual(wc.loads, [['https://teams.cloud.microsoft', { userAgent: 'UA' }]]);
    });
  }

  for (const url of [
    'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    'https://login.microsoftonline.com/common/login',
    'https://teams.cloud.microsoft/v2/logout',
    'https://teams.cloud.microsoft/',
    'about:blank',
  ]) {
    it(`leaves ${url} alone`, () => {
      const wc = fakeWebContents(url);
      assert.strictEqual(reloadIfSignedOut(wc, 'https://teams.cloud.microsoft', 'UA'), false);
      assert.deepStrictEqual(wc.loads, []);
    });
  }
});
