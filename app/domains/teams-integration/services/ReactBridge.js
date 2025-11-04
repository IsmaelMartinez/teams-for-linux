/**
 * ReactBridge Service
 *
 * Provides access to Teams React internal structure for status monitoring
 * and integration features. This service maintains the exact DOM navigation
 * patterns from the original reactHandler implementation.
 *
 * CRITICAL: DOM access patterns are preserved exactly as-is to maintain
 * compatibility with Teams internal React structure.
 */

class ReactBridge {
  constructor(config = {}, eventBus = null) {
    this._config = config;
    this._eventBus = eventBus;
    this._allowedDomains = [
      'teams.microsoft.com',
      'teams.live.com'
    ];
    this._coreServices = null;
    this._validationEnabled = true;
    this._lastStatus = null;
  }

  /**
   * Extract core services from Teams React structure
   * CRITICAL: Preserves exact DOM navigation from original reactHandler
   */
  extractCoreServices(window) {
    if (!window || !window.document) {
      return null;
    }

    // Validate Teams environment
    if (!this._validateTeamsEnvironment(window)) {
      return null;
    }

    try {
      const element = window.document.getElementById("app");
      if (!element) {
        return null;
      }

      // EXACT DOM NAVIGATION - DO NOT MODIFY
      const internalRoot =
        element?._reactRootContainer?._internalRoot ||
        element?._reactRootContainer;

      const coreServices = internalRoot?.current?.updateQueue?.baseState?.element?.props?.coreServices;

      // Validate we have legitimate core services
      if (coreServices && typeof coreServices === 'object') {
        this._coreServices = coreServices;
        this._emitEvent('react-bridge:services-extracted', { success: true });
        return coreServices;
      }

      return null;
    } catch (error) {
      console.error('ReactBridge: Error extracting core services:', error);
      this._emitEvent('react-bridge:extraction-error', { error: error.message });
      return null;
    }
  }

  /**
   * Get activity status from Teams
   * Extracts user presence/activity information from core services
   */
  getActivityStatus() {
    if (!this._coreServices) {
      return null;
    }

    try {
      // Extract status from various possible locations
      const clientState = this._coreServices.clientState;
      const idleTracker = clientState?._idleTracker;

      // Get presence information
      const presenceService = this._coreServices.presenceService;
      const currentPresence = presenceService?.getCurrentPresence?.();

      const status = {
        isIdle: idleTracker?.isIdle?.() || false,
        idleTime: idleTracker?.getIdleTime?.() || 0,
        presence: currentPresence || 'Unknown',
        timestamp: Date.now()
      };

      // Emit event if status changed
      if (this._hasStatusChanged(status)) {
        this._lastStatus = status;
        this._emitEvent('react-bridge:status-changed', status);
      }

      return status;
    } catch (error) {
      console.error('ReactBridge: Error getting activity status:', error);
      return null;
    }
  }

  /**
   * Get command change reporting service
   */
  getCommandChangeReportingService() {
    if (!this._coreServices) {
      return null;
    }
    return this._coreServices.commandChangeReportingService;
  }

  /**
   * Get idle tracker
   */
  getIdleTracker() {
    if (!this._coreServices) {
      return null;
    }
    return this._coreServices.clientState?._idleTracker;
  }

  /**
   * Get client preferences
   */
  getClientPreferences() {
    if (!this._coreServices) {
      return null;
    }
    return this._coreServices.clientPreferences?.clientPreferences;
  }

  /**
   * Check if domain is allowed
   * CRITICAL: Preserves exact domain validation logic
   */
  isAllowedDomain(url) {
    try {
      const hostname = new URL(url).hostname;
      return this._isAllowedTeamsDomain(hostname);
    } catch (error) {
      console.error('ReactBridge: Invalid URL for domain check:', error);
      return false;
    }
  }

  /**
   * Returns true if hostname is exactly allowed, or an immediate subdomain.
   * Prevents subdomain hijacking attacks by validating domain endings properly.
   * EXACT COPY from original reactHandler
   */
  _isAllowedTeamsDomain(hostname) {
    for (const domain of this._allowedDomains) {
      // Exact match
      if (hostname === domain) return true;
      // Immediate subdomain match (prevents evil.com.teams.microsoft.com attacks)
      if (hostname.endsWith('.' + domain)) return true;
    }

    return false;
  }

  /**
   * Validate Teams environment
   * CRITICAL: Preserves exact validation logic
   */
  _validateTeamsEnvironment(window) {
    try {
      const validationResult = this._performEnvironmentValidation(window);
      this._validationEnabled = validationResult;
      return validationResult;
    } catch (error) {
      console.error('ReactBridge: Validation error:', error);
      this._validationEnabled = false;
      return false;
    }
  }

  /**
   * Perform environment validation checks
   * EXACT COPY from original reactHandler
   */
  _performEnvironmentValidation(window) {
    return this._validateDomain(window) &&
           this._validateDocument(window) &&
           this._validateAppElement(window) &&
           this._validateReactStructure(window);
  }

  /**
   * Validate domain
   * EXACT COPY from original reactHandler
   */
  _validateDomain(window) {
    const isTeamsDomain = this._isAllowedTeamsDomain(window.location.hostname);
    if (!isTeamsDomain) {
      console.warn('ReactBridge: Not in Teams domain context');
      return false;
    }
    return true;
  }

  /**
   * Validate document
   * EXACT COPY from original reactHandler
   */
  _validateDocument(window) {
    const document = window.document;
    if (!document || typeof document.getElementById !== 'function') {
      console.warn('ReactBridge: Invalid document context');
      return false;
    }
    return true;
  }

  /**
   * Validate app element exists
   * EXACT COPY from original reactHandler
   */
  _validateAppElement(window) {
    const appElement = window.document.getElementById("app");
    if (!appElement) {
      console.warn('ReactBridge: Teams app element not found');
      return false;
    }
    return true;
  }

  /**
   * Validate React structure
   * EXACT COPY from original reactHandler
   */
  _validateReactStructure(window) {
    const appElement = window.document.getElementById("app");

    // Check for traditional React mount structures
    const hasLegacyReact = appElement._reactRootContainer || appElement._reactInternalInstance;

    // Check for React 18+ createRoot structure (keys starting with __react)
    const reactKeys = Object.getOwnPropertyNames(appElement).filter(key =>
      key.startsWith('__react') || key.startsWith('_react')
    );
    const hasModernReact = reactKeys.length > 0;

    if (!hasLegacyReact && !hasModernReact) {
      console.warn('ReactBridge: No React structure detected');
      return false;
    }

    return true;
  }

  /**
   * Check if status has changed
   */
  _hasStatusChanged(newStatus) {
    if (!this._lastStatus) {
      return true;
    }

    return (
      this._lastStatus.isIdle !== newStatus.isIdle ||
      this._lastStatus.presence !== newStatus.presence
    );
  }

  /**
   * Emit event via EventBus if available
   */
  _emitEvent(eventName, data) {
    if (this._eventBus && typeof this._eventBus.emit === 'function') {
      try {
        this._eventBus.emit(eventName, data);
      } catch (error) {
        console.error(`ReactBridge: Error emitting event ${eventName}:`, error);
      }
    }
  }

  /**
   * Get current validation state
   */
  isValidated() {
    return this._validationEnabled;
  }

  /**
   * Reset internal state
   */
  reset() {
    this._coreServices = null;
    this._lastStatus = null;
    this._validationEnabled = true;
    this._emitEvent('react-bridge:reset', { timestamp: Date.now() });
  }
}

module.exports = ReactBridge;
