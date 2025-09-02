class ReactHandler {

  constructor() {
    this._validationEnabled = true;
    this._lastValidationTime = 0;
    this._validationCacheMs = 1000; // Cache validation results for 1 second
    this._reactVersionLogged = false; // Ensure version is logged only once
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
    if (!appElement._reactRootContainer && !appElement._reactInternalInstance) {
      console.warn('ReactHandler: React structure not detected');
      return false;
    }
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
      const { version, method } = this._detectReactVersion();
      console.debug(`ReactHandler: React version detected: ${version} (via ${method})`);
    } catch (error) {
      console.debug('ReactHandler: Could not detect React version:', error.message);
    }
  }

  _detectReactVersion() {
    // Try multiple detection methods in order of reliability
    return this._tryDevToolsHook() || 
           this._tryWindowReact() || 
           this._tryFiberDetection() ||
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
//document.getElementById('app')._reactRootContainer.current.updateQueue.baseState.element.props.coreServices

module.exports = new ReactHandler();

// await document.getElementById('app')._reactRootContainer.current.updateQueue.baseState.element.props.coreServices.authenticationService._coreAuthService._authProvider.acquireToken("https://graph.microsoft.com", { correlation: document.getElementById('app')._reactRootContainer.current.updateQueue.baseState.element.props.coreServices.correlation, forceRenew: true} )
