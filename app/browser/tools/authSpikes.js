/**
 * Authentication Detection Validation Spikes
 *
 * Run these spikes to validate if the logout indicator feature is feasible.
 * These are throwaway validation tests - not production code.
 *
 * To run: From DevTools console:
 *   window.teamsForLinuxAuthSpikes.runAllSpikes();
 *
 * To explore structure (for debugging):
 *   window.teamsForLinuxAuthSpikes.exploreStructure();
 */

class AuthDetectionSpikes {
  constructor() {
    this.results = {};
    this.timingData = [];
  }

  runAllSpikes() {
    console.log('='.repeat(60));
    console.log('[AUTH_SPIKE] Starting Authentication Detection Spikes');
    console.log('='.repeat(60));

    this.results.spike1_detection = this.spike1_testAuthDetection();

    if (this.results.spike1_detection.structureAccessible) {
      this.results.spike2_timing = this.spike2_testTiming();
      this.results.spike3_urlDetection = this.spike3_testUrlDetection();
    }

    this.results.overallResult = this._generateOverallAssessment();

    console.log('='.repeat(60));
    console.log('[AUTH_SPIKE] Spike Results Summary');
    console.log('='.repeat(60));
    console.log(JSON.stringify(this.results, null, 2));

    return this.results;
  }

  exploreStructure() {
    console.log('='.repeat(60));
    console.log('[AUTH_SPIKE] Exploring Teams React Structure');
    console.log('='.repeat(60));

    const exploration = {
      timestamp: new Date().toISOString(),
      url: globalThis.location.href,
      findings: {}
    };

    try {
      const appElement = document.getElementById('app');
      if (!appElement) {
        exploration.error = 'No app element';
        return exploration;
      }

      this._exploreReactKeys(appElement, exploration);
      this._exploreInternalRoot(appElement, exploration);
      this._exploreGlobalObjects(exploration);
      this._exploreLocalStorageHints(exploration);

    } catch (error) {
      exploration.error = error.message;
      exploration.stack = error.stack;
    }

    console.log('[AUTH_SPIKE] Exploration results:');
    console.log(JSON.stringify(exploration, null, 2));

    return exploration;
  }

  _exploreReactKeys(appElement, exploration) {
    const reactKeys = Object.keys(appElement).filter(k =>
      k.startsWith('__react') || k.startsWith('_react')
    );
    exploration.findings.reactKeys = reactKeys;
  }

  _exploreInternalRoot(appElement, exploration) {
    const internalRoot = appElement._reactRootContainer?._internalRoot ||
                        appElement._reactRootContainer;

    if (!internalRoot) {
      return;
    }

    exploration.findings.hasInternalRoot = true;
    const current = internalRoot.current;

    if (current) {
      exploration.findings.fiberType = current.type?.name || current.type || 'unknown';
      this._exploreFiberPaths(current, exploration);
    }

    const coreServices = internalRoot?.current?.updateQueue?.baseState?.element?.props?.coreServices;
    if (coreServices) {
      this._exploreCoreServices(coreServices, exploration);
    }
  }

  _exploreFiberPaths(current, exploration) {
    const paths = [
      'updateQueue.baseState.element.props.coreServices',
      'memoizedState.element.props.coreServices',
      'child.memoizedProps.coreServices',
      'child.child.memoizedProps.coreServices'
    ];

    for (const path of paths) {
      const value = this._getNestedProperty(current, path);
      if (value) {
        exploration.findings[`path_${path.replaceAll('.', '_')}`] = {
          found: true,
          keys: Object.keys(value).slice(0, 20)
        };
      }
    }
  }

  _exploreCoreServices(coreServices, exploration) {
    exploration.findings.coreServicesKeys = Object.keys(coreServices);

    const authService = coreServices.authenticationService;
    if (authService) {
      this._exploreAuthService(authService, exploration);
    }

    this._exploreAlternativeIndicators(coreServices, exploration);
  }

  _exploreAuthService(authService, exploration) {
    exploration.findings.authServiceKeys = Object.keys(authService);

    for (const key of Object.keys(authService)) {
      const val = authService[key];
      if (val && typeof val === 'object') {
        const subKeys = Object.keys(val);
        exploration.findings[`authService_${key}`] = {
          type: typeof val,
          keys: subKeys.slice(0, 10),
          hasAccount: subKeys.some(k => k.toLowerCase().includes('account')),
          hasUser: subKeys.some(k => k.toLowerCase().includes('user')),
          hasToken: subKeys.some(k => k.toLowerCase().includes('token'))
        };
      }
    }

    this._exploreCoreAuthService(authService, exploration);
  }

  _exploreCoreAuthService(authService, exploration) {
    const coreAuth = authService._coreAuthService;
    if (!coreAuth) {
      return;
    }

    exploration.findings.coreAuthKeys = Object.keys(coreAuth);
    const authProvider = coreAuth._authProvider;

    if (!authProvider) {
      return;
    }

    exploration.findings.authProviderKeys = Object.keys(authProvider);

    for (const key of Object.keys(authProvider)) {
      const lower = key.toLowerCase();
      if (lower.includes('account') || lower.includes('user') || lower.includes('authenticated')) {
        exploration.findings[`authProvider_${key}`] = {
          value: authProvider[key],
          type: typeof authProvider[key],
          isTruthy: !!authProvider[key]
        };
      }
    }
  }

  _exploreAlternativeIndicators(coreServices, exploration) {
    exploration.findings.alternativeIndicators = {
      hasUserService: !!coreServices.userService,
      userServiceKeys: coreServices.userService ? Object.keys(coreServices.userService).slice(0, 10) : [],
      hasPresenceService: !!coreServices.presenceService,
      hasClientState: !!coreServices.clientState,
      clientStateKeys: coreServices.clientState ? Object.keys(coreServices.clientState).slice(0, 10) : []
    };

    if (coreServices.userService) {
      this._exploreUserService(coreServices.userService, exploration);
    }
  }

  _exploreUserService(userService, exploration) {
    for (const key of Object.keys(userService)) {
      const lower = key.toLowerCase();
      if (lower.includes('user') || lower.includes('current')) {
        exploration.findings[`userService_${key}`] = {
          exists: userService[key] !== undefined,
          isTruthy: !!userService[key],
          type: typeof userService[key]
        };
      }
    }
  }

  _exploreGlobalObjects(exploration) {
    exploration.findings.globalObjects = {
      hasTeamsClientSdk: globalThis.microsoftTeams !== undefined,
      hasTeams: globalThis.teams !== undefined,
      hasTeamsForLinuxReactHandler: globalThis.teamsForLinuxReactHandler !== undefined
    };
  }

  _exploreLocalStorageHints(exploration) {
    exploration.findings.localStorageHints = {
      hasAuthKeys: Object.keys(localStorage).filter(k =>
        k.toLowerCase().includes('auth') ||
        k.toLowerCase().includes('token') ||
        k.toLowerCase().includes('account')
      ).slice(0, 5)
    };
  }

  _getNestedProperty(obj, path) {
    try {
      return path.split('.').reduce((current, key) => current?.[key], obj);
    } catch {
      return undefined;
    }
  }

  spike1_testAuthDetection() {
    console.log('[AUTH_SPIKE 1] Testing auth detection...');

    const result = {
      spike: 'Auth Detection',
      structureAccessible: false,
      authProviderFound: false,
      accountProperty: null,
      isLoggedIn: null,
      detectionWorks: false,
      alternativeSignals: {},
      testedPaths: []
    };

    try {
      const coreServices = this._getCoreServices(result);
      if (!coreServices) {
        return result;
      }

      result.structureAccessible = true;
      const authProvider = this._getAuthProvider(coreServices, result);

      if (authProvider) {
        this._testAuthMethods(authProvider, result);
      }

      result.msalState = this._checkMsalLocalStorage();
      this._logDetectionResults(result);

      result.alternativeSignals = this._checkAlternativeSignals(coreServices);
      result.localStorageSignals = this._checkLocalStorageAuth();

      return result;

    } catch (error) {
      console.error('[AUTH_SPIKE 1] ❌ Exception:', error.message);
      result.error = error.message;
      return result;
    }
  }

  _getCoreServices(result) {
    const appElement = document.getElementById('app');
    console.log('[AUTH_SPIKE 1] Has app element:', !!appElement);

    if (!appElement) {
      result.error = 'App element not found';
      return null;
    }

    const internalRoot = appElement._reactRootContainer?._internalRoot || appElement._reactRootContainer;
    console.log('[AUTH_SPIKE 1] Has React root:', !!internalRoot);

    if (!internalRoot) {
      result.error = 'React root not found';
      return null;
    }

    const coreServices = internalRoot?.current?.updateQueue?.baseState?.element?.props?.coreServices;
    console.log('[AUTH_SPIKE 1] Has coreServices:', !!coreServices);

    if (!coreServices) {
      result.error = 'Core services not found';
      return null;
    }

    return coreServices;
  }

  _getAuthProvider(coreServices, result) {
    const authService = coreServices?.authenticationService;
    console.log('[AUTH_SPIKE 1] Has authService:', !!authService);

    if (!authService) {
      result.error = 'Auth service not found, but structure is accessible';
      return null;
    }

    const authProvider = authService?._coreAuthService?._authProvider;
    result.authProviderFound = !!authProvider;

    if (!authProvider) {
      result.error = 'Auth provider not found';
      return null;
    }

    result.authProviderKeys = Object.keys(authProvider).filter(k =>
      k.includes('user') || k.includes('User') || k.includes('account') || k.includes('Account')
    );

    return authProvider;
  }

  _testAuthMethods(authProvider, result) {
    const methodsToTry = [
      { name: 'getActiveUsers', method: authProvider.getActiveUsers },
      { name: 'getCachedUsers', method: authProvider.getCachedUsers },
      { name: 'getMappedActiveUserFromMsal2', method: authProvider.getMappedActiveUserFromMsal2 }
    ];

    const activeUsers = this._tryAuthMethods(authProvider, methodsToTry, result);

    if (result.workingPath) {
      this._analyzeActiveUsers(activeUsers, result);
    } else {
      result.accountProperty = 'methods_failed';
      result.detectionWorks = false;
    }
  }

  _tryAuthMethods(authProvider, methodsToTry, result) {
    for (const { name, method } of methodsToTry) {
      result.testedPaths.push(name);
      if (typeof method !== 'function') {
        continue;
      }

      try {
        const methodResult = method.call(authProvider);
        console.log(`[AUTH_SPIKE 1] ${name}() returned:`, methodResult);

        if (methodResult !== undefined && methodResult !== null) {
          result.workingPath = `${name}()`;
          return methodResult;
        }
      } catch (e) {
        console.log(`[AUTH_SPIKE 1] ${name}() failed:`, e.message);
      }
    }
    return null;
  }

  _analyzeActiveUsers(activeUsers, result) {
    const { hasUsers, userCount } = this._countUsers(activeUsers);
    result.activeUsers = userCount;

    if (hasUsers) {
      result.accountProperty = 'has_active_users';
      result.isLoggedIn = true;
      result.detectionWorks = true;
      this._extractUserInfo(activeUsers, result);
    } else {
      result.accountProperty = 'no_active_users';
      result.isLoggedIn = false;
      result.detectionWorks = true;
    }
  }

  _countUsers(activeUsers) {
    if (Array.isArray(activeUsers)) {
      return { hasUsers: activeUsers.length > 0, userCount: activeUsers.length };
    }

    if (activeUsers && typeof activeUsers === 'object') {
      const keys = Object.keys(activeUsers);
      const isUserObject = activeUsers.id || activeUsers.homeAccountId || activeUsers.username || activeUsers.tenantId;

      if (isUserObject) {
        return { hasUsers: true, userCount: 1 };
      }
      if (keys.length > 0) {
        return { hasUsers: true, userCount: keys.length };
      }
    }

    if (activeUsers) {
      return { hasUsers: true, userCount: 1 };
    }

    return { hasUsers: false, userCount: 0 };
  }

  _extractUserInfo(activeUsers, result) {
    const firstUser = Array.isArray(activeUsers) ? activeUsers[0] : activeUsers;
    if (firstUser && typeof firstUser === 'object') {
      result.userInfo = {
        hasId: !!firstUser.id || !!firstUser.homeAccountId,
        hasTenant: !!firstUser.tenantId,
        hasUsername: !!firstUser.username || !!firstUser.name
      };
    }
  }

  _logDetectionResults(result) {
    console.log('[AUTH_SPIKE 1] Account property:', result.accountProperty);
    console.log('[AUTH_SPIKE 1] Detection works:', result.detectionWorks);
    console.log('[AUTH_SPIKE 1] Is logged in:', result.isLoggedIn);

    if (result.detectionWorks) {
      console.log('[AUTH_SPIKE 1] ✅ Auth detection WORKS via', result.workingPath || 'localStorage');
    } else {
      console.log('[AUTH_SPIKE 1] ❌ Auth detection does NOT work - need alternative approach');
    }
  }

  _checkLocalStorageAuth() {
    const signals = { hasAuthData: false, authKeys: [] };

    try {
      const authRelatedKeys = Object.keys(localStorage).filter(k => {
        const lower = k.toLowerCase();
        return lower.includes('auth') || lower.includes('token') ||
               lower.includes('msal') || lower.includes('account') ||
               lower.includes('credential');
      });

      signals.authKeys = authRelatedKeys.slice(0, 10);
      signals.hasAuthData = authRelatedKeys.length > 0;

      this._checkMsalKeys(authRelatedKeys, signals);

    } catch (error) {
      signals.error = error.message;
    }

    return signals;
  }

  _checkMsalKeys(authRelatedKeys, signals) {
    const msalKeys = authRelatedKeys.filter(k => k.toLowerCase().includes('msal'));
    if (msalKeys.length === 0) {
      return;
    }

    signals.hasMsalData = true;
    signals.msalKeyCount = msalKeys.length;

    try {
      const sampleValue = localStorage.getItem(msalKeys[0]);
      if (sampleValue) {
        const parsed = JSON.parse(sampleValue);
        signals.msalSampleKeys = Object.keys(parsed).slice(0, 5);
      }
    } catch {
      // Ignore parse errors
    }
  }

  _checkMsalLocalStorage() {
    const state = {
      hasAccounts: false,
      accountCount: 0,
      hasValidTokens: false,
      tokenStatus: 'unknown',
      accounts: [],
      tokens: []
    };

    try {
      this._checkMsalAccounts(state);
      this._checkAccessTokens(state);
      this._determineTokenStatus(state);
      console.log('[AUTH_SPIKE] MSAL localStorage state:', state);

    } catch (error) {
      state.error = error.message;
    }

    return state;
  }

  _checkMsalAccounts(state) {
    const accountKeysRaw = localStorage.getItem('msal.account.keys');
    if (!accountKeysRaw) {
      return;
    }

    try {
      const accountKeys = JSON.parse(accountKeysRaw);
      state.accountCount = Array.isArray(accountKeys) ? accountKeys.length : 0;
      state.hasAccounts = state.accountCount > 0;

      for (const key of (accountKeys || []).slice(0, 3)) {
        this._parseAccountData(key, state);
      }
    } catch {
      // msal.account.keys might not be JSON
    }
  }

  _parseAccountData(key, state) {
    const accountData = localStorage.getItem(key);
    if (!accountData) {
      return;
    }

    try {
      const account = JSON.parse(accountData);
      state.accounts.push({
        hasHomeAccountId: !!account.homeAccountId,
        hasTenantId: !!account.tenantId,
        hasUsername: !!account.username,
        realm: account.realm || account.tenantId || 'unknown'
      });
    } catch {
      // Skip malformed accounts
    }
  }

  _checkAccessTokens(state) {
    const now = Date.now();
    const accessTokenKeys = Object.keys(localStorage).filter(k =>
      k.includes('-accesstoken-') || k.includes('accesstoken')
    );

    let validTokenCount = 0;
    let expiredTokenCount = 0;
    let soonestExpiry = null;

    for (const key of accessTokenKeys.slice(0, 10)) {
      const tokenResult = this._parseTokenExpiry(key, now);
      if (!tokenResult) {
        continue;
      }

      if (tokenResult.isExpired) {
        expiredTokenCount++;
      } else {
        validTokenCount++;
        if (soonestExpiry === null || tokenResult.expiryMs < soonestExpiry) {
          soonestExpiry = tokenResult.expiryMs;
        }
      }

      state.tokens.push(tokenResult.tokenInfo);
    }

    state.validTokenCount = validTokenCount;
    state.expiredTokenCount = expiredTokenCount;
    state.hasValidTokens = validTokenCount > 0;
    state.soonestExpiry = soonestExpiry;
  }

  _parseTokenExpiry(key, now) {
    try {
      const tokenData = localStorage.getItem(key);
      if (!tokenData) {
        return null;
      }

      const token = JSON.parse(tokenData);
      const expiresOn = token.expiresOn || token.expires_on;

      if (!expiresOn) {
        return null;
      }

      const expiryMs = expiresOn > 9999999999 ? expiresOn : expiresOn * 1000;
      const isExpired = expiryMs < now;
      const timeUntilExpiry = expiryMs - now;

      return {
        isExpired,
        expiryMs,
        tokenInfo: {
          key: key.substring(0, 50) + '...',
          isExpired,
          expiresIn: isExpired ? 'expired' : `${Math.round(timeUntilExpiry / 60000)}min`,
          resource: token.target || token.resource || 'unknown'
        }
      };
    } catch {
      return null;
    }
  }

  _determineTokenStatus(state) {
    const now = Date.now();

    if (state.validTokenCount > 0) {
      state.tokenStatus = 'valid';
      if (state.soonestExpiry) {
        const minsUntilExpiry = Math.round((state.soonestExpiry - now) / 60000);
        state.soonestExpiryMins = minsUntilExpiry;
        if (minsUntilExpiry < 5) {
          state.tokenStatus = 'expiring_soon';
        }
      }
    } else if (state.expiredTokenCount > 0) {
      state.tokenStatus = 'expired';
    } else if (state.hasAccounts) {
      state.tokenStatus = 'no_tokens_but_has_accounts';
    } else {
      state.tokenStatus = 'no_auth_data';
    }
  }

  _checkAlternativeSignals(coreServices) {
    const signals = {};

    try {
      this._checkUserServiceSignals(coreServices, signals);
      this._checkClientStateSignals(coreServices, signals);
      this._checkPresenceService(coreServices, signals);
      this._checkAuthFlags(coreServices, signals);
      console.log('[AUTH_SPIKE 1] Alternative signals:', signals);

    } catch (error) {
      signals.error = error.message;
    }

    return signals;
  }

  _checkUserServiceSignals(coreServices, signals) {
    const userService = coreServices?.userService;
    signals.hasUserService = !!userService;

    if (!userService) {
      return;
    }

    const userKeys = Object.keys(userService).filter(k =>
      k.toLowerCase().includes('user') || k.toLowerCase().includes('current')
    );
    signals.userServiceRelevantKeys = userKeys;

    for (const key of userKeys) {
      signals[`userService_${key}`] = !!userService[key];
    }
  }

  _checkClientStateSignals(coreServices, signals) {
    const clientState = coreServices?.clientState;
    signals.hasClientState = !!clientState;

    if (!clientState) {
      return;
    }

    const authKeys = Object.keys(clientState).filter(k =>
      k.toLowerCase().includes('auth') ||
      k.toLowerCase().includes('logged') ||
      k.toLowerCase().includes('signed')
    );
    signals.clientStateAuthKeys = authKeys;

    for (const key of authKeys) {
      signals[`clientState_${key}`] = clientState[key];
    }
  }

  _checkPresenceService(coreServices, signals) {
    signals.hasPresenceService = !!coreServices?.presenceService;
  }

  _checkAuthFlags(coreServices, signals) {
    for (const key of Object.keys(coreServices)) {
      const val = coreServices[key];
      if (val && typeof val === 'object') {
        if ('isAuthenticated' in val) signals[`${key}_isAuthenticated`] = val.isAuthenticated;
        if ('isLoggedIn' in val) signals[`${key}_isLoggedIn`] = val.isLoggedIn;
        if ('isSignedIn' in val) signals[`${key}_isSignedIn`] = val.isSignedIn;
      }
    }
  }

  spike2_testTiming() {
    console.log('[AUTH_SPIKE 2] Testing timing and false positive avoidance...');

    const result = {
      spike: 'Timing Analysis',
      currentUrl: globalThis.location.href,
      isLoginPage: false,
      isMainApp: false,
      isTeamsV2: false,
      documentReady: document.readyState,
      timestamp: Date.now()
    };

    this._analyzeUrl(result);
    this._checkAuthConsistency(result);
    this._generateTimingRecommendation(result);

    console.log('[AUTH_SPIKE 2] Timing analysis complete');
    console.log('[AUTH_SPIKE 2] Recommendation:', result.recommendation);

    return result;
  }

  _analyzeUrl(result) {
    const url = globalThis.location.href;
    const pathname = globalThis.location.pathname;

    result.isLoginPage = url.includes('login') || url.includes('auth') ||
                         url.includes('signin') || url.includes('oauth');
    result.isTeamsV2 = pathname.startsWith('/v2');
    result.isMainApp = url.includes('teams.microsoft.com') && !result.isLoginPage &&
                       (url.includes('conversations') || url.includes('chat') ||
                        url.includes('calendar') || url.includes('calls') ||
                        (result.isTeamsV2 && pathname !== '/v2/'));

    console.log('[AUTH_SPIKE 2] URL analysis:', {
      url: url.substring(0, 100),
      pathname,
      isLoginPage: result.isLoginPage,
      isMainApp: result.isMainApp,
      isTeamsV2: result.isTeamsV2
    });
  }

  _checkAuthConsistency(result) {
    const authState = this.results.spike1_detection || this.spike1_testAuthDetection();
    result.currentAuthState = authState.isLoggedIn;
    result.detectionWorks = authState.detectionWorks;

    if (result.isLoginPage) {
      result.authStateConsistent = !authState.isLoggedIn;
    } else if (result.isMainApp && authState.detectionWorks) {
      result.authStateConsistent = true;
    } else {
      result.authStateConsistent = false;
    }
  }

  _generateTimingRecommendation(result) {
    const authState = this.results.spike1_detection;

    if (!authState?.detectionWorks) {
      result.recommendation = 'PRIMARY DETECTION NOT WORKING - need to find alternative auth signal';
    } else if (result.isLoginPage) {
      result.recommendation = 'URL indicates login page - safe to report logged out';
    } else if (result.isMainApp && authState.isLoggedIn) {
      result.recommendation = 'URL indicates main app and auth confirmed - safe to report logged in';
    } else if (authState.structureAccessible) {
      result.recommendation = 'Ambiguous state - combine URL + auth check with delay';
    } else {
      result.recommendation = 'Still loading - wait before checking auth state';
    }

    result.proposedStrategy = {
      step1: 'Wait 10-15 seconds after app start before first check',
      step2: 'Check URL first - if login page, definitely logged out',
      step3: 'If main app URL, check auth signal (need working detection first!)',
      step4: 'Only report logged out if: (!authenticated AND (isLoginPage OR waited > 30s))',
      step5: 'Poll every 30 seconds after initial delay'
    };
  }

  spike3_testUrlDetection() {
    console.log('[AUTH_SPIKE 3] Testing URL-based detection...');

    const result = {
      spike: 'URL Detection',
      currentUrl: globalThis.location.href,
      hostname: globalThis.location.hostname,
      pathname: globalThis.location.pathname,
      patterns: {}
    };

    const url = globalThis.location.href.toLowerCase();
    const pathname = globalThis.location.pathname.toLowerCase();

    result.patterns = {
      hasLoginInUrl: url.includes('login'),
      hasAuthInUrl: url.includes('auth') || url.includes('oauth'),
      hasSigninInUrl: url.includes('signin') || url.includes('sign-in'),
      hasConversationsPath: pathname.includes('conversations') || pathname.includes('chat'),
      hasCalendarPath: pathname.includes('calendar'),
      hasMeetingsPath: pathname.includes('meetings') || pathname.includes('calls'),
      isRootPath: pathname === '/' || pathname === '',
      isV2Root: pathname === '/v2/' || pathname === '/v2',
      isV2WithContent: pathname.startsWith('/v2/') && pathname.length > 4
    };

    this._determineUrlState(result);

    console.log('[AUTH_SPIKE 3] URL detection result:', result.urlIndicatesState, '(confidence:', result.confidence + ')');

    return result;
  }

  _determineUrlState(result) {
    const loginIndicators = result.patterns.hasLoginInUrl ||
                           result.patterns.hasAuthInUrl ||
                           result.patterns.hasSigninInUrl;

    const appIndicators = result.patterns.hasConversationsPath ||
                         result.patterns.hasCalendarPath ||
                         result.patterns.hasMeetingsPath ||
                         result.patterns.isV2WithContent;

    if (loginIndicators) {
      result.urlIndicatesState = 'logged_out';
      result.confidence = 'high';
    } else if (appIndicators) {
      result.urlIndicatesState = 'logged_in';
      result.confidence = 'high';
    } else if (result.patterns.isRootPath || result.patterns.isV2Root) {
      result.urlIndicatesState = 'unknown';
      result.confidence = 'low';
      result.note = 'Root/v2 path - could be loading, logged in idle, or about to redirect to login';
    } else {
      result.urlIndicatesState = 'unknown';
      result.confidence = 'low';
    }

    result.canUseAsBackup = true;
    result.canUseAsPrimary = loginIndicators;
    result.recommendation = loginIndicators
      ? 'URL clearly indicates login page - use as primary signal'
      : 'URL not definitive for logged-in state - need React internals or localStorage signals';
  }

  viewAuthState() {
    const accountKeys = localStorage.getItem('msal.account.keys');
    const tokenKeys = Object.keys(localStorage).filter(k => k.includes('-accesstoken-'));

    console.log('=== MSAL Auth State ===');
    console.log('Account keys:', accountKeys);
    console.log('Token count:', tokenKeys.length);

    tokenKeys.forEach(key => {
      try {
        const token = JSON.parse(localStorage.getItem(key));
        const expiresOn = token.expiresOn || token.expires_on;
        const expiryMs = expiresOn > 9999999999 ? expiresOn : expiresOn * 1000;
        const isExpired = expiryMs < Date.now();
        const minsLeft = Math.round((expiryMs - Date.now()) / 60000);
        console.log(`  ${key.substring(0, 50)}...`);
        console.log(`    Status: ${isExpired ? '❌ EXPIRED' : '✅ VALID'}`);
        console.log(`    Expires: ${isExpired ? 'already expired' : minsLeft + ' mins'}`);
      } catch {
        console.log(`  ${key}: parse error`);
      }
    });

    return { accountKeys, tokenCount: tokenKeys.length };
  }

  expireAllTokens() {
    const tokenKeys = Object.keys(localStorage).filter(k => k.includes('-accesstoken-'));
    let count = 0;

    tokenKeys.forEach(key => {
      try {
        const token = JSON.parse(localStorage.getItem(key));
        token.expiresOn = Math.floor((Date.now() - 3600000) / 1000);
        token.expires_on = token.expiresOn;
        localStorage.setItem(key, JSON.stringify(token));
        count++;
      } catch (e) {
        console.error(`Failed to expire ${key}:`, e);
      }
    });

    console.log(`✅ Expired ${count} tokens. Run viewAuthState() to verify.`);
    return { expiredCount: count };
  }

  clearAllTokens() {
    const tokenKeys = Object.keys(localStorage).filter(k =>
      k.includes('-accesstoken-') || k.includes('-refreshtoken-') || k.includes('-idtoken-')
    );

    tokenKeys.forEach(key => localStorage.removeItem(key));
    console.log(`✅ Cleared ${tokenKeys.length} tokens.`);
    return { clearedCount: tokenKeys.length };
  }

  clearAllMsalData() {
    const msalKeys = Object.keys(localStorage).filter(k =>
      k.includes('msal') || k.includes('-accesstoken-') ||
      k.includes('-refreshtoken-') || k.includes('-idtoken-') ||
      k.includes('tmp.auth')
    );

    console.log('Removing:', msalKeys);
    msalKeys.forEach(key => localStorage.removeItem(key));
    console.log(`✅ Cleared ${msalKeys.length} MSAL-related keys.`);
    console.log('⚠️  Reload the page to trigger re-authentication.');
    return { clearedCount: msalKeys.length, keys: msalKeys };
  }

  listAuthKeys() {
    const keys = Object.keys(localStorage).filter(k => {
      const lower = k.toLowerCase();
      return lower.includes('msal') || lower.includes('token') ||
             lower.includes('auth') || lower.includes('account');
    });

    console.log('=== Auth-related localStorage keys ===');
    keys.forEach(k => console.log(`  ${k}`));
    console.log(`Total: ${keys.length} keys`);
    return keys;
  }

  startMonitoring(intervalMs = 5000, durationMs = 60000) {
    console.log(`[AUTH_SPIKE] Starting ${durationMs / 1000}s monitoring (checking every ${intervalMs / 1000}s)...`);

    let lastState = null;
    const startTime = Date.now();
    const readings = [];

    const checkAuth = () => {
      const elapsed = Date.now() - startTime;
      const detection = this.spike1_testAuthDetection();
      const currentState = {
        timestamp: elapsed,
        isLoggedIn: detection.isLoggedIn,
        detectionWorks: detection.detectionWorks,
        accountProperty: detection.accountProperty,
        url: globalThis.location.pathname
      };

      readings.push(currentState);

      if (lastState !== null && lastState.isLoggedIn !== currentState.isLoggedIn) {
        console.log('[AUTH_SPIKE MONITOR] ⚠️ STATE CHANGED:', lastState.isLoggedIn, '→', currentState.isLoggedIn);
      } else {
        console.log(`[AUTH_SPIKE MONITOR] ${elapsed}ms: logged_in=${currentState.isLoggedIn}, detection_works=${currentState.detectionWorks}, url=${currentState.url}`);
      }

      lastState = currentState;
    };

    checkAuth();

    const intervalId = setInterval(() => {
      if (Date.now() - startTime >= durationMs) {
        clearInterval(intervalId);
        console.log('[AUTH_SPIKE MONITOR] Monitoring complete. Readings:', readings);
        return;
      }
      checkAuth();
    }, intervalMs);

    return {
      stop: () => {
        clearInterval(intervalId);
        console.log('[AUTH_SPIKE MONITOR] Stopped early. Readings:', readings);
        return readings;
      }
    };
  }

  _generateOverallAssessment() {
    const assessment = {
      canProceed: false,
      primaryMethod: null,
      backupMethod: null,
      warnings: [],
      recommendations: []
    };

    const s1 = this.results.spike1_detection;
    const s3 = this.results.spike3_urlDetection;
    const msalState = s1?.msalState;

    this._assessPrimaryMethod(s1, assessment);
    this._assessMsalBackup(msalState, assessment);
    this._assessWarnings(s1, assessment);
    this._assessUrlBackup(s3, assessment);
    this._generateFinalVerdict(s1, msalState, s3, assessment);

    return assessment;
  }

  _assessPrimaryMethod(s1, assessment) {
    if (s1?.detectionWorks) {
      assessment.canProceed = true;
      assessment.primaryMethod = `React MSAL methods (${s1.workingPath})`;
      console.log('[AUTH_SPIKE] ✅ Primary detection via', s1.workingPath);
    }
  }

  _assessMsalBackup(msalState, assessment) {
    if (!msalState?.hasValidTokens && !msalState?.hasAccounts) {
      return;
    }

    if (assessment.primaryMethod) {
      assessment.backupMethod = 'MSAL localStorage (token expiry check)';
    } else {
      assessment.primaryMethod = 'MSAL localStorage (token expiry check)';
      assessment.canProceed = true;
    }

    this._assessTokenInfo(msalState, assessment);
    console.log('[AUTH_SPIKE] ✅ MSAL localStorage detection available');
  }

  _assessTokenInfo(msalState, assessment) {
    if (msalState.tokenStatus === 'valid') {
      assessment.tokenInfo = {
        status: 'valid',
        validTokens: msalState.validTokenCount,
        soonestExpiryMins: msalState.soonestExpiryMins
      };
    } else if (msalState.tokenStatus === 'expired') {
      assessment.tokenInfo = { status: 'expired', expiredTokens: msalState.expiredTokenCount };
      assessment.warnings.push('All tokens are expired - user may need to re-authenticate');
    } else if (msalState.tokenStatus === 'expiring_soon') {
      assessment.tokenInfo = { status: 'expiring_soon', expiresInMins: msalState.soonestExpiryMins };
      assessment.warnings.push(`Tokens expiring in ${msalState.soonestExpiryMins} minutes`);
    }
  }

  _assessWarnings(s1, assessment) {
    if (assessment.canProceed) {
      return;
    }

    if (s1?.authProviderFound) {
      assessment.warnings.push('Auth provider found but MSAL methods returned no users');
      assessment.recommendations.push('User may be logged out or session expired');
    } else if (s1?.structureAccessible) {
      assessment.warnings.push('React structure accessible but auth provider not found');
    } else {
      assessment.warnings.push('React structure not accessible');
    }
  }

  _assessUrlBackup(s3, assessment) {
    if (!s3?.canUseAsBackup) {
      return;
    }

    if (!assessment.backupMethod) {
      assessment.backupMethod = 'URL pattern detection';
    }
    if (s3.urlIndicatesState === 'logged_out') {
      assessment.recommendations.push('URL indicates login page - high confidence logged out');
    }
  }

  _generateFinalVerdict(s1, msalState, s3, assessment) {
    if (assessment.canProceed) {
      assessment.recommendations.push(
        'Implement 15-second startup delay before first check',
        'Poll every 30 seconds, check token expiry',
        'Use MSAL localStorage for token validity (valid/expired/expiring_soon)'
      );
    }

    if (assessment.canProceed && (s1?.detectionWorks || msalState?.hasValidTokens || msalState?.hasAccounts)) {
      assessment.status = 'GO';
      assessment.summary = 'Auth detection is feasible via MSAL methods and/or localStorage token check.';
    } else if (msalState?.hasAccounts && !msalState?.hasValidTokens) {
      assessment.status = 'GO';
      assessment.summary = 'Can detect auth state. Currently: accounts exist but tokens expired.';
      assessment.canProceed = true;
    } else if (s3?.urlIndicatesState === 'logged_out') {
      assessment.status = 'CONDITIONAL';
      assessment.summary = 'URL indicates logged out. Can detect logout via URL patterns.';
      assessment.canProceed = true;
    } else {
      assessment.status = 'NEEDS_INVESTIGATION';
      assessment.summary = 'Detection unclear. May be in loading state or need page refresh.';
    }
  }
}

const authSpikesInstance = new AuthDetectionSpikes();

if (globalThis.window !== undefined) {
  globalThis.teamsForLinuxAuthSpikes = authSpikesInstance;
}

module.exports = authSpikesInstance;
