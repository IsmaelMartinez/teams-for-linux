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

    async refreshToken(resources = null) {
      try {
        if (!this._validateTeamsEnvironment()) {
          console.warn(`[TOKEN_CACHE] Teams environment not validated, cannot refresh tokens`);
          return { success: false, error: 'Teams environment not validated' };
        }

        // Define critical authentication tokens (main session tokens)
        const criticalTokens = resources || [
          'https://graph.microsoft.com',           // Microsoft Graph API - Core authentication
          'https://outlook.office365.com',        // Office 365 services
          'https://graph.windows.net',            // Azure AD Graph
          'https://substrate.office.com',         // Office Substrate services
          'https://ic3.teams.office.com'          // Teams chat/messaging (keep as fallback)
        ];

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

        const results = [];
        let successCount = 0;
        let errorCount = 0;

        console.debug(`[TOKEN_CACHE] Starting multi-token refresh for ${criticalTokens.length} resources`);

        // Refresh each critical token
        for (const resource of criticalTokens) {
          try {
            console.debug(`[TOKEN_CACHE] Attempting token refresh for resource: ${resource}`);
            const result = await authProvider.acquireToken(resource, refreshOptions);
            
            if (result) {
              console.debug(`[TOKEN_CACHE] Token refresh successful for ${resource}`, {
                hasToken: !!result?.token,
                fromCache: result?.fromCache,
                expiry: result?.expiresOn || result?.expires_on
              });

              // CRITICAL: Store the fresh token to replace expired cached tokens
              await this._storeRefreshedToken(result, resource);

              results.push({
                resource: resource,
                success: true,
                result: result,
                fromCache: result?.fromCache,
                expiry: result?.expiresOn || result?.expires_on
              });
              successCount++;
            } else {
              console.warn(`[TOKEN_CACHE] Token refresh returned no result for ${resource}`);
              results.push({
                resource: resource,
                success: false,
                error: 'No result from token refresh'
              });
              errorCount++;
            }
          } catch (error) {
            console.error(`[TOKEN_CACHE] Token refresh failed for ${resource}:`, error);
            results.push({
              resource: resource,
              success: false,
              error: error.message || error.toString()
            });
            errorCount++;
          }
        }

        console.debug(`[TOKEN_CACHE] Multi-token refresh completed: ${successCount} successful, ${errorCount} failed`);

        return {
          success: successCount > 0,
          totalTokens: criticalTokens.length,
          successCount: successCount,
          errorCount: errorCount,
          results: results,
          timestamp: Date.now()
        };

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

    /**
     * Store refreshed token to replace expired cached tokens
     * This ensures Teams actually uses the fresh tokens we retrieved
     */
    async _storeRefreshedToken(tokenResult, resource) {
      try {
        console.debug(`[TOKEN_CACHE] Storing refreshed token for resource: ${resource}`);

        // Extract token data from the result
        const token = tokenResult?.token || tokenResult?.accessToken;
        const expiresOn = tokenResult?.expiresOn || tokenResult?.expires_on;
        const accountInfo = tokenResult?.account;

        if (!token) {
          console.warn(`[TOKEN_CACHE] No token found in result, cannot store`);
          return false;
        }

        // Store token using multiple strategies to ensure Teams finds it

        // Strategy 1: Store in MSAL format (most common for Teams)
        const msalKey = `msal.token.${resource}`;
        const msalTokenData = {
          token: token,
          expiresOn: expiresOn,
          accessToken: token,
          expires_on: expiresOn,
          resource: resource,
          refreshed: true,
          refreshTimestamp: Date.now()
        };
        
        localStorage.setItem(msalKey, JSON.stringify(msalTokenData));
        console.debug(`[TOKEN_CACHE] Stored token in MSAL format: ${msalKey}`);

        // Strategy 2: Store in generic auth format
        const authKey = `auth.token.${resource}`;
        localStorage.setItem(authKey, JSON.stringify(msalTokenData));
        console.debug(`[TOKEN_CACHE] Stored token in auth format: ${authKey}`);

        // Strategy 3: Store raw token for fallback
        const tokenKey = `token.${resource}`;
        localStorage.setItem(tokenKey, token);
        console.debug(`[TOKEN_CACHE] Stored raw token: ${tokenKey}`);

        // Strategy 4: Clear any expired tokens with old expiry dates
        await this._clearExpiredTokens();

        console.debug(`[TOKEN_CACHE] Token storage completed successfully`);
        return true;

      } catch (error) {
        console.error(`[TOKEN_CACHE] Failed to store refreshed token:`, error);
        return false;
      }
    }

    /**
     * Clear expired tokens from localStorage to prevent conflicts
     */
    async _clearExpiredTokens() {
      try {
        const now = Date.now() / 1000; // Convert to seconds for comparison
        let clearedCount = 0;

        // Iterate through localStorage to find and clear expired tokens
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (!key) continue;

          // Check if this is a token-related key
          if (key.includes('token') || key.includes('msal') || key.includes('auth')) {
            try {
              const value = localStorage.getItem(key);
              if (!value) continue;

              // Try to parse as JSON and check expiry
              const tokenData = JSON.parse(value);
              const expiryTime = tokenData?.expiresOn || tokenData?.expires_on;

              if (expiryTime && expiryTime < now) {
                localStorage.removeItem(key);
                clearedCount++;
                console.debug(`[TOKEN_CACHE] Cleared expired token: ${key}`);
              }
            } catch (parseError) {
              // Not JSON or malformed, skip
              continue;
            }
          }
        }

        if (clearedCount > 0) {
          console.debug(`[TOKEN_CACHE] Cleared ${clearedCount} expired tokens`);
        }

      } catch (error) {
        console.error(`[TOKEN_CACHE] Error clearing expired tokens:`, error);
      }
    }
  }

  // Simple Token Refresh Scheduler
  class SimpleTokenRefreshScheduler {
    constructor() {
      this._refreshTimer = null;
      this._refreshInterval = 5 * 60 * 1000; // Default 5 minutes
      this._refreshEnabled = false;
    }

    startRefreshScheduler(refreshCallback, intervalMinutes = 5) {
      try {
        if (typeof refreshCallback !== 'function') {
          throw new TypeError('refreshCallback must be a function');
        }

        if (typeof intervalMinutes !== 'number' || intervalMinutes < 1 || intervalMinutes > 1440) {
          throw new RangeError('intervalMinutes must be between 1 and 1440 (24 hours)');
        }

        // Stop existing scheduler if running
        this.stopRefreshScheduler();

        // Calculate interval in milliseconds
        this._refreshInterval = intervalMinutes * 60 * 1000;
        this._refreshEnabled = true;

        console.debug(`[TOKEN_CACHE] Starting refresh scheduler (${intervalMinutes} minutes)`);

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
        intervalMinutes: this._refreshInterval / (60 * 1000),
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
      const intervalMinutes = config.refreshIntervalMinutes || 15;
      const validIntervalMinutes = Math.max(1, Math.min(1440, intervalMinutes));
      
      console.debug(`[TOKEN_REFRESH] Starting scheduler with ${validIntervalMinutes} minute interval`);
      
      // Start the refresh scheduler
      const success = scheduler.startRefreshScheduler(
        async () => {
          console.debug('[TOKEN_REFRESH] Executing scheduled multi-token refresh...');
          const result = await reactHandler.refreshToken();
          if (result.success) {
            console.debug(`[TOKEN_REFRESH] Scheduled refresh completed: ${result.successCount}/${result.totalTokens} tokens refreshed successfully`);
            if (result.errorCount > 0) {
              console.warn(`[TOKEN_REFRESH] ${result.errorCount} tokens failed to refresh during scheduled refresh`);
            }
          } else {
            console.warn('[TOKEN_REFRESH] Scheduled refresh failed:', result.error || 'All token refreshes failed');
          }
        },
        validIntervalMinutes
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