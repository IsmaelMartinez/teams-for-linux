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

  /**
   * Run all authentication detection spikes
   * @returns {object} Results of all spikes
   */
  runAllSpikes() {
    console.log('='.repeat(60));
    console.log('[AUTH_SPIKE] Starting Authentication Detection Spikes');
    console.log('='.repeat(60));

    // Spike 1: Can we detect logout state?
    this.results.spike1_detection = this.spike1_testAuthDetection();

    // Only proceed if Spike 1 shows promise
    if (this.results.spike1_detection.structureAccessible) {
      // Spike 2: Can we avoid false positives?
      this.results.spike2_timing = this.spike2_testTiming();

      // Spike 3: URL-based detection as alternative
      this.results.spike3_urlDetection = this.spike3_testUrlDetection();
    }

    // Generate overall assessment
    this.results.overallResult = this._generateOverallAssessment();

    console.log('='.repeat(60));
    console.log('[AUTH_SPIKE] Spike Results Summary');
    console.log('='.repeat(60));
    console.log(JSON.stringify(this.results, null, 2));

    return this.results;
  }

  /**
   * Deep exploration of Teams React structure
   * Run this to discover the actual auth-related properties
   */
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

      // Find React fiber
      const reactKeys = Object.keys(appElement).filter(k =>
        k.startsWith('__react') || k.startsWith('_react')
      );
      exploration.findings.reactKeys = reactKeys;

      // Try multiple paths to React root
      const internalRoot = appElement._reactRootContainer?._internalRoot ||
                          appElement._reactRootContainer;

      if (internalRoot) {
        exploration.findings.hasInternalRoot = true;

        // Explore the fiber tree
        const current = internalRoot.current;
        if (current) {
          exploration.findings.fiberType = current.type?.name || current.type || 'unknown';

          // Try to find coreServices at various depths
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

        // Get coreServices and explore auth-related properties
        const coreServices = internalRoot?.current?.updateQueue?.baseState?.element?.props?.coreServices;
        if (coreServices) {
          exploration.findings.coreServicesKeys = Object.keys(coreServices);

          // Explore authenticationService deeply
          const authService = coreServices.authenticationService;
          if (authService) {
            exploration.findings.authServiceKeys = Object.keys(authService);

            // Check all properties for account-like data
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

            // Deep dive into _coreAuthService
            const coreAuth = authService._coreAuthService;
            if (coreAuth) {
              exploration.findings.coreAuthKeys = Object.keys(coreAuth);

              // Check authProvider
              const authProvider = coreAuth._authProvider;
              if (authProvider) {
                exploration.findings.authProviderKeys = Object.keys(authProvider);

                // Look for any account-related property
                for (const key of Object.keys(authProvider)) {
                  if (key.toLowerCase().includes('account') ||
                      key.toLowerCase().includes('user') ||
                      key.toLowerCase().includes('authenticated')) {
                    exploration.findings[`authProvider_${key}`] = {
                      value: authProvider[key],
                      type: typeof authProvider[key],
                      isTruthy: !!authProvider[key]
                    };
                  }
                }
              }
            }
          }

          // Check for alternative auth indicators
          exploration.findings.alternativeIndicators = {
            hasUserService: !!coreServices.userService,
            userServiceKeys: coreServices.userService ? Object.keys(coreServices.userService).slice(0, 10) : [],
            hasPresenceService: !!coreServices.presenceService,
            hasClientState: !!coreServices.clientState,
            clientStateKeys: coreServices.clientState ? Object.keys(coreServices.clientState).slice(0, 10) : []
          };

          // Check if there's user info anywhere
          if (coreServices.userService) {
            const us = coreServices.userService;
            for (const key of Object.keys(us)) {
              if (key.toLowerCase().includes('user') || key.toLowerCase().includes('current')) {
                exploration.findings[`userService_${key}`] = {
                  exists: us[key] !== undefined,
                  isTruthy: !!us[key],
                  type: typeof us[key]
                };
              }
            }
          }
        }
      }

      // Check for global Teams objects
      exploration.findings.globalObjects = {
        hasTeamsClientSdk: globalThis.microsoftTeams !== undefined,
        hasTeams: globalThis.teams !== undefined,
        hasTeamsForLinuxReactHandler: globalThis.teamsForLinuxReactHandler !== undefined
      };

      // Check localStorage for auth tokens
      exploration.findings.localStorageHints = {
        hasAuthKeys: Object.keys(localStorage).filter(k =>
          k.toLowerCase().includes('auth') ||
          k.toLowerCase().includes('token') ||
          k.toLowerCase().includes('account')
        ).slice(0, 5)
      };

    } catch (error) {
      exploration.error = error.message;
      exploration.stack = error.stack;
    }

    console.log('[AUTH_SPIKE] Exploration results:');
    console.log(JSON.stringify(exploration, null, 2));

    return exploration;
  }

  /**
   * Helper to get nested property by path string
   */
  _getNestedProperty(obj, path) {
    try {
      return path.split('.').reduce((current, key) => current?.[key], obj);
    } catch {
      return undefined;
    }
  }

  /**
   * SPIKE 1: Can We Detect Logout? (CRITICAL BLOCKER)
   * Tests if we can access and interpret the auth state from React internals
   */
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
      // Step 1: Check if we can get to the app element
      const appElement = document.getElementById('app');
      console.log('[AUTH_SPIKE 1] Has app element:', !!appElement);

      if (!appElement) {
        result.error = 'App element not found';
        return result;
      }

      // Step 2: Check React internals
      const internalRoot = appElement._reactRootContainer?._internalRoot || appElement._reactRootContainer;
      console.log('[AUTH_SPIKE 1] Has React root:', !!internalRoot);

      if (!internalRoot) {
        result.error = 'React root not found';
        return result;
      }

      // Step 3: Navigate to core services
      const coreServices = internalRoot?.current?.updateQueue?.baseState?.element?.props?.coreServices;
      console.log('[AUTH_SPIKE 1] Has coreServices:', !!coreServices);

      if (!coreServices) {
        result.error = 'Core services not found';
        return result;
      }

      result.structureAccessible = true;

      // Step 4: Check authenticationService
      const authService = coreServices?.authenticationService;
      console.log('[AUTH_SPIKE 1] Has authService:', !!authService);

      if (!authService) {
        result.error = 'Auth service not found, but structure is accessible';
        return result;
      }

      // Step 5: Get authProvider and try MSAL methods
      const authProvider = authService?._coreAuthService?._authProvider;
      result.authProviderFound = !!authProvider;

      if (!authProvider) {
        result.error = 'Auth provider not found';
        return result;
      }

      result.authProviderKeys = Object.keys(authProvider).filter(k =>
        k.includes('user') || k.includes('User') || k.includes('account') || k.includes('Account')
      );

      // Try MSAL methods to get active users
      const methodsToTry = [
        { name: 'getActiveUsers', method: authProvider.getActiveUsers },
        { name: 'getCachedUsers', method: authProvider.getCachedUsers },
        { name: 'getMappedActiveUserFromMsal2', method: authProvider.getMappedActiveUserFromMsal2 }
      ];

      let activeUsers = null;
      let workingMethod = null;

      for (const { name, method } of methodsToTry) {
        result.testedPaths.push(name);
        if (typeof method === 'function') {
          try {
            const methodResult = method.call(authProvider);
            console.log(`[AUTH_SPIKE 1] ${name}() returned:`, methodResult);

            if (methodResult !== undefined && methodResult !== null) {
              activeUsers = methodResult;
              workingMethod = name;
              break;
            }
          } catch (e) {
            console.log(`[AUTH_SPIKE 1] ${name}() failed:`, e.message);
          }
        }
      }

      // Step 6: Analyze active users result
      if (workingMethod) {
        result.workingPath = `${workingMethod}()`;

        // Check if we have users - handle various return types
        let hasUsers = false;
        let userCount = 0;

        if (Array.isArray(activeUsers)) {
          hasUsers = activeUsers.length > 0;
          userCount = activeUsers.length;
        } else if (activeUsers && typeof activeUsers === 'object') {
          // Could be a single user object or a map of users
          const keys = Object.keys(activeUsers);
          // If it has user-like properties, it's a single user
          if (activeUsers.id || activeUsers.homeAccountId || activeUsers.username || activeUsers.tenantId) {
            hasUsers = true;
            userCount = 1;
          } else if (keys.length > 0) {
            // It's a map/dictionary of users
            hasUsers = true;
            userCount = keys.length;
          }
        } else if (activeUsers) {
          // Some truthy value
          hasUsers = true;
          userCount = 1;
        }

        result.activeUsers = userCount;

        if (hasUsers) {
          result.accountProperty = 'has_active_users';
          result.isLoggedIn = true;
          result.detectionWorks = true;

          // Extract user info if available
          const firstUser = Array.isArray(activeUsers) ? activeUsers[0] : activeUsers;
          if (firstUser && typeof firstUser === 'object') {
            result.userInfo = {
              hasId: !!firstUser.id || !!firstUser.homeAccountId,
              hasTenant: !!firstUser.tenantId,
              hasUsername: !!firstUser.username || !!firstUser.name
            };
          }
        } else {
          result.accountProperty = 'no_active_users';
          result.isLoggedIn = false;
          result.detectionWorks = true;
        }
      } else {
        // Fall back to MSAL localStorage check
        result.accountProperty = 'methods_failed';
        result.detectionWorks = false;
      }

      // Step 6b: Also check MSAL localStorage for token validity
      result.msalState = this._checkMsalLocalStorage();

      console.log('[AUTH_SPIKE 1] Account property:', result.accountProperty);
      console.log('[AUTH_SPIKE 1] Detection works:', result.detectionWorks);
      console.log('[AUTH_SPIKE 1] Is logged in:', result.isLoggedIn);

      // Step 7: Check alternative signals
      result.alternativeSignals = this._checkAlternativeSignals(coreServices);

      // Step 8: Try localStorage-based detection as backup
      result.localStorageSignals = this._checkLocalStorageAuth();

      if (result.detectionWorks) {
        console.log('[AUTH_SPIKE 1] ✅ Auth detection WORKS via', result.workingPath || 'localStorage');
      } else {
        console.log('[AUTH_SPIKE 1] ❌ Auth detection does NOT work - need alternative approach');
      }

      return result;

    } catch (error) {
      console.error('[AUTH_SPIKE 1] ❌ Exception:', error.message);
      result.error = error.message;
      return result;
    }
  }

  /**
   * Check localStorage for auth-related data
   */
  _checkLocalStorageAuth() {
    const signals = {
      hasAuthData: false,
      authKeys: []
    };

    try {
      const authRelatedKeys = Object.keys(localStorage).filter(k => {
        const lower = k.toLowerCase();
        return lower.includes('auth') ||
               lower.includes('token') ||
               lower.includes('msal') ||
               lower.includes('account') ||
               lower.includes('credential');
      });

      signals.authKeys = authRelatedKeys.slice(0, 10);
      signals.hasAuthData = authRelatedKeys.length > 0;

      // Check if any MSAL keys exist (Microsoft Auth Library)
      const msalKeys = authRelatedKeys.filter(k => k.toLowerCase().includes('msal'));
      if (msalKeys.length > 0) {
        signals.hasMsalData = true;
        signals.msalKeyCount = msalKeys.length;

        // Try to parse one to see structure
        try {
          const sampleKey = msalKeys[0];
          const sampleValue = localStorage.getItem(sampleKey);
          if (sampleValue) {
            const parsed = JSON.parse(sampleValue);
            signals.msalSampleKeys = Object.keys(parsed).slice(0, 5);
          }
        } catch {
          // Ignore parse errors
        }
      }

    } catch (error) {
      signals.error = error.message;
    }

    return signals;
  }

  /**
   * Check MSAL localStorage for accounts and token validity
   * This is a more reliable way to detect valid auth state
   */
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
      // Check for msal.account.keys
      const accountKeysRaw = localStorage.getItem('msal.account.keys');
      if (accountKeysRaw) {
        try {
          const accountKeys = JSON.parse(accountKeysRaw);
          state.accountCount = Array.isArray(accountKeys) ? accountKeys.length : 0;
          state.hasAccounts = state.accountCount > 0;

          // Get account details
          for (const key of (accountKeys || []).slice(0, 3)) {
            const accountData = localStorage.getItem(key);
            if (accountData) {
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
          }
        } catch {
          // msal.account.keys might not be JSON
        }
      }

      // Find and check access tokens
      const now = Date.now();
      const accessTokenKeys = Object.keys(localStorage).filter(k =>
        k.includes('-accesstoken-') || k.includes('accesstoken')
      );

      let validTokenCount = 0;
      let expiredTokenCount = 0;
      let soonestExpiry = null;

      for (const key of accessTokenKeys.slice(0, 10)) {
        try {
          const tokenData = localStorage.getItem(key);
          if (tokenData) {
            const token = JSON.parse(tokenData);

            // MSAL stores expiresOn as Unix timestamp (seconds)
            const expiresOn = token.expiresOn || token.expires_on;
            if (expiresOn) {
              // Convert to milliseconds if needed
              const expiryMs = expiresOn > 9999999999 ? expiresOn : expiresOn * 1000;
              const isExpired = expiryMs < now;
              const timeUntilExpiry = expiryMs - now;

              if (isExpired) {
                expiredTokenCount++;
              } else {
                validTokenCount++;
                if (soonestExpiry === null || expiryMs < soonestExpiry) {
                  soonestExpiry = expiryMs;
                }
              }

              state.tokens.push({
                key: key.substring(0, 50) + '...',
                isExpired,
                expiresIn: isExpired ? 'expired' : `${Math.round(timeUntilExpiry / 60000)}min`,
                resource: token.target || token.resource || 'unknown'
              });
            }
          }
        } catch {
          // Skip malformed tokens
        }
      }

      state.validTokenCount = validTokenCount;
      state.expiredTokenCount = expiredTokenCount;
      state.hasValidTokens = validTokenCount > 0;

      if (validTokenCount > 0) {
        state.tokenStatus = 'valid';
        if (soonestExpiry) {
          const minsUntilExpiry = Math.round((soonestExpiry - now) / 60000);
          state.soonestExpiryMins = minsUntilExpiry;
          if (minsUntilExpiry < 5) {
            state.tokenStatus = 'expiring_soon';
          }
        }
      } else if (expiredTokenCount > 0) {
        state.tokenStatus = 'expired';
      } else if (state.hasAccounts) {
        state.tokenStatus = 'no_tokens_but_has_accounts';
      } else {
        state.tokenStatus = 'no_auth_data';
      }

      console.log('[AUTH_SPIKE] MSAL localStorage state:', state);

    } catch (error) {
      state.error = error.message;
    }

    return state;
  }

  /**
   * Check alternative authentication signals
   */
  _checkAlternativeSignals(coreServices) {
    const signals = {};

    try {
      // Check user service
      const userService = coreServices?.userService;
      signals.hasUserService = !!userService;

      if (userService) {
        // Look for any user-related property
        const userKeys = Object.keys(userService).filter(k =>
          k.toLowerCase().includes('user') || k.toLowerCase().includes('current')
        );
        signals.userServiceRelevantKeys = userKeys;

        for (const key of userKeys) {
          signals[`userService_${key}`] = !!userService[key];
        }
      }

      // Check client state
      const clientState = coreServices?.clientState;
      signals.hasClientState = !!clientState;

      if (clientState) {
        // Look for auth-related state
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

      // Check for presence service (often indicates logged in)
      const presenceService = coreServices?.presenceService;
      signals.hasPresenceService = !!presenceService;

      // Check for any "isAuthenticated" or similar flags
      for (const key of Object.keys(coreServices)) {
        const val = coreServices[key];
        if (val && typeof val === 'object') {
          if ('isAuthenticated' in val) signals[`${key}_isAuthenticated`] = val.isAuthenticated;
          if ('isLoggedIn' in val) signals[`${key}_isLoggedIn`] = val.isLoggedIn;
          if ('isSignedIn' in val) signals[`${key}_isSignedIn`] = val.isSignedIn;
        }
      }

      console.log('[AUTH_SPIKE 1] Alternative signals:', signals);

    } catch (error) {
      signals.error = error.message;
    }

    return signals;
  }

  /**
   * SPIKE 2: Can We Avoid False Positives?
   * Tests timing to understand when auth state becomes available
   */
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

    // Check URL patterns - updated for Teams v2
    const url = globalThis.location.href;
    const pathname = globalThis.location.pathname;

    result.isLoginPage = url.includes('login') ||
                         url.includes('auth') ||
                         url.includes('signin') ||
                         url.includes('oauth');

    // Teams v2 detection
    result.isTeamsV2 = pathname.startsWith('/v2');

    // Main app detection - updated for v2 routes
    result.isMainApp = url.includes('teams.microsoft.com') &&
                       !result.isLoginPage &&
                       (url.includes('conversations') ||
                        url.includes('chat') ||
                        url.includes('calendar') ||
                        url.includes('calls') ||
                        (result.isTeamsV2 && pathname !== '/v2/'));

    console.log('[AUTH_SPIKE 2] URL analysis:', {
      url: url.substring(0, 100),
      pathname,
      isLoginPage: result.isLoginPage,
      isMainApp: result.isMainApp,
      isTeamsV2: result.isTeamsV2
    });

    // Check auth state right now (without re-running full spike)
    const authState = this.results.spike1_detection || this.spike1_testAuthDetection();
    result.currentAuthState = authState.isLoggedIn;
    result.detectionWorks = authState.detectionWorks;

    // Consistency check
    if (result.isLoginPage) {
      result.authStateConsistent = !authState.isLoggedIn;
    } else if (result.isMainApp && authState.detectionWorks) {
      result.authStateConsistent = true; // Can't verify without comparison
    } else {
      result.authStateConsistent = false; // Ambiguous
    }

    // Recommendation based on findings
    if (!authState.detectionWorks) {
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

    // Strategy recommendation
    result.proposedStrategy = {
      step1: 'Wait 10-15 seconds after app start before first check',
      step2: 'Check URL first - if login page, definitely logged out',
      step3: 'If main app URL, check auth signal (need working detection first!)',
      step4: 'Only report logged out if: (!authenticated AND (isLoginPage OR waited > 30s))',
      step5: 'Poll every 30 seconds after initial delay'
    };

    console.log('[AUTH_SPIKE 2] Timing analysis complete');
    console.log('[AUTH_SPIKE 2] Recommendation:', result.recommendation);

    return result;
  }

  /**
   * SPIKE 3: URL-Based Detection Alternative
   * Tests if URL alone can reliably indicate login state
   */
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

    // Test various URL patterns - updated for Teams v2
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

    // Determine likely state from URL
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
    result.canUseAsPrimary = loginIndicators; // Only login pages are definitive
    result.recommendation = loginIndicators
      ? 'URL clearly indicates login page - use as primary signal'
      : 'URL not definitive for logged-in state - need React internals or localStorage signals';

    console.log('[AUTH_SPIKE 3] URL detection result:', result.urlIndicatesState, '(confidence:', result.confidence + ')');

    return result;
  }

  // ============================================
  // Token Management Scripts for Testing
  // ============================================

  /**
   * View current auth state (safe, no changes)
   */
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

  /**
   * Expire all tokens (sets expiry to past - tokens stay but are invalid)
   */
  expireAllTokens() {
    const tokenKeys = Object.keys(localStorage).filter(k => k.includes('-accesstoken-'));
    let count = 0;

    tokenKeys.forEach(key => {
      try {
        const token = JSON.parse(localStorage.getItem(key));
        // Set expiry to 1 hour ago
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

  /**
   * Clear all tokens (removes them entirely)
   */
  clearAllTokens() {
    const tokenKeys = Object.keys(localStorage).filter(k =>
      k.includes('-accesstoken-') ||
      k.includes('-refreshtoken-') ||
      k.includes('-idtoken-')
    );

    tokenKeys.forEach(key => localStorage.removeItem(key));
    console.log(`✅ Cleared ${tokenKeys.length} tokens.`);
    return { clearedCount: tokenKeys.length };
  }

  /**
   * Clear everything (full logout simulation)
   */
  clearAllMsalData() {
    const msalKeys = Object.keys(localStorage).filter(k =>
      k.includes('msal') ||
      k.includes('-accesstoken-') ||
      k.includes('-refreshtoken-') ||
      k.includes('-idtoken-') ||
      k.includes('tmp.auth')
    );

    console.log('Removing:', msalKeys);
    msalKeys.forEach(key => localStorage.removeItem(key));
    console.log(`✅ Cleared ${msalKeys.length} MSAL-related keys.`);
    console.log('⚠️  Reload the page to trigger re-authentication.');
    return { clearedCount: msalKeys.length, keys: msalKeys };
  }

  /**
   * List all auth-related keys
   */
  listAuthKeys() {
    const keys = Object.keys(localStorage).filter(k => {
      const lower = k.toLowerCase();
      return lower.includes('msal') ||
             lower.includes('token') ||
             lower.includes('auth') ||
             lower.includes('account');
    });

    console.log('=== Auth-related localStorage keys ===');
    keys.forEach(k => console.log(`  ${k}`));
    console.log(`Total: ${keys.length} keys`);
    return keys;
  }

  /**
   * Monitor auth state changes over time
   * Call this and observe console logs
   */
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

      // Log if state changed
      if (lastState !== null && lastState.isLoggedIn !== currentState.isLoggedIn) {
        console.log('[AUTH_SPIKE MONITOR] ⚠️ STATE CHANGED:', lastState.isLoggedIn, '→', currentState.isLoggedIn);
      } else {
        console.log(`[AUTH_SPIKE MONITOR] ${elapsed}ms: logged_in=${currentState.isLoggedIn}, detection_works=${currentState.detectionWorks}, url=${currentState.url}`);
      }

      lastState = currentState;
    };

    // Immediate check
    checkAuth();

    // Periodic checks
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

  /**
   * Generate overall assessment based on spike results
   */
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

    // Check Spike 1: React method detection
    if (s1?.detectionWorks) {
      assessment.canProceed = true;
      assessment.primaryMethod = `React MSAL methods (${s1.workingPath})`;
      console.log('[AUTH_SPIKE] ✅ Primary detection via', s1.workingPath);
    }

    // Check MSAL localStorage as alternative/backup
    const msalState = s1?.msalState;
    if (msalState?.hasValidTokens || msalState?.hasAccounts) {
      if (assessment.primaryMethod) {
        assessment.backupMethod = 'MSAL localStorage (token expiry check)';
      } else {
        assessment.primaryMethod = 'MSAL localStorage (token expiry check)';
        assessment.canProceed = true;
      }

      // Report token status
      if (msalState.tokenStatus === 'valid') {
        assessment.tokenInfo = {
          status: 'valid',
          validTokens: msalState.validTokenCount,
          soonestExpiryMins: msalState.soonestExpiryMins
        };
      } else if (msalState.tokenStatus === 'expired') {
        assessment.tokenInfo = {
          status: 'expired',
          expiredTokens: msalState.expiredTokenCount
        };
        assessment.warnings.push('All tokens are expired - user may need to re-authenticate');
      } else if (msalState.tokenStatus === 'expiring_soon') {
        assessment.tokenInfo = {
          status: 'expiring_soon',
          expiresInMins: msalState.soonestExpiryMins
        };
        assessment.warnings.push(`Tokens expiring in ${msalState.soonestExpiryMins} minutes`);
      }

      console.log('[AUTH_SPIKE] ✅ MSAL localStorage detection available');
    }

    // If neither primary method works
    if (!assessment.canProceed) {
      if (s1?.authProviderFound) {
        assessment.warnings.push('Auth provider found but MSAL methods returned no users');
        assessment.recommendations.push('User may be logged out or session expired');
      } else if (s1?.structureAccessible) {
        assessment.warnings.push('React structure accessible but auth provider not found');
      } else {
        assessment.warnings.push('React structure not accessible');
      }
    }

    // Check URL-based detection for logout page
    if (s3?.canUseAsBackup) {
      if (!assessment.backupMethod) {
        assessment.backupMethod = 'URL pattern detection';
      }
      if (s3.urlIndicatesState === 'logged_out') {
        assessment.recommendations.push('URL indicates login page - high confidence logged out');
      }
    }

    // Add timing recommendations
    if (assessment.canProceed) {
      assessment.recommendations.push(
        'Implement 15-second startup delay before first check',
        'Poll every 30 seconds, check token expiry',
        'Use MSAL localStorage for token validity (valid/expired/expiring_soon)'
      );
    }

    // Final verdict
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

    return assessment;
  }
}

// Create and expose instance
const authSpikesInstance = new AuthDetectionSpikes();

// Make available in browser context
if (globalThis.window !== undefined) {
  globalThis.teamsForLinuxAuthSpikes = authSpikesInstance;
}

module.exports = authSpikesInstance;
