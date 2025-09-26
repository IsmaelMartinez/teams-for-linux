// Complete Token Refresh System - Browser Injectable
// This script contains all necessary functionality for token refresh in Teams web context

(function() {
  'use strict';

  // Simple ReactHandler for Teams environment validation and token refresh
  class SimpleReactHandler {
    constructor() {
      this._validationEnabled = true;
      this._lastValidationTime = 0;
      this._validationCacheMs = 1000;
    }

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

    _validateTeamsEnvironment() {
      const now = Date.now();
      if (now - this._lastValidationTime < this._validationCacheMs) {
        return this._validationEnabled;
      }

      try {
        const validationResult = this._isAllowedTeamsDomain(window.location.hostname) && 
                               document && 
                               document.getElementById("app");
        
        if (validationResult) {
          this._validationEnabled = true;
          this._lastValidationTime = now;
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

    _isAllowedTeamsDomain(hostname) {
      const allowedDomains = [
        'teams.microsoft.com',
        'teams.live.com'
      ];
      
      for (const domain of allowedDomains) {
        if (hostname === domain || hostname.endsWith('.' + domain)) return true;
      }
      return false;
    }

    _getTeams2CoreServices() {
      try {
        const element = document.getElementById("app");
        if (!element) return null;

        const internalRoot =
          element?._reactRootContainer?._internalRoot ||
          element?._reactRootContainer;
        
        return internalRoot?.current?.updateQueue?.baseState?.element?.props?.coreServices;
      } catch (error) {
        console.error('ReactHandler: Error accessing core services:', error);
        return null;
      }
    }
  }

  // Simple Token Refresh Scheduler
  class SimpleTokenRefreshScheduler {
    constructor() {
      this._refreshTimer = null;
      this._refreshInterval = 60 * 60 * 1000; // Default 1 hour
      this._refreshEnabled = false;
    }

    startRefreshScheduler(refreshCallback, intervalHours = 1) {
      try {
        if (typeof refreshCallback !== 'function') {
          throw new TypeError('refreshCallback must be a function');
        }

        if (typeof intervalHours !== 'number' || intervalHours < 1 || intervalHours > 24) {
          throw new RangeError('intervalHours must be between 1 and 24');
        }

        // Stop existing scheduler if running
        this.stopRefreshScheduler();

        // Calculate interval in milliseconds
        this._refreshInterval = intervalHours * 60 * 60 * 1000;
        this._refreshEnabled = true;

        console.debug(`[TOKEN_CACHE] Starting refresh scheduler (${intervalHours} hours)`);

        // Set up the interval timer
        this._refreshTimer = setInterval(async () => {
          try {
            console.debug('[TOKEN_CACHE] Scheduled token refresh triggered');
            await refreshCallback();
          } catch (error) {
            console.error('[TOKEN_CACHE] Scheduled token refresh failed:', error);
          }
        }, this._refreshInterval);

        return true;

      } catch (error) {
        console.error('[TOKEN_CACHE] Failed to start refresh scheduler:', error);
        this._refreshEnabled = false;
        return false;
      }
    }

    stopRefreshScheduler() {
      if (this._refreshTimer) {
        clearInterval(this._refreshTimer);
        this._refreshTimer = null;
        console.debug('[TOKEN_CACHE] Refresh scheduler stopped');
      }
      this._refreshEnabled = false;
    }

    getRefreshSchedulerStatus() {
      return {
        enabled: this._refreshEnabled,
        intervalMs: this._refreshInterval,
        intervalHours: this._refreshInterval / (60 * 60 * 1000),
        isRunning: this._refreshTimer !== null
      };
    }
  }

  // Initialize the system
  const reactHandler = new SimpleReactHandler();
  const scheduler = new SimpleTokenRefreshScheduler();

  // Main configuration function
  function initializeTokenRefresh(config) {
    try {
      console.debug('[TOKEN_REFRESH] Configuring with:', config);
      
      if (!config.enabled) {
        console.debug('[TOKEN_REFRESH] Token refresh disabled by configuration');
        return;
      }

      // Validate interval
      const intervalHours = Math.max(1, Math.min(24, config.refreshIntervalHours || 1));
      
      console.debug(`[TOKEN_REFRESH] Starting scheduler with ${intervalHours} hour interval`);
      
      // Start the refresh scheduler
      const success = scheduler.startRefreshScheduler(
        async () => {
          console.debug('[TOKEN_REFRESH] Executing scheduled refresh...');
          const result = await reactHandler.refreshToken();
          if (result.success) {
            console.debug('[TOKEN_REFRESH] Scheduled refresh completed successfully');
          } else {
            console.warn('[TOKEN_REFRESH] Scheduled refresh failed:', result.error);
          }
        },
        intervalHours
      );

      if (success) {
        console.debug('[TOKEN_REFRESH] Scheduler started successfully');
      } else {
        console.error('[TOKEN_REFRESH] Failed to start scheduler');
      }

    } catch (error) {
      console.error('[TOKEN_REFRESH] Error initializing token refresh:', error);
    }
  }

  // Expose API to main process
  window.teamsForLinuxTokenRefresh = {
    configure: initializeTokenRefresh,
    stop: () => {
      scheduler.stopRefreshScheduler();
      console.debug('[TOKEN_REFRESH] Scheduler stopped');
    },
    getStatus: () => scheduler.getRefreshSchedulerStatus(),
    manualRefresh: () => reactHandler.refreshToken()
  };

  console.debug('[TOKEN_REFRESH] Complete token refresh system loaded');

})();