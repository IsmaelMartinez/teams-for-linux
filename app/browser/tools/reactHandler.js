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
      const isTeamsDomain = window.location.hostname.includes('teams.microsoft.com') || 
                           window.location.hostname.includes('teams.live.com');
      
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

      // Enhanced React structure validation for different React versions
      const hasReactContainer = appElement._reactRootContainer;
      const hasReactInstance = appElement._reactInternalInstance;
      const hasReactFiber = appElement._reactInternalFiber;
      const hasReactRoot = appElement.__reactInternalInstance;
      
      // Check for React 18+ createRoot API
      const hasCreateRoot = appElement.__reactContainer$randomKey || 
                           appElement._reactRootContainer || 
                           Object.keys(appElement).some(key => key.startsWith('__reactContainer'));
      
      // Check for any React Fiber node properties
      const hasFiberNode = Object.keys(appElement).some(key => 
        key.startsWith('__reactInternalFiber') || 
        key.startsWith('__reactFiber') ||
        key.startsWith('_reactInternalFiber')
      );
      
      const hasReactStructure = hasReactContainer || hasReactInstance || hasReactFiber || hasReactRoot || hasCreateRoot || hasFiberNode;
      
      if (!hasReactStructure) {
        console.debug('ReactHandler: Detailed React structure check:', {
          _reactRootContainer: !!appElement._reactRootContainer,
          _reactInternalInstance: !!appElement._reactInternalInstance,
          _reactInternalFiber: !!appElement._reactInternalFiber,
          __reactInternalInstance: !!appElement.__reactInternalInstance,
          elementKeys: Object.keys(appElement).filter(k => k.includes('react')),
          totalKeys: Object.keys(appElement).length
        });
        console.warn('ReactHandler: No React structure detected in app element');
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
      // Try multiple React internal structure patterns
      let internalRoot = null;
      
      // React 16-17 pattern
      if (reactElement._reactRootContainer) {
        internalRoot = reactElement._reactRootContainer._internalRoot || 
                      reactElement._reactRootContainer;
      }
      
      // React 18+ patterns - try different possible structures
      if (!internalRoot) {
        // Look for createRoot API container
        const containerKeys = Object.keys(reactElement).filter(key => 
          key.startsWith('__reactContainer') || 
          key.startsWith('_reactRootContainer')
        );
        
        if (containerKeys.length > 0) {
          const container = reactElement[containerKeys[0]];
          internalRoot = container?._internalRoot || container?.current || container;
        }
      }
      
      // Try React Fiber node patterns
      if (!internalRoot) {
        const fiberKeys = Object.keys(reactElement).filter(key => 
          key.includes('reactInternalFiber') || 
          key.includes('__reactFiber')
        );
        
        if (fiberKeys.length > 0) {
          internalRoot = reactElement[fiberKeys[0]];
        }
      }
      
      if (!internalRoot) {
        console.debug('ReactHandler: Could not find React internal root structure');
        return null;
      }
      
      // Try different paths to core services
      let coreServices = null;
      
      // Original React 16-17 path
      coreServices = internalRoot?.current?.updateQueue?.baseState?.element?.props?.coreServices;
      
      // Alternative paths for different React versions
      if (!coreServices) {
        coreServices = internalRoot?.current?.child?.memoizedProps?.coreServices ||
                      internalRoot?.current?.child?.pendingProps?.coreServices ||
                      internalRoot?.current?.memoizedProps?.coreServices ||
                      internalRoot?.current?.pendingProps?.coreServices;
      }
      
      // Try traversing the Fiber tree to find coreServices
      if (!coreServices && internalRoot?.current) {
        const findCoreServices = (fiber, depth = 0) => {
          if (depth > 10) return null; // Prevent infinite loops
          
          if (fiber?.memoizedProps?.coreServices) {
            return fiber.memoizedProps.coreServices;
          }
          if (fiber?.pendingProps?.coreServices) {
            return fiber.pendingProps.coreServices;
          }
          
          // Check child nodes
          if (fiber?.child) {
            const result = findCoreServices(fiber.child, depth + 1);
            if (result) return result;
          }
          
          // Check sibling nodes
          if (fiber?.sibling) {
            const result = findCoreServices(fiber.sibling, depth + 1);
            if (result) return result;
          }
          
          return null;
        };
        
        coreServices = findCoreServices(internalRoot.current);
      }
      
      // Additional validation that we have legitimate core services
      if (coreServices && typeof coreServices === 'object') {
        console.debug('ReactHandler: Successfully found core services');
        return coreServices;
      }
      
      console.debug('ReactHandler: Core services not found in React structure');
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
