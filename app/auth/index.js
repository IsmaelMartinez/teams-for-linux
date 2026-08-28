/**
 * Main orchestrator for Azure App Registration authentication module.
 */

const { dialog, clipboard, shell } = require('electron');
const { isEnabled, getAuthMethod } = require('./config');
const { createCachePlugin } = require('./cache');


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

const notifyDeviceCode = async (deviceCodeData) => {
  if (typeof deviceCodeCallbackListener === 'function') {
    deviceCodeCallbackListener(deviceCodeData);
  }
  
  clipboard.writeText(deviceCodeData.userCode);
  
  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'Teams Authentication Required',
    message: 'Sign in to Teams',
    detail: `Your device code is: ${deviceCodeData.userCode}\n(It has been copied to your clipboard)\n\nPlease click "Open Browser", paste the code, and sign in.`,
    buttons: ['Open Browser', 'Cancel'],
    defaultId: 0,
    cancelId: 1
  });
  
  if (response === 0) {
    shell.openExternal(deviceCodeData.verificationUri);
  }
};

const resolveFlow = (config) => {
  const configured = getAuthMethod(config);
  if (configured !== 'auto') return configured;
  return (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) ? 'interactive' : 'deviceCode';
};

const authenticate = async (config, options = {}) => {
  if (!isEnabled(config)) {
    return { success: false, error: 'App registration auth is disabled' };
  }

  currentStatus = { status: 'authenticating', method: null, error: null };
  const settingsStore = options.settingsStore || settingsStoreRef;
  const cachePlugin = settingsStore ? createCachePlugin(settingsStore) : null;

  try {
    const {
      createPublicClientApplication,
      acquireTokenSilent,
      acquireTokenDeviceCode,
      acquireTokenInteractive,
    } = require('./authFlow');

    const pca = createPublicClientApplication(config, cachePlugin);
    const tokenCache = pca.getTokenCache();
    const accounts = await tokenCache.getAllAccounts();

    // 1. Try silent authentication if cached account exists
    if (accounts.length > 0) {
      console.info('[Auth] Cached account found, attempting silent token acquisition');
      const silentResult = await acquireTokenSilent(pca, config, accounts[0]);
      if (silentResult) {
        currentStatus = { status: 'success', method: 'silent', error: null };
        return { success: true, method: 'silent' };
      }
    }

    // 2. Select flow based on authMethod config
    let flowToUse = resolveFlow(config);
    let authResult = null;

    if (flowToUse === 'interactive') {
      try {
        console.info('[Auth] Starting interactive authentication flow');
        authResult = await acquireTokenInteractive(pca, config, options);
        currentStatus = { status: 'success', method: 'interactive', error: null };
      } catch (interactiveError) {
        if (getAuthMethod(config) === 'auto') {
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
        // notifyDeviceCode is async but we just fire and forget here
        // as MSAL polls for the user to complete it in browser
        notifyDeviceCode(data);
      });
      currentStatus = { status: 'success', method: 'deviceCode', error: null };
    }

    if (!authResult) {
      throw new Error('Authentication produced no token result');
    }

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

