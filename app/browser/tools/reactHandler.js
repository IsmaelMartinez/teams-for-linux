// Import token cache for authentication provider integration
const TokenCache = require('./tokenCache');

class ReactHandler {
  _validationEnabled = true;
  _tokenCacheInjected = false;

  /**
   * Initialize the ReactHandler (for compatibility with preload module loading)
   * @param {object} config - Application configuration
   */
  init(config) {
    this.config = config;
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

  /**
   * Get the current user's presence status from Teams internal state
   * @returns {object|null} Presence info or null if not available
   */
  getUserPresence() {
    if (!this._validateTeamsEnvironment()) return null;
    
    try {
      const teams2CoreServices = this._getTeams2CoreServices();
      
      // Try multiple paths to find presence information
      // Path 1: presenceService
      const presenceService = teams2CoreServices?.presenceService;
      if (presenceService) {
        const selfPresence = presenceService.selfPresence ||
                            presenceService._selfPresence ||
                            presenceService.currentPresence;
        if (selfPresence) {
          return selfPresence;
        }
      }

      // Path 2: clientState presence
      const clientState = teams2CoreServices?.clientState;
      if (clientState) {
        const presence = clientState.presence || clientState._presence;
        if (presence) {
          return presence;
        }
      }

      // Path 3: userPresenceService
      const userPresenceService = teams2CoreServices?.userPresenceService;
      if (userPresenceService) {
        return userPresenceService.currentPresence || userPresenceService.selfPresence;
      }

      // Path 4: presenceStore or presence in various locations
      const presenceStore = teams2CoreServices?.presenceStore;
      if (presenceStore) {
        return presenceStore.selfPresence || presenceStore.currentUserPresence;
      }

      return null;
      
    } catch (error) {
      console.error('[ReactHandler] Error getting user presence:', error);
      return null;
    }
  }

  /**
   * Get available core service keys for debugging
   * @returns {string[]|null} Array of service names or null
   */
  getCoreServiceKeys() {
    if (!this._validateTeamsEnvironment()) return null;
    
    try {
      const teams2CoreServices = this._getTeams2CoreServices();
      if (teams2CoreServices) {
        return Object.keys(teams2CoreServices);
      }
      return null;
    } catch (error) {
      console.error('[ReactHandler] Error getting core service keys:', error);
      return null;
    }
  }

  /**
   * Get a specific core service by name for debugging
   * @param {string} name - Service name
   * @returns {object|null} The service object or null
   */
  getCoreService(name) {
    if (!this._validateTeamsEnvironment()) return null;
    try {
      const teams2CoreServices = this._getTeams2CoreServices();
      return teams2CoreServices?.[name] ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Get the status of the token cache injection
   * @returns {object} Status object with injected flag and retry capability
   */
  getTokenCacheStatus() {
    return {
      injected: this._tokenCacheInjected,
      canRetry: !this._tokenCacheInjected && this._validateTeamsEnvironment()
    };
  }

  /**
   * Log authentication state for debugging and attempt token cache injection if needed
   * Note: This method has side effects - it will attempt token injection if not yet done
   */
  logAndAttemptTokenInjection() {
    try {
      if (!this._validateTeamsEnvironment()) {
        console.debug('[AUTH_DIAG] Teams environment not validated');
        return;
      }

      const teams2CoreServices = this._getTeams2CoreServices();
      const authService = teams2CoreServices?.authenticationService;
      
      console.debug('[AUTH_DIAG] Authentication state:', {
        hasAuthService: !!authService,
        hasCoreAuthService: !!authService?._coreAuthService,
        hasAuthProvider: !!authService?._coreAuthService?._authProvider,
        tokenCacheInjected: this._tokenCacheInjected
      });
      
      // Attempt token cache injection if not yet done
      if (!this._tokenCacheInjected) {
        const authProvider = authService?._coreAuthService?._authProvider;
        if (authProvider) {
          this._attemptTokenCacheInjection(authProvider);
        }
      }
    } catch (error) {
      console.error('[AUTH_DIAG] Error logging authentication state:', error);
    }
  }

  // Public method to manually trigger token cache injection
  injectTokenCache() {
    if (!this._validateTeamsEnvironment()) {
      return false;
    }

    try {
      const teams2CoreServices = this._getTeams2CoreServices();
      const authService = teams2CoreServices?.authenticationService;
      const authProvider = authService?._coreAuthService?._authProvider;

      if (!authProvider) {
        return false;
      }

      return this._attemptTokenCacheInjection(authProvider);

    } catch (error) {
      console.error(`[TOKEN_CACHE] Error in token cache injection:`, error);
      return false;
    }
  }

  /**
   * Acquire token for a specific resource (e.g., Microsoft Graph API)
   * @param {string} resource - The resource URL (e.g., 'https://graph.microsoft.com')
   * @param {object} options - Optional token acquisition options
   * @returns {Promise<object>} Token acquisition result
   */
  async acquireToken(resource = 'https://graph.microsoft.com', options = {}) {
    try {
      if (!this._validateTeamsEnvironment()) {
        console.warn('[GRAPH_API] Teams environment not validated');
        return { success: false, error: 'Teams environment not validated' };
      }

      const teams2CoreServices = this._getTeams2CoreServices();
      const authService = teams2CoreServices?.authenticationService;
      const authProvider = authService?._coreAuthService?._authProvider;

      if (!authProvider) {
        console.warn('[GRAPH_API] Auth provider not available');
        return { success: false, error: 'Auth provider not found' };
      }

      if (typeof authProvider.acquireToken !== 'function') {
        console.error('[GRAPH_API] acquireToken method not available');
        return { success: false, error: 'acquireToken method not found' };
      }

      // Get correlation from core services if available
      const correlation = teams2CoreServices?.correlation;

      // Merge default options with provided options
      const tokenOptions = {
        correlation: correlation,
        forceRenew: options.forceRenew || false,
        forceRefresh: options.forceRefresh || false,
        skipCache: options.skipCache || false,
        prompt: options.prompt || 'none',
        ...options
      };

      console.debug(`[GRAPH_API] Acquiring token for resource: ${resource}`);
      const result = await authProvider.acquireToken(resource, tokenOptions);

      if (result && result.token) {
        console.debug('[GRAPH_API] Token acquired successfully', {
          hasToken: true,
          fromCache: result.fromCache,
          expiry: result.expiresOn || result.expires_on
        });

        return {
          success: true,
          token: result.token,
          fromCache: result.fromCache,
          expiry: result.expiresOn || result.expires_on,
          timestamp: Date.now()
        };
      } else {
        console.warn('[GRAPH_API] Token acquisition returned no result');
        return { success: false, error: 'No token in result' };
      }

    } catch (error) {
      console.error('[GRAPH_API] Token acquisition failed:', error);
      return {
        success: false,
        error: error.message || error.toString(),
        timestamp: Date.now()
      };
    }
  }

  // Attempt to inject token cache into Teams authentication provider
  _attemptTokenCacheInjection(authProvider) {
    try {
      if (this._tokenCacheInjected) {
        return true;
      }

      if (!authProvider || typeof authProvider !== 'object') {
        console.error('[TOKEN_CACHE] Invalid auth provider for injection');
        return false;
      }

      if (!TokenCache || typeof TokenCache.getItem !== 'function') {
        console.error('[TOKEN_CACHE] TokenCache module not properly loaded');
        return false;
      }

      // Perform the injection
      authProvider._tokenCache = TokenCache;

      // Verify injection success
      if (this._validateTokenCacheInjection(authProvider)) {
        this._tokenCacheInjected = true;
        return true;
      } else {
        console.error('[TOKEN_CACHE] Validation failed after injection');
        delete authProvider._tokenCache;
        return false;
      }

    } catch (error) {
      console.error('[TOKEN_CACHE] Error during token cache injection:', error);
      return false;
    }
  }

  // Validate token cache injection was successful
  _validateTokenCacheInjection(authProvider) {
    const tokenCache = authProvider._tokenCache;
    if (!tokenCache) return false;

    const requiredMethods = ['getItem', 'setItem', 'removeItem', 'clear'];
    return requiredMethods.every(method => typeof tokenCache[method] === 'function');
  }

  _validateTeamsEnvironment() {
    try {
      const validationResult = this._performEnvironmentValidation();
      this._validationEnabled = validationResult;
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
    const isTeamsDomain = this._isAllowedTeamsDomain(globalThis.location.hostname);
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

    if (!hasLegacyReact && !hasModernReact) {
      console.warn('ReactHandler: No React structure detected');
      return false;
    }

    return true;
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
      'teams.cloud.microsoft',
      'teams.microsoft.com',
      'teams.live.com'
    ];

    // Handle Microsoft Cloud App Security (MCAS) suffix. eg: teams.cloud.microsoft.mcas.ms
    if(hostname.endsWith('.mcas.ms')){
      hostname = hostname.slice(0, -8);
    }
    
    for (const domain of allowedDomains) {
      // Exact match
      if (hostname === domain) return true;
      // Immediate subdomain match (prevents evil.com.teams.cloud.microsoft / evil.com.teams.microsoft.com attacks)
      if (hostname.endsWith('.' + domain)) {
        const subdomainPart = hostname.substring(0, hostname.length - (domain.length + 1));
        if (!subdomainPart.includes('.')) {
          return true;
        }
      }
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

      const coreProps = internalRoot?.current?.updateQueue?.baseState?.element?.props;
      const coreServices = coreProps?.coreServices || coreProps?.children?.props?.coreServices;

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

// Make available for browser injection
if (globalThis.window !== undefined) {
  globalThis.window.teamsForLinuxReactHandler = reactHandlerInstance;
}

module.exports = reactHandlerInstance;
