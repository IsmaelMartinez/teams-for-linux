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
    
    // Check for traditional React mount structures
    const hasLegacyReact = appElement._reactRootContainer || appElement._reactInternalInstance;
    
    // Check for React 18+ createRoot structure (keys starting with __react)
    const reactKeys = Object.getOwnPropertyNames(appElement).filter(key => 
      key.startsWith('__react') || key.startsWith('_react')
    );
    const hasModernReact = reactKeys.length > 0;
    
    if (!hasLegacyReact && !hasModernReact) {
      console.warn('ReactHandler: No React structure detected (legacy or modern)');
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
      const result = this._detectReactVersion();
      console.debug(`ReactHandler: React version detected: ${result.version} (via ${result.method})`);
      
      // Additional debugging information
      if (result.version === 'unknown') {
        this._logReactDetectionDebugInfo();
      }
    } catch (error) {
      console.debug('ReactHandler: Could not detect React version:', error.message);
    }
  }

  _logReactDetectionDebugInfo() {
    console.debug('ReactHandler: Debug info for failed React detection:');
    
    // Check app element structure
    const appElement = document.getElementById("app");
    if (appElement) {
      const reactKeys = Object.getOwnPropertyNames(appElement).filter(key => 
        key.includes('react') || key.includes('React')
      );
      console.debug('  - React-related keys on app element:', reactKeys);
      console.debug('  - Has _reactRootContainer:', !!appElement._reactRootContainer);
      console.debug('  - Has _reactInternalInstance:', !!appElement._reactInternalInstance);
    } else {
      console.debug('  - App element not found');
    }

    // Check global React references
    console.debug('  - window.React exists:', !!window.React);
    console.debug('  - window.ReactDOM exists:', !!window.ReactDOM);
    console.debug('  - DevTools hook exists:', !!window.__REACT_DEVTOOLS_GLOBAL_HOOK__);
    
    if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
      const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
      console.debug('  - DevTools renderers count:', hook.renderers ? hook.renderers.size : 0);
    }

    // Check webpack cache
    console.debug('  - Webpack require exists:', !!window.__webpack_require__);
    if (window.__webpack_require__ && window.__webpack_require__.cache) {
      const moduleCount = Object.keys(window.__webpack_require__.cache).length;
      console.debug('  - Webpack cached modules:', moduleCount);
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
        console.debug('ReactHandler: Error accessing webpack cache:', error.message);
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
//document.getElementById('app')._reactRootContainer.current.updateQueue.baseState.element.props.coreServices

module.exports = new ReactHandler();

// await document.getElementById('app')._reactRootContainer.current.updateQueue.baseState.element.props.coreServices.authenticationService._coreAuthService._authProvider.acquireToken("https://graph.microsoft.com", { correlation: document.getElementById('app')._reactRootContainer.current.updateQueue.baseState.element.props.coreServices.correlation, forceRenew: true} )
