/**
 * Main orchestrator for Azure App Registration authentication module.
 */

const { isEnabled, getAuthMethod } = require('./config');
const { createCachePlugin } = require('./cache');
const {
  createPublicClientApplication,
  acquireTokenSilent,
  acquireTokenDeviceCode,
  acquireTokenInteractive,
  seedSessionCookies,
} = require('./authFlow');

let currentStatus = { status: 'idle', method: null, error: null };
let deviceCodeCallbackListener = null;
let settingsStoreRef = null;

const getStatus = () => currentStatus;

const initialize = (config, options = {}) => {
  if (options.settingsStore) {
    settingsStoreRef = options.settingsStore;
  }
};

const registerIpcHandlers = (ipcMain) => {
  if (!ipcMain || typeof ipcMain.handle !== 'function') return;

  try {
    ipcMain.handle('app-registration-auth-status', () => getStatus());
  } catch (err) {
    console.debug('[Auth] IPC handler registration warning:', err.message);
  }
};

const notifyDeviceCode = (deviceCodeData, webContents) => {
  if (typeof deviceCodeCallbackListener === 'function') {
    deviceCodeCallbackListener(deviceCodeData);
  }
  if (webContents && typeof webContents.send === 'function') {
    webContents.send('app-registration-device-code', deviceCodeData);
  }
};

const authenticate = async (config, options = {}) => {
  if (!isEnabled(config)) {
    return { success: false, error: 'App registration auth is disabled' };
  }

  currentStatus = { status: 'authenticating', method: null, error: null };
  const settingsStore = options.settingsStore || settingsStoreRef;
  const cachePlugin = settingsStore ? createCachePlugin(settingsStore) : null;

  try {
    const pca = createPublicClientApplication(config, cachePlugin);
    const tokenCache = pca.getTokenCache();
    const accounts = await tokenCache.getAllAccounts();

    // 1. Try silent authentication if cached account exists
    if (accounts.length > 0) {
      console.info('[Auth] Cached account found, attempting silent token acquisition');
      const silentResult = await acquireTokenSilent(pca, config, accounts[0]);
      if (silentResult) {
        await seedSessionCookies(config, options);
        currentStatus = { status: 'success', method: 'silent', error: null };
        return { success: true, method: 'silent' };
      }
    }

    // 2. Select flow based on authMethod config
    const configuredMethod = getAuthMethod(config);
    let flowToUse = configuredMethod;
    if (configuredMethod === 'auto') {
      const hasDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
      flowToUse = hasDisplay ? 'interactive' : 'deviceCode';
    }

    let authResult = null;

    if (flowToUse === 'interactive') {
      try {
        console.info('[Auth] Starting interactive authentication flow');
        authResult = await acquireTokenInteractive(pca, config, options);
        currentStatus = { status: 'success', method: 'interactive', error: null };
      } catch (interactiveError) {
        if (configuredMethod === 'auto') {
          console.warn(
            '[Auth] Interactive auth failed in auto mode, falling back to device-code flow'
          );
          flowToUse = 'deviceCode';
        } else {
          throw interactiveError;
        }
      }
    }

    if (flowToUse === 'deviceCode') {
      console.info('[Auth] Starting device-code authentication flow');
      authResult = await acquireTokenDeviceCode(pca, config, (data) => {
        notifyDeviceCode(data, options.webContents);
      });
      currentStatus = { status: 'success', method: 'deviceCode', error: null };
    }

    if (!authResult) {
      throw new Error('Authentication produced no token result');
    }

    // 3. Seed session cookies for Teams
    await seedSessionCookies(config, options);

    return { success: true, method: currentStatus.method };
  } catch (error) {
    console.error('[Auth] App registration authentication failed:', error.message);
    currentStatus = { status: 'error', method: null, error: error.message };
    return { success: false, error: error.message };
  }
};

module.exports = {
  initialize,
  authenticate,
  getStatus,
  registerIpcHandlers,
  onDeviceCode: (fn) => {
    deviceCodeCallbackListener = fn;
  },
};

