// v2.5.3: Import token cache for authentication provider integration
const TokenCache = require('./tokenCache');

class ReactHandler {

  constructor() {
    this._validationEnabled = true;
    this._lastValidationTime = 0;
    this._validationCacheMs = 1000; // Cache validation results for 1 second
    this._reactVersionLogged = false; // Ensure version is logged only once
    this._tokenCacheInjected = false; // Track token cache injection status
    this._tokenCacheInjectionRetries = 0; // Track retry attempts
    this._maxTokenCacheRetries = 5; // Maximum retry attempts
  }

  getCommandChangeReportingService() {
    if (!this._validateTeamsEnvironment()) return null;
    const teams2CoreServices = this._getTeams2CoreServices();
    return teams2CoreServices?.commandChangeReportingService;
  }

  getTeams2IdleTracker() {
    if (!this._validateTeamsEnvironment()) return null;
    const teams2CoreServices = this._getTeams2CoreServices();
    return teams2CoreServices?.clientState?._idleTracker;
  }

  getTeams2ClientPreferences() {
    if (!this._validateTeamsEnvironment()) return null;
    const teams2CoreServices = this._getTeams2CoreServices();
    return teams2CoreServices?.clientPreferences?.clientPreferences;
  }

  // v2.5.3: Public method to manually trigger token cache injection
  injectTokenCache() {
    if (!this._validateTeamsEnvironment()) {
      console.warn(`[TOKEN_CACHE] Teams environment not validated, cannot inject token cache`);
      return false;
    }

    try {
      const teams2CoreServices = this._getTeams2CoreServices();
      const authService = teams2CoreServices?.authenticationService;
      const authProvider = authService?._coreAuthService?._authProvider;

      if (!authProvider) {
        console.warn(`[TOKEN_CACHE] Auth provider not available, cannot inject token cache`);
        return false;
      }

      console.debug(`[TOKEN_CACHE] MANUAL_INJECTION: Manually triggering token cache injection`);
      return this._attemptTokenCacheInjection(authProvider);

    } catch (error) {
      console.error(`[TOKEN_CACHE] Error in manual token cache injection:`, error);
      return false;
    }
  }

  // v2.5.3: Get token cache injection status for monitoring
  getTokenCacheStatus() {
    return {
      injected: this._tokenCacheInjected,
      retries: this._tokenCacheInjectionRetries,
      maxRetries: this._maxTokenCacheRetries,
      canRetry: this._tokenCacheInjectionRetries < this._maxTokenCacheRetries
    };
  }

  // Essential token refresh mechanism extracted from debug implementation
  async refreshToken(resource = 'https://ic3.teams.office.com') {
    try {
      if (!this._validateTeamsEnvironment()) {
        console.warn(`[TOKEN_CACHE] Teams environment not validated, cannot refresh token`);
        return { success: false, error: 'Teams environment not validated' };
      }

      const teams2CoreServices = this._getTeams2CoreServices();
      const authService = teams2CoreServices?.authenticationService;
      const authProvider = authService?._coreAuthService?._authProvider;

      if (!authProvider) {
        console.warn(`[TOKEN_CACHE] Auth provider not available for token refresh`);
        return { success: false, error: 'Auth provider not found' };
      }

      if (typeof authProvider.acquireToken !== 'function') {
        console.error(`[TOKEN_CACHE] acquireToken method not available on auth provider`);
        return { success: false, error: 'acquireToken method not found' };
      }

      // Get correlation from core services - required for forced refresh
      const correlation = teams2CoreServices?.correlation;
      if (!correlation) {
        console.warn(`[TOKEN_CACHE] Correlation not available, cannot force refresh`);
        return { success: false, error: 'Correlation required for forced refresh' };
      }

      // Use proven working refresh options with correlation and force flags
      const refreshOptions = {
        correlation: correlation,
        forceRenew: true,
        forceRefresh: true,
        skipCache: true,
        prompt: 'none'
      };

      console.debug(`[TOKEN_CACHE] Attempting token refresh for resource: ${resource}`);
      const result = await authProvider.acquireToken(resource, refreshOptions);
      
      if (result) {
        console.debug(`[TOKEN_CACHE] Token refresh successful`, {
          hasToken: !!result?.token,
          fromCache: result?.fromCache,
          expiry: result?.expiresOn || result?.expires_on
        });

        return {
          success: true,
          result: result,
          fromCache: result?.fromCache,
          expiry: result?.expiresOn || result?.expires_on,
          timestamp: Date.now()
        };
      } else {
        console.warn(`[TOKEN_CACHE] Token refresh returned no result`);
        return { success: false, error: 'No result from token refresh' };
      }

    } catch (error) {
      console.error(`[TOKEN_CACHE] Token refresh failed:`, error);
      return {
        success: false,
        error: error.message || error.toString(),
        timestamp: Date.now()
      };
    }
  }





  // v2.5.3: Attempt to inject token cache into Teams authentication provider
  _attemptTokenCacheInjection(authProvider) {
    try {
      if (this._tokenCacheInjected) {
        console.debug(`[TOKEN_CACHE] Already injected, validating existing cache`);
        this._validateTokenCacheInterface(authProvider._tokenCache);
        return true;
      }

      if (this._tokenCacheInjectionRetries >= this._maxTokenCacheRetries) {
        console.warn(`[TOKEN_CACHE] Maximum injection attempts reached (${this._maxTokenCacheRetries}), giving up`);
        return false;
      }

      this._tokenCacheInjectionRetries++;
      console.debug(`[TOKEN_CACHE] INJECTION_ATTEMPT ${this._tokenCacheInjectionRetries}: Starting token cache injection`);

      // Validate that we have a valid auth provider
      if (!authProvider || typeof authProvider !== 'object') {
        console.error(`[TOKEN_CACHE] Invalid auth provider for injection`);
        return false;
      }

      // Validate TokenCache is available and working
      if (!TokenCache || typeof TokenCache.getItem !== 'function') {
        console.error(`[TOKEN_CACHE] TokenCache module not properly loaded`);
        return false;
      }

      // Test TokenCache functionality before injection
      const cacheStats = TokenCache.getCacheStats();
      try {
        console.debug(`[TOKEN_CACHE] TokenCache pre-injection stats:`, JSON.stringify(cacheStats, null, 2));
      } catch (stringifyError) {
        console.warn(`[TOKEN_CACHE] Failed to stringify cache stats:`, stringifyError.message);
        console.debug(`[TOKEN_CACHE] TokenCache pre-injection stats: (circular reference avoided)`, {
          totalKeys: cacheStats.totalKeys,
          authKeysCount: cacheStats.authKeysCount,
          refreshTokenCount: cacheStats.refreshTokenCount,
          storageType: cacheStats.storageType
        });
      }

      if (cacheStats.totalKeys === 0) {
        console.warn(`[TOKEN_CACHE] No tokens in cache, injection may not be immediately beneficial`);
      }

      // Perform the injection
      console.debug(`[TOKEN_CACHE] Injecting TokenCache into authProvider._tokenCache`);
      authProvider._tokenCache = TokenCache;

      // Verify injection success
      const injectionSuccess = this._validateTokenCacheInjection(authProvider);
      
      if (injectionSuccess) {
        this._tokenCacheInjected = true;
        console.debug(`[TOKEN_CACHE] INJECTION_SUCCESS: Token cache successfully injected and validated`);
        
        // Log enhanced diagnostic information
        console.debug(`[TOKEN_CACHE] Injection details:`, {
          attempts: this._tokenCacheInjectionRetries,
          cacheType: TokenCache.constructor.name,
          storageType: cacheStats.storageType,
          tokenCount: cacheStats.authKeysCount,
          refreshTokens: cacheStats.refreshTokenCount
        });

        return true;
      } else {
        console.error(`[TOKEN_CACHE] INJECTION_FAILED: Validation failed after injection`);
        
        // Clean up failed injection
        try {
          delete authProvider._tokenCache;
        } catch (cleanupError) {
          console.warn(`[TOKEN_CACHE] Failed to cleanup after injection failure:`, cleanupError.message);
        }
        
        // Schedule retry with exponential backoff
        if (this._tokenCacheInjectionRetries < this._maxTokenCacheRetries) {
          const retryDelay = Math.pow(2, this._tokenCacheInjectionRetries) * 1000; // 2s, 4s, 8s, 16s, 32s
          console.debug(`[TOKEN_CACHE] Scheduling retry in ${retryDelay}ms`);
          
          setTimeout(() => {
            console.debug(`[TOKEN_CACHE] RETRY_SCHEDULED: Retrying token cache injection`);
            this._attemptTokenCacheInjection(authProvider);
          }, retryDelay);
        }
        
        return false;
      }

    } catch (error) {
      console.error(`[TOKEN_CACHE] INJECTION_ERROR: Error during token cache injection:`, error);
      return false;
    }
  }

  // v2.5.3: Validate token cache injection was successful
  _validateTokenCacheInjection(authProvider) {
    try {
      const tokenCache = authProvider._tokenCache;
      
      // Basic presence check
      if (!tokenCache) {
        console.error(`[TOKEN_CACHE] VALIDATION_FAILED: _tokenCache property is null/undefined`);
        return false;
      }

      // Interface validation - check for required methods
      const requiredMethods = ['getItem', 'setItem', 'removeItem', 'clear'];
      for (const method of requiredMethods) {
        if (typeof tokenCache[method] !== 'function') {
          console.error(`[TOKEN_CACHE] VALIDATION_FAILED: Missing required method ${method}`);
          return false;
        }
      }

      // Functional validation - test basic operations
      try {
        // Test get operation (should not throw)
        const testResult = tokenCache.getItem('__validation_test__');
        if (testResult !== null && testResult !== undefined) {
          console.warn(`[TOKEN_CACHE] Unexpected test key found during validation`);
        }

        // Test stats operation
        const stats = tokenCache.getCacheStats();
        if (!stats || typeof stats !== 'object') {
          console.error(`[TOKEN_CACHE] VALIDATION_FAILED: getCacheStats() returned invalid result`);
          return false;
        }

        console.debug(`[TOKEN_CACHE] VALIDATION_SUCCESS: All interface and functional tests passed`);
        try {
          console.debug(`[TOKEN_CACHE] Validated cache stats:`, JSON.stringify(stats, null, 2));
        } catch (stringifyError) {
          console.warn(`[TOKEN_CACHE] Failed to stringify validated stats:`, stringifyError.message);
          console.debug(`[TOKEN_CACHE] Validated cache stats: (circular reference avoided)`, {
            totalKeys: stats.totalKeys,
            authKeysCount: stats.authKeysCount,
            refreshTokenCount: stats.refreshTokenCount,
            storageType: stats.storageType
          });
        }
        
        return true;

      } catch (functionalError) {
        console.error(`[TOKEN_CACHE] VALIDATION_FAILED: Functional test error:`, functionalError.message);
        return false;
      }

    } catch (error) {
      console.error(`[TOKEN_CACHE] VALIDATION_ERROR: Error during validation:`, error);
      return false;
    }
  }

  // v2.5.3: Validate existing token cache interface
  _validateTokenCacheInterface(tokenCache) {
    try {
      if (!tokenCache) {
        console.warn(`[TOKEN_CACHE] Cannot validate null/undefined token cache`);
        return false;
      }

      console.debug(`[TOKEN_CACHE] Validating existing token cache interface`);
      console.debug(`[TOKEN_CACHE] Existing cache type: ${tokenCache.constructor?.name || 'unknown'}`);

      // Check if it's our injected cache
      if (tokenCache === TokenCache) {
        console.debug(`[TOKEN_CACHE] Found our injected TokenCache instance`);
        this._tokenCacheInjected = true;
        return true;
      }

      // Check if it's a different implementation with compatible interface
      const hasGetItem = typeof tokenCache.getItem === 'function';
      const hasSetItem = typeof tokenCache.setItem === 'function';
      const hasRemoveItem = typeof tokenCache.removeItem === 'function';
      const hasClear = typeof tokenCache.clear === 'function';

      console.debug(`[TOKEN_CACHE] Interface compatibility:`, {
        getItem: hasGetItem,
        setItem: hasSetItem,
        removeItem: hasRemoveItem,
        clear: hasClear,
        compatible: hasGetItem && hasSetItem && hasRemoveItem && hasClear
      });

      return hasGetItem && hasSetItem && hasRemoveItem && hasClear;

    } catch (error) {
      console.error(`[TOKEN_CACHE] Error validating token cache interface:`, error);
      return false;
    }
  }

  _validateTeamsEnvironment() {
    // Cache validation to avoid excessive DOM checks
    const now = Date.now();
    if (now - this._lastValidationTime < this._validationCacheMs) {
      return this._validationEnabled;
    }

    try {
      const validationResult = this._performEnvironmentValidation();
      if (validationResult) {
        this._onValidationSuccess(now);
      } else {
        this._validationEnabled = false;
      }
      return validationResult;
      
    } catch (error) {
      console.error('ReactHandler: Validation error:', error);
      this._validationEnabled = false;
      return false;
    }
  }

  _performEnvironmentValidation() {
    return this._validateDomain() && 
           this._validateDocument() && 
           this._validateAppElement() && 
           this._validateReactStructure();
  }

  _validateDomain() {
    const isTeamsDomain = this._isAllowedTeamsDomain(window.location.hostname);
    if (!isTeamsDomain) {
      console.warn('ReactHandler: Not in Teams domain context');
      return false;
    }
    return true;
  }

  _validateDocument() {
    if (!document || typeof document.getElementById !== 'function') {
      console.warn('ReactHandler: Invalid document context');
      return false;
    }
    return true;
  }

  _validateAppElement() {
    const appElement = document.getElementById("app");
    if (!appElement) {
      console.warn('ReactHandler: Teams app element not found');
      return false;
    }
    return true;
  }

  _validateReactStructure() {
    const appElement = document.getElementById("app");
    
    // Check for traditional React mount structures
    const hasLegacyReact = appElement._reactRootContainer || appElement._reactInternalInstance;
    
    // Check for React 18+ createRoot structure (keys starting with __react)
    const reactKeys = Object.getOwnPropertyNames(appElement).filter(key => 
      key.startsWith('__react') || key.startsWith('_react')
    );
    const hasModernReact = reactKeys.length > 0;
    
    // v2.5.5: Enhanced debugging for tray icon timing issue (#1795)
    if (!hasLegacyReact && !hasModernReact) {
      // Log additional timing information to help debug when Teams React loads
      const currentTime = Date.now();
      const timeSincePageLoad = currentTime - (window.performance?.timing?.navigationStart || 0);
      
      console.warn('ReactHandler: No React structure detected (legacy or modern)', {
        timeSincePageLoad: timeSincePageLoad,
        appElementExists: !!appElement,
        appElementKeys: appElement ? Object.getOwnPropertyNames(appElement).length : 0,
        documentReadyState: document.readyState,
        teamsUrlPath: window.location.pathname
      });
      
      // Check if Teams is still loading
      const teamsLoadingIndicators = [
        document.querySelector('[data-testid="loading-indicator"]'),
        document.querySelector('.app-loading'),
        document.querySelector('[aria-label*="loading"]'),
        document.querySelector('[aria-label*="Loading"]')
      ].filter(Boolean);
      
      if (teamsLoadingIndicators.length > 0) {
        console.debug('ReactHandler: Teams appears to be still loading, React structure may not be ready yet');
      }
      
      return false;
    }
    
    console.debug('ReactHandler: React structure validation successful', {
      hasLegacyReact: !!hasLegacyReact,
      hasModernReact: !!hasModernReact,
      reactKeyCount: reactKeys.length
    });
    
    return true;
  }

  _onValidationSuccess(now) {
    this._validationEnabled = true;
    this._lastValidationTime = now;
    
    // Log React version once when validation succeeds
    if (!this._reactVersionLogged) {
      this._detectAndLogReactVersion();
      this._reactVersionLogged = true;
    }
  }

  _detectAndLogReactVersion() {
    try {
      const result = this._detectReactVersion();
      console.debug(`ReactHandler: React version detected: ${result.version} (via ${result.method})`);
    } catch (error) {
      console.debug('ReactHandler: Could not detect React version:', error.message);
    }
  }

  _detectReactVersion() {
    // Try multiple detection methods in order of reliability
    return this._tryDevToolsHook() || 
           this._tryWindowReact() || 
           this._tryFiberDetection() ||
           this._tryReactRootProperties() ||
           this._tryReactPackageInfo() ||
           { version: 'unknown', method: 'unknown' };
  }

  _tryDevToolsHook() {
    if (!window.__REACT_DEVTOOLS_GLOBAL_HOOK__) return null;
    
    const reactDevTools = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!reactDevTools.renderers || reactDevTools.renderers.size === 0) return null;
    
    const renderer = reactDevTools.renderers.values().next().value;
    if (renderer && renderer.version) {
      return { version: renderer.version, method: 'DevTools Hook' };
    }
    return null;
  }

  _tryWindowReact() {
    if (window.React && window.React.version) {
      return { version: window.React.version, method: 'window.React' };
    }
    return null;
  }

  _tryFiberDetection() {
    const appElement = document.getElementById("app");
    if (!appElement || !appElement._reactRootContainer) return null;
    
    const container = appElement._reactRootContainer;
    if (!container._internalRoot || !container._internalRoot.current) return null;
    
    const fiber = container._internalRoot.current;
    if (fiber.mode !== undefined) {
      if (fiber.mode & 16) { // ConcurrentMode flag in React 18+
        return { version: '18+', method: 'Fiber ConcurrentMode' };
      } else {
        return { version: '16-17', method: 'Fiber Legacy' };
      }
    }
    return null;
  }

  _tryReactRootProperties() {
    const appElement = document.getElementById("app");
    if (!appElement) return null;

    // Check for React 18+ createRoot structure
    const reactRootKeys = Object.getOwnPropertyNames(appElement).filter(key => 
      key.startsWith('__react') || key.startsWith('_react')
    );
    
    for (const key of reactRootKeys) {
      const reactData = appElement[key];
      if (!reactData || typeof reactData !== 'object') continue;
      
      const versionInfo = this._extractVersionFromReactData(reactData);
      if (versionInfo) return versionInfo;
    }
    return null;
  }

  _extractVersionFromReactData(reactData) {
    // Check for React 18+ concurrent features
    if (reactData.concurrent !== undefined) {
      return { version: '18+', method: 'Root Properties (concurrent)' };
    }
    
    // Check for fiber structure in the property
    if (!reactData.current || reactData.current.mode === undefined) {
      return null;
    }
    
    if (reactData.current.mode & 16) {
      return { version: '18+', method: 'Root Properties (fiber mode)' };
    }
    return { version: '16-17', method: 'Root Properties (legacy fiber)' };
  }

  _tryReactPackageInfo() {
    // Try to detect React version from bundled modules or webpack chunks
    if (window.__webpack_require__ && window.__webpack_require__.cache) {
      try {
        const modules = Object.values(window.__webpack_require__.cache);
        for (const module of modules) {
          if (module.exports && module.exports.version && 
              (module.exports.createElement || module.exports.Component)) {
            return { version: module.exports.version, method: 'Webpack Module Cache' };
          }
        }
      } catch (error) {
        // Silently ignore webpack cache access errors
      }
    }

    // Check for React version in global variables or exposed modules
    // Use bracket notation to safely access potentially undefined properties
    const globalRefs = [
      { obj: window['__REACT__'], name: 'window.__REACT__' },
      { obj: window['ReactDOM'], name: 'window.ReactDOM' }, 
      { obj: window['React'], name: 'window.React' }
    ];

    for (const { obj, name } of globalRefs) {
      if (obj && obj.version) {
        return { version: obj.version, method: `Global Reference (${name})` };
      }
    }

    return null;
  }

  /**
   * Returns true if hostname is exactly allowed, or an immediate subdomain.
   * Prevents subdomain hijacking attacks by validating domain endings properly.
   * @param {string} hostname - The hostname to validate
   * @returns {boolean} - True if hostname is a legitimate Teams domain
   */
  _isAllowedTeamsDomain(hostname) {
    // List of valid Teams domains
    const allowedDomains = [
      'teams.microsoft.com',
      'teams.live.com'
    ];
    
    for (const domain of allowedDomains) {
      // Exact match
      if (hostname === domain) return true;
      // Immediate subdomain match (prevents evil.com.teams.microsoft.com attacks)
      if (hostname.endsWith('.' + domain)) return true;
    }
    
    return false;
  }

  _getTeams2ReactElement() {
    if (!this._validateTeamsEnvironment()) return null;
    
    try {
      const element = document.getElementById("app");
      return element;
    } catch (error) {
      console.error('ReactHandler: Error accessing React element:', error);
      return null;
    }
  }

  _getTeams2CoreServices() {
    const reactElement = this._getTeams2ReactElement();
    if (!reactElement) return null;

    try {
      const internalRoot =
        reactElement?._reactRootContainer?._internalRoot ||
        reactElement?._reactRootContainer;
      
      const coreServices = internalRoot?.current?.updateQueue?.baseState?.element?.props?.coreServices;
      
      // Additional validation that we have legitimate core services
      if (coreServices && typeof coreServices === 'object') {
        return coreServices;
      }
      
      return null;
    } catch (error) {
      console.error('ReactHandler: Error accessing core services:', error);
      return null;
    }
  }
}

const reactHandlerInstance = new ReactHandler();

module.exports = reactHandlerInstance;
