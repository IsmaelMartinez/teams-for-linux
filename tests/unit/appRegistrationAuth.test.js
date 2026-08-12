'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const authConfig = require('../../app/auth/config');
const authCache = require('../../app/auth/cache');
const authFlow = require('../../app/auth/authFlow');
const authModule = require('../../app/auth/index');
const preloadTool = require('../../app/browser/tools/appRegistrationAuth');

describe('App Registration Auth - Config Helpers', () => {
  it('returns default values when config is empty or invalid', () => {
    assert.strictEqual(authConfig.isEnabled({}), false);
    assert.strictEqual(authConfig.getClientId({}), '');
    assert.strictEqual(authConfig.getTenantId({}), 'common');
    assert.strictEqual(authConfig.getAuthMethod({}), 'auto');
    assert.deepStrictEqual(authConfig.getScopes({}), ['openid', 'profile', 'offline_access']);
    assert.strictEqual(
      authConfig.getRedirectUri({}),
      'https://login.microsoftonline.com/common/oauth2/nativeclient'
    );
  });

  it('reads values from config correctly when present', () => {
    const customConfig = {
      auth: {
        appRegistration: {
          enabled: true,
          clientId: 'test-client-id-123',
          tenantId: 'my-tenant-id',
          authMethod: 'deviceCode',
          scopes: ['openid', 'User.Read'],
          redirectUri: 'http://localhost/callback',
        },
      },
    };

    assert.strictEqual(authConfig.isEnabled(customConfig), true);
    assert.strictEqual(authConfig.getClientId(customConfig), 'test-client-id-123');
    assert.strictEqual(authConfig.getTenantId(customConfig), 'my-tenant-id');
    assert.strictEqual(authConfig.getAuthMethod(customConfig), 'deviceCode');
    assert.deepStrictEqual(authConfig.getScopes(customConfig), ['openid', 'User.Read']);
    assert.strictEqual(authConfig.getRedirectUri(customConfig), 'http://localhost/callback');
  });
});

describe('App Registration Auth - Cache Module', () => {
  it('returns null when settingsStore is missing', async () => {
    const loaded = await authCache.loadTokenCache(null);
    assert.strictEqual(loaded, null);
  });

  it('creates MSAL cache plugin interface', () => {
    const plugin = authCache.createCachePlugin({});
    assert.strictEqual(typeof plugin.beforeCacheAccess, 'function');
    assert.strictEqual(typeof plugin.afterCacheAccess, 'function');
  });
});

describe('App Registration Auth - Main Orchestrator', () => {
  it('returns disabled error when auth is not enabled', async () => {
    const result = await authModule.authenticate({});
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, 'App registration auth is disabled');
  });

  it('returns status idle initially', () => {
    const status = authModule.getStatus();
    assert.ok(status);
    assert.strictEqual(typeof status.status, 'string');
  });
});

describe('App Registration Auth - Preload Tool', () => {
  it('skips initialization when disabled in config', () => {
    let listened = false;
    const dummyIpc = {
      on: () => {
        listened = true;
      },
    };

    preloadTool.init({}, dummyIpc);
    assert.strictEqual(listened, false);
  });
});
