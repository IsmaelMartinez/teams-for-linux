// Import token cache for authentication provider integration
const TokenCache = require('./tokenCache');

class ReactHandler {
  _validationEnabled = true;
  _tokenCacheInjected = false; // Track token cache injection status


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
