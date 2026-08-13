/**
 * Config helpers for Azure App Registration authentication module.
 * Reads configuration safely with fallback defaults and zero PII logging.
 */

const DEFAULT_TENANT_ID = 'common';
const DEFAULT_AUTH_METHOD = 'auto';
const DEFAULT_SCOPES = ['openid', 'profile', 'offline_access'];
const DEFAULT_REDIRECT_URI =
  'https://login.microsoftonline.com/common/oauth2/nativeclient';
const VALID_AUTH_METHODS = new Set(['auto', 'deviceCode', 'interactive']);

const getAppRegistrationConfig = (config) => config?.auth?.appRegistration || {};

const isEnabled = (config) => {
  const cfg = getAppRegistrationConfig(config);
  return Boolean(cfg.enabled && cfg.clientId);
};

const getClientId = (config) => {
  const cfg = getAppRegistrationConfig(config);
  return typeof cfg.clientId === 'string' ? cfg.clientId : '';
};

const getTenantId = (config) => {
  const cfg = getAppRegistrationConfig(config);
  return typeof cfg.tenantId === 'string' && cfg.tenantId.trim() !== ''
    ? cfg.tenantId.trim()
    : DEFAULT_TENANT_ID;
};

const getAuthMethod = (config) => {
  const cfg = getAppRegistrationConfig(config);
  return VALID_AUTH_METHODS.has(cfg.authMethod)
    ? cfg.authMethod
    : DEFAULT_AUTH_METHOD;
};

const getScopes = (config) => {
  const cfg = getAppRegistrationConfig(config);
  return Array.isArray(cfg.scopes) && cfg.scopes.length > 0
    ? cfg.scopes
    : DEFAULT_SCOPES;
};

const getRedirectUri = (config) => {
  const cfg = getAppRegistrationConfig(config);
  return typeof cfg.redirectUri === 'string' && cfg.redirectUri.trim() !== ''
    ? cfg.redirectUri.trim()
    : DEFAULT_REDIRECT_URI;
};

module.exports = {
  isEnabled,
  getClientId,
  getTenantId,
  getAuthMethod,
  getScopes,
  getRedirectUri,
};

