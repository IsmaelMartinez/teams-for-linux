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
      // Validate we're in a Teams domain context
      const isTeamsDomain = this._isAllowedTeamsDomain(window.location.hostname);
      
      // Validate document and basic DOM structure
      if (!document || typeof document.getElementById !== 'function') {
        console.warn('ReactHandler: Invalid document context');
        this._validationEnabled = false;
        return false;
      }

      // Validate we have the expected Teams app element
      const appElement = document.getElementById("app");
      if (!appElement) {
        console.warn('ReactHandler: Teams app element not found');
        this._validationEnabled = false;
        return false;
      }

      // Basic React structure validation
      if (!appElement._reactRootContainer && !appElement._reactInternalInstance) {
        console.warn('ReactHandler: React structure not detected');
        this._validationEnabled = false;
        return false;
      }

      if (!isTeamsDomain) {
        console.warn('ReactHandler: Not in Teams domain context');
        this._validationEnabled = false;
        return false;
      }

      this._validationEnabled = true;
      this._lastValidationTime = now;
      
      // Log React version once when validation succeeds
      if (!this._reactVersionLogged) {
        this._detectAndLogReactVersion();
        this._reactVersionLogged = true;
      }
      
      return true;
      
    } catch (error) {
      console.error('ReactHandler: Validation error:', error);
      this._validationEnabled = false;
      return false;
    }
  }

  _detectAndLogReactVersion() {
    try {
      let reactVersion = 'unknown';
      let detectionMethod = 'unknown';
      
      // Method 1: Check React DevTools Global Hook
      if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
        const reactDevTools = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
        if (reactDevTools.renderers && reactDevTools.renderers.size > 0) {
          const renderer = reactDevTools.renderers.values().next().value;
          if (renderer && renderer.version) {
            reactVersion = renderer.version;
            detectionMethod = 'DevTools Hook';
          }
        }
      }
      
      // Method 2: Check React package version from window.React if available
      if (reactVersion === 'unknown' && window.React && window.React.version) {
        reactVersion = window.React.version;
        detectionMethod = 'window.React';
      }
      
      // Method 3: Try to detect from Fiber node version
      if (reactVersion === 'unknown') {
        const appElement = document.getElementById("app");
        if (appElement && appElement._reactRootContainer) {
          const container = appElement._reactRootContainer;
          if (container._internalRoot && container._internalRoot.current) {
            const fiber = container._internalRoot.current;
            // React 18+ Fiber nodes have different structure indicators
            if (fiber.mode !== undefined) {
              if (fiber.mode & 16) { // ConcurrentMode flag in React 18+
                reactVersion = '18+';
                detectionMethod = 'Fiber ConcurrentMode';
              } else {
                reactVersion = '16-17';
                detectionMethod = 'Fiber Legacy';
              }
            }
          }
        }
      }
      
      console.debug(`ReactHandler: React version detected: ${reactVersion} (via ${detectionMethod})`);
      
    } catch (error) {
      console.debug('ReactHandler: Could not detect React version:', error.message);
    }
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
