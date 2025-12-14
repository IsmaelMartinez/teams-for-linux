/**
 * Authentication Detection Validation Spikes
 *
 * Run these spikes to validate if the logout indicator feature is feasible.
 * These are throwaway validation tests - not production code.
 *
 * To run: From DevTools console:
 *   window.teamsForLinuxAuthSpikes.runAllSpikes();
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
    console.table(this.results);

    return this.results;
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
      alternativeSignals: {}
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

      // Step 5: Navigate to auth provider
      const coreAuthService = authService?._coreAuthService;
      const authProvider = coreAuthService?._authProvider;
      console.log('[AUTH_SPIKE 1] Has coreAuthService:', !!coreAuthService);
      console.log('[AUTH_SPIKE 1] Has authProvider:', !!authProvider);

      if (!authProvider) {
        result.error = 'Auth provider not found';
        return result;
      }

      result.authProviderFound = true;

      // Step 6: Check _account property
      const account = authProvider._account;
      result.accountProperty = account !== undefined ? (account ? 'populated' : 'null/empty') : 'undefined';
      result.isLoggedIn = !!account;

      console.log('[AUTH_SPIKE 1] Account property:', result.accountProperty);
      console.log('[AUTH_SPIKE 1] Is logged in:', result.isLoggedIn);

      // If account exists, log some non-sensitive info
      if (account) {
        console.log('[AUTH_SPIKE 1] Account has id:', !!account.id);
        console.log('[AUTH_SPIKE 1] Account has name:', !!account.name);
        console.log('[AUTH_SPIKE 1] Account keys:', Object.keys(account));
      }

      // Step 7: Check alternative signals
      result.alternativeSignals = this._checkAlternativeSignals(coreServices);

      if (result.isLoggedIn !== null) {
        console.log('[AUTH_SPIKE 1] ✅ Auth detection WORKS');
      }

      return result;

    } catch (error) {
      console.error('[AUTH_SPIKE 1] ❌ Exception:', error.message);
      result.error = error.message;
      return result;
    }
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
      signals.hasCurrentUser = !!userService?.currentUser;

      // Check client state
      const clientState = coreServices?.clientState;
      signals.hasClientState = !!clientState;

      // Check for presence service (often indicates logged in)
      const presenceService = coreServices?.presenceService;
      signals.hasPresenceService = !!presenceService;

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
      currentUrl: window.location.href,
      isLoginPage: false,
      isMainApp: false,
      documentReady: document.readyState,
      timestamp: Date.now()
    };

    // Check URL patterns
    const url = window.location.href;
    result.isLoginPage = url.includes('login') ||
                         url.includes('auth') ||
                         url.includes('signin') ||
                         url.includes('oauth');
    result.isMainApp = url.includes('teams.microsoft.com') &&
                       !result.isLoginPage &&
                       url.includes('conversations');

    console.log('[AUTH_SPIKE 2] URL analysis:', {
      url: url.substring(0, 100),
      isLoginPage: result.isLoginPage,
      isMainApp: result.isMainApp
    });

    // Check auth state right now
    const authState = this.spike1_testAuthDetection();
    result.currentAuthState = authState.isLoggedIn;
    result.authStateConsistent = (result.isLoginPage && !authState.isLoggedIn) ||
                                  (result.isMainApp && authState.isLoggedIn) ||
                                  (!result.isLoginPage && !result.isMainApp); // Still loading

    // Recommendation based on findings
    if (result.isLoginPage) {
      result.recommendation = 'URL indicates login page - safe to report logged out';
    } else if (result.isMainApp && authState.isLoggedIn) {
      result.recommendation = 'URL indicates main app and auth confirmed - safe to report logged in';
    } else if (!authState.structureAccessible) {
      result.recommendation = 'Still loading - wait before checking auth state';
    } else {
      result.recommendation = 'Ambiguous state - combine URL + auth check with delay';
    }

    // Strategy recommendation
    result.proposedStrategy = {
      step1: 'Wait 10-15 seconds after app start before first check',
      step2: 'Check URL first - if login page, definitely logged out',
      step3: 'If main app URL, check _account property',
      step4: 'Only report logged out if: (!_account AND (isLoginPage OR waited > 30s))',
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
      currentUrl: window.location.href,
      hostname: window.location.hostname,
      pathname: window.location.pathname,
      patterns: {}
    };

    const url = window.location.href.toLowerCase();
    const pathname = window.location.pathname.toLowerCase();

    // Test various URL patterns
    result.patterns = {
      hasLoginInUrl: url.includes('login'),
      hasAuthInUrl: url.includes('auth') || url.includes('oauth'),
      hasSigninInUrl: url.includes('signin') || url.includes('sign-in'),
      hasConversationsPath: pathname.includes('conversations') || pathname.includes('chat'),
      hasCalendarPath: pathname.includes('calendar'),
      hasMeetingsPath: pathname.includes('meetings'),
      isRootPath: pathname === '/' || pathname === ''
    };

    // Determine likely state from URL
    const loginIndicators = result.patterns.hasLoginInUrl ||
                           result.patterns.hasAuthInUrl ||
                           result.patterns.hasSigninInUrl;

    const appIndicators = result.patterns.hasConversationsPath ||
                         result.patterns.hasCalendarPath ||
                         result.patterns.hasMeetingsPath;

    if (loginIndicators) {
      result.urlIndicatesState = 'logged_out';
      result.confidence = 'high';
    } else if (appIndicators) {
      result.urlIndicatesState = 'logged_in';
      result.confidence = 'high';
    } else if (result.patterns.isRootPath) {
      result.urlIndicatesState = 'unknown';
      result.confidence = 'low';
      result.note = 'Root path - could be loading or redirecting';
    } else {
      result.urlIndicatesState = 'unknown';
      result.confidence = 'low';
    }

    result.canUseAsBackup = true;
    result.recommendation = loginIndicators
      ? 'URL clearly indicates login page - use as primary signal'
      : 'URL not definitive - use React internals as primary, URL as backup';

    console.log('[AUTH_SPIKE 3] URL detection result:', result.urlIndicatesState, '(confidence:', result.confidence + ')');

    return result;
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
        accountProperty: detection.accountProperty,
        url: window.location.pathname
      };

      readings.push(currentState);

      // Log if state changed
      if (lastState !== null && lastState.isLoggedIn !== currentState.isLoggedIn) {
        console.log('[AUTH_SPIKE MONITOR] ⚠️ STATE CHANGED:', lastState.isLoggedIn, '→', currentState.isLoggedIn);
      } else {
        console.log(`[AUTH_SPIKE MONITOR] ${elapsed}ms: logged_in=${currentState.isLoggedIn}, url=${currentState.url}`);
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

    // Check Spike 1 results
    const s1 = this.results.spike1_detection;
    if (s1?.authProviderFound && s1?.isLoggedIn !== null) {
      assessment.canProceed = true;
      assessment.primaryMethod = 'React internals (_account property)';
      console.log('[AUTH_SPIKE] ✅ Primary detection method works');
    } else if (s1?.structureAccessible) {
      assessment.warnings.push('Auth provider not found, but structure is accessible - may work after login');
      assessment.recommendations.push('Retry spike after full login');
    } else {
      assessment.warnings.push('React structure not accessible - Teams may have changed internals');
    }

    // Check Spike 3 for backup
    const s3 = this.results.spike3_urlDetection;
    if (s3?.canUseAsBackup) {
      assessment.backupMethod = 'URL pattern detection';
      assessment.recommendations.push('Use URL patterns as backup/confirmation');
    }

    // Check Spike 2 for timing
    const s2 = this.results.spike2_timing;
    if (s2?.proposedStrategy) {
      assessment.recommendations.push('Implement 15-second startup delay before first check');
      assessment.recommendations.push('Poll every 30 seconds after initial check');
    }

    // Final verdict
    if (assessment.canProceed) {
      assessment.status = 'GO';
      assessment.summary = 'Auth detection is feasible. Implement with timing delay and URL backup.';
    } else if (assessment.warnings.length > 0 && s3?.canUseAsBackup) {
      assessment.status = 'CONDITIONAL';
      assessment.summary = 'Primary method unclear. Could use URL-only detection as fallback.';
      assessment.canProceed = true; // URL-only is viable
    } else {
      assessment.status = 'BLOCKED';
      assessment.summary = 'Cannot reliably detect auth state. Feature not feasible.';
    }

    return assessment;
  }
}

// Create and expose instance
const authSpikesInstance = new AuthDetectionSpikes();

if (typeof globalThis !== 'undefined') {
  globalThis.teamsForLinuxAuthSpikes = authSpikesInstance;
}

if (typeof window !== 'undefined') {
  window.teamsForLinuxAuthSpikes = authSpikesInstance;
}

module.exports = authSpikesInstance;
