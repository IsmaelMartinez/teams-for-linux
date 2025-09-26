// Token Refresh Injection Script
// This script is injected into the Teams web context to enable configurable token refresh

(function() {
  'use strict';

  // Import the required modules (they'll be bundled or injected separately)
  let tokenCache, reactHandler;

  try {
    // Try to access existing instances if already injected
    if (window.teamsForLinuxTokenCache && window.teamsForLinuxReactHandler) {
      tokenCache = window.teamsForLinuxTokenCache;
      reactHandler = window.teamsForLinuxReactHandler;
    } else {
      console.debug('[TOKEN_REFRESH] Initializing token refresh system...');
      return; // Wait for proper injection
    }

    // Initialize token refresh with configuration from main process
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
        const success = tokenCache.startRefreshScheduler(
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

    // Expose configuration function to main process
    window.teamsForLinuxTokenRefresh = {
      configure: initializeTokenRefresh,
      stop: () => {
        if (tokenCache) {
          tokenCache.stopRefreshScheduler();
          console.debug('[TOKEN_REFRESH] Scheduler stopped');
        }
      },
      getStatus: () => {
        return tokenCache ? tokenCache.getRefreshSchedulerStatus() : { enabled: false };
      }
    };

    console.debug('[TOKEN_REFRESH] Injection script loaded, waiting for configuration');

  } catch (error) {
    console.error('[TOKEN_REFRESH] Error in injection script:', error);
  }

})();