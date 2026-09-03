/**
 * MSAL authentication flows for Azure App Registration.
 * Handles device-code, interactive and silent token acquisition.
 */

const { PublicClientApplication, LogLevel, CryptoProvider } = require('@azure/msal-node');
const { getClientId, getTenantId, getScopes, getRedirectUri } = require('./config');

/**
 * Creates MSAL PublicClientApplication instance
 */
const createPublicClientApplication = (config, cachePlugin = null) => {
  const clientId = getClientId(config);
  const tenantId = getTenantId(config);

  const msalConfig = {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
    cache: cachePlugin ? { cachePlugin } : undefined,
    system: {
      loggerOptions: {
        loggerCallback: (level, message, containsPii) => {
          if (containsPii) return;
          if (level <= LogLevel.Warning) {
            console.debug(`[AuthFlow MSAL] ${message}`);
          }
        },
        piiLoggingEnabled: false,
        logLevel: LogLevel.Warning,
      },
    },
  };

  return new PublicClientApplication(msalConfig);
};

/**
 * Silent token acquisition for cached account
 */
const acquireTokenSilent = async (pca, config, account) => {
  const scopes = getScopes(config);
  try {
    const result = await pca.acquireTokenSilent({
      account,
      scopes,
    });
    return result;
  } catch (error) {
    console.debug('[AuthFlow] Silent token acquisition failed:', error?.message);
    return null;
  }
};

/**
 * Device-code authentication flow
 */
const acquireTokenDeviceCode = async (pca, config, onDeviceCodeCallback) => {
  const scopes = getScopes(config);
  try {
    const result = await pca.acquireTokenByDeviceCode({
      deviceCodeCallback: (response) => {
        if (typeof onDeviceCodeCallback === 'function') {
          onDeviceCodeCallback({
            userCode: response.userCode,
            verificationUri: response.verificationUri,
            message: response.message,
          });
        }
      },
      scopes,
    });
    return result;
  } catch (error) {
    console.error('[AuthFlow] Device-code authentication failed:', error.message);
    throw new Error(`Device-code authentication failed: ${error.message}`);
  }
};

/**
 * Interactive authentication flow using Electron BrowserWindow
 */
const acquireTokenInteractive = async (pca, config, dependencies = {}) => {
  const BrowserWindow = dependencies.BrowserWindow || require('electron').BrowserWindow;
  const scopes = getScopes(config);
  const redirectUri = getRedirectUri(config);

  const cryptoProvider = new CryptoProvider();
  const { verifier, challenge } = await cryptoProvider.generatePkceCodes();
  const state = cryptoProvider.createNewGuid();

  const authUrl = await pca.getAuthCodeUrl({
    scopes,
    redirectUri,
    state,
    codeChallenge: challenge,
    codeChallengeMethod: 'S256',
  });

  return new Promise((resolve, reject) => {
    let authWindow = new BrowserWindow({
      width: 800,
      height: 700,
      show: true,
      title: 'Sign in to Microsoft Account',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: config.partition || 'persist:teams-4-linux',
      },
    });

    let isResolved = false;

    const cleanup = () => {
      if (authWindow && !authWindow.isDestroyed()) {
        authWindow.close();
      }
      authWindow = null;
    };

    const handleRedirect = async (url) => {
      if (isResolved) return;

      try {
        const parsedUrl = new URL(url);
        const configuredRedirect = new URL(redirectUri);

        if (parsedUrl.origin === configuredRedirect.origin && parsedUrl.pathname === configuredRedirect.pathname) {
          isResolved = true;

          const code = parsedUrl.searchParams.get('code');
          const error = parsedUrl.searchParams.get('error');
          const returnedState = parsedUrl.searchParams.get('state');

          cleanup();

          if (error) {
            return reject(new Error(`Interactive login error: ${error}`));
          }
          if (!code) {
            return reject(new Error('Interactive login failed: missing authorization code'));
          }
          if (returnedState !== state) {
            return reject(new Error('Interactive login failed: state mismatch'));
          }

          const tokenResult = await pca.acquireTokenByCode({
            code,
            redirectUri,
            scopes,
            codeVerifier: verifier,
          });
          resolve(tokenResult);
        }
      } catch (err) {
        if (isResolved) {
          reject(err);
        }
      }
    };

    authWindow.webContents.on('will-navigate', (event, url) => {
      handleRedirect(url);
    });

    authWindow.webContents.on('will-redirect', (event, url) => {
      handleRedirect(url);
    });

    authWindow.on('closed', () => {
      if (!isResolved) {
        isResolved = true;
        reject(new Error('Authentication window was closed by the user'));
      }
    });

    authWindow.loadURL(authUrl).catch((err) => {
      if (!isResolved) {
        isResolved = true;
        cleanup();
        reject(err);
      }
    });
  });
};

module.exports = {
  createPublicClientApplication,
  acquireTokenSilent,
  acquireTokenDeviceCode,
  acquireTokenInteractive,
};

