/**
 * Graph API Tester - Tests Microsoft Graph API using Teams authentication
 * 
 * Usage in browser console (after Teams is loaded):
 * 
 * // Test /me endpoint
 * await window.graphApiTester.testMeEndpoint()
 * 
 * // Test /me/presence endpoint  
 * await window.graphApiTester.testPresenceEndpoint()
 * 
 * // Run all tests
 * await window.graphApiTester.runAllTests()
 * 
 * // Via IPC from main process or console
 * await window.electronAPI.testGraphApi('me')       // Test /me
 * await window.electronAPI.testGraphApi('presence') // Test /me/presence  
 * await window.electronAPI.testGraphApi('all')      // Run all tests
 */
class GraphApiTester {

  constructor() {
    this._lastTokenCache = null;
    this._tokenCacheTime = 0;
    this._tokenCacheDuration = 3600000; // 1 hour cache
  }

  /**
   * Test Graph API /me endpoint using Teams authentication
   * @returns {Promise<Object|null>} User profile data or null if failed
   */
  async testMeEndpoint() {
    console.debug('GraphApiTester: Testing /me endpoint...');
    
    try {
      const token = await this._getGraphToken();
      if (!token) {
        console.warn('GraphApiTester: Could not acquire Graph API token');
        return null;
      }

      console.debug('GraphApiTester: Successfully acquired token, calling /me endpoint');
      
      const response = await fetch('https://graph.microsoft.com/v1.0/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('GraphApiTester: /me endpoint failed:', response.status, response.statusText);
        return null;
      }

      const userData = await response.json();
      
      // Privacy-safe logging - redact PII
      const safeUserData = {
        id: userData.id ? '[REDACTED-USER-ID]' : null,
        displayName: userData.displayName ? '[REDACTED-USER-NAME]' : null,
        userPrincipalName: userData.userPrincipalName ? '[REDACTED]@[REDACTED-DOMAIN]' : null,
        mail: userData.mail ? '[REDACTED]@[REDACTED-DOMAIN]' : null,
        hasValidData: !!(userData.id && userData.displayName && userData.userPrincipalName)
      };
      
      console.debug('GraphApiTester: /me endpoint successful:', safeUserData);

      return userData;

    } catch (error) {
      console.error('GraphApiTester: Error testing /me endpoint:', error);
      return null;
    }
  }

  /**
   * Test Graph API /me/presence endpoint
   * @returns {Promise<Object|null>} Presence data or null if failed
   */
  async testPresenceEndpoint() {
    console.debug('GraphApiTester: Testing /me/presence endpoint...');
    
    try {
      const token = await this._getGraphToken();
      if (!token) {
        console.warn('GraphApiTester: Could not acquire Graph API token');
        return null;
      }

      console.debug('GraphApiTester: Successfully acquired token, calling /me/presence endpoint');
      
      const response = await fetch('https://graph.microsoft.com/v1.0/me/presence', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('GraphApiTester: /me/presence endpoint failed:', response.status, response.statusText);
        return null;
      }

      const presenceData = await response.json();
      console.debug('GraphApiTester: /me/presence endpoint successful:', {
        availability: presenceData.availability,
        activity: presenceData.activity
      });

      return presenceData;

    } catch (error) {
      console.error('GraphApiTester: Error testing /me/presence endpoint:', error);
      return null;
    }
  }

  /**
   * Acquire Graph API token using Teams authentication service
   * @returns {Promise<string|null>} Access token or null if failed
   * @private
   */
  async _getGraphToken() {
    // Use cached token if still valid
    const now = Date.now();
    if (this._lastTokenCache && (now - this._tokenCacheTime < this._tokenCacheDuration)) {
      console.debug('GraphApiTester: Using cached token');
      return this._lastTokenCache;
    }

    try {
      const reactHandler = require('./reactHandler');
      if (!reactHandler._validateTeamsEnvironment()) {
        console.warn('GraphApiTester: Teams environment not valid');
        return null;
      }

      const coreServices = reactHandler._getTeams2CoreServices();
      if (!coreServices?.authenticationService?._coreAuthService?._authProvider) {
        console.warn('GraphApiTester: Teams authentication service not available');
        return null;
      }

      console.debug('GraphApiTester: Acquiring token from Teams auth service...');
      
      const authProvider = coreServices.authenticationService._coreAuthService._authProvider;
      const correlation = coreServices.correlation;

      // Try Graph API token acquisition with different resource identifiers
      let tokenResponse = null;
      const resourceUrls = [
        "https://graph.microsoft.com",
        "https://graph.microsoft.com/",
        "00000003-0000-0000-c000-000000000000", // Microsoft Graph App ID
        "https://graph.windows.net",
        "https://outlook.office365.com"
      ];

      for (const resource of resourceUrls) {
        try {
          console.debug('GraphApiTester: Trying resource:', resource);
          
          tokenResponse = await authProvider.acquireToken(resource, {
            correlation: correlation,
            forceRenew: false
          });

          if (tokenResponse && (tokenResponse.accessToken || tokenResponse.token || tokenResponse.access_token)) {
            console.debug('GraphApiTester: Successfully got token for resource:', resource);
            break;
          } else {
            console.debug('GraphApiTester: No valid token for resource:', resource);
          }
        } catch (error) {
          console.debug('GraphApiTester: Failed to get token for resource:', resource, error.message);
        }
      }

      // Debug the token response structure
      console.debug('GraphApiTester: Token response structure:', {
        hasResponse: !!tokenResponse,
        responseType: typeof tokenResponse,
        responseKeys: tokenResponse ? Object.keys(tokenResponse) : [],
        accessTokenExists: !!(tokenResponse?.accessToken),
        tokenExists: !!(tokenResponse?.token),
        idTokenExists: !!(tokenResponse?.idToken)
      });

      if (!tokenResponse) {
        console.warn('GraphApiTester: No token response received');
        return null;
      }

      // Try different possible token properties
      const accessToken = tokenResponse.accessToken || 
                         tokenResponse.token || 
                         tokenResponse.access_token ||
                         tokenResponse.idToken;

      if (!accessToken) {
        console.warn('GraphApiTester: No access token found in response properties:', Object.keys(tokenResponse));
        return null;
      }

      // Decode token to see scopes (JWT token has 3 parts: header.payload.signature)
      try {
        const tokenParts = accessToken.split('.');
        if (tokenParts.length === 3) {
          const payload = JSON.parse(atob(tokenParts[1]));
          console.log('GraphApiTester: TOKEN SCOPE ANALYSIS:', {
            scopes: payload.scp || payload.scope || payload.roles || 'No scopes found',
            audience: payload.aud,
            issuer: payload.iss,
            appId: payload.appid || payload.azp || payload.client_id,
            expires: payload.exp ? new Date(payload.exp * 1000).toISOString() : 'No expiry',
            allClaims: Object.keys(payload).filter(key => 
              key.includes('scp') || 
              key.includes('scope') || 
              key.includes('role') || 
              key.includes('perm')
            )
          });
          
          // Log full payload for detailed analysis (be careful with PII)
          console.log('GraphApiTester: Full token payload keys:', Object.keys(payload));
        } else {
          console.log('GraphApiTester: Token is not a standard JWT format');
        }
      } catch (error) {
        console.log('GraphApiTester: Could not decode token:', error.message);
        console.log('GraphApiTester: Token starts with:', accessToken.substring(0, 50) + '...');
      }

      console.debug('GraphApiTester: Successfully acquired Graph API token');
      
      // Cache the token
      this._lastTokenCache = accessToken;
      this._tokenCacheTime = now;

      return accessToken;

    } catch (error) {
      console.error('GraphApiTester: Error acquiring Graph API token:', error);
      return null;
    }
  }

  /**
   * Clear cached token to force refresh
   */
  clearTokenCache() {
    this._lastTokenCache = null;
    this._tokenCacheTime = 0;
    console.log('GraphApiTester: Token cache cleared - next request will acquire new token');
  }

  /**
   * Test presence API with expanded scope token
   */
  async testPresenceWithExpandedToken() {
    try {
      console.log('GraphApiTester: Testing presence with expanded scope token...');
      
      // Try to get token with presence scope
      const token = await this.acquireTokenWithScopes(['https://graph.microsoft.com/Presence.Read']);
      
      if (!token) {
        return { success: false, error: 'Could not acquire token with Presence.Read scope' };
      }
      
      // Test the presence endpoint with the new token
      const response = await fetch('https://graph.microsoft.com/v1.0/me/presence', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('GraphApiTester: Presence with expanded token failed:', response.status, response.statusText);
        return { success: false, status: response.status, statusText: response.statusText };
      }

      const presenceData = await response.json();
      console.log('GraphApiTester: SUCCESS! Presence with expanded token:', {
        availability: presenceData.availability,
        activity: presenceData.activity,
        timestamp: new Date().toISOString()
      });

      return { success: true, data: presenceData };
      
    } catch (error) {
      console.error('GraphApiTester: Error testing presence with expanded token:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Attempt to acquire token with additional scopes
   */
  async acquireTokenWithScopes(additionalScopes = []) {
    try {
      const reactHandler = require('./reactHandler');
      if (!reactHandler._validateTeamsEnvironment()) {
        console.warn('GraphApiTester: Teams environment not valid');
        return null;
      }

      const coreServices = reactHandler._getTeams2CoreServices();
      if (!coreServices?.authenticationService?._coreAuthService?._authProvider) {
        console.warn('GraphApiTester: Teams authentication service not available');
        return null;
      }

      console.log('GraphApiTester: Attempting to acquire token with additional scopes:', additionalScopes);
      
      const authProvider = coreServices.authenticationService._coreAuthService._authProvider;
      const correlation = coreServices.correlation;

      // Try multiple approaches to scope expansion
      let tokenResponse = null;
      const scopesToRequest = ['https://graph.microsoft.com/User.Read', ...additionalScopes];
      
      // Approach 1: Standard scopes array
      console.log('GraphApiTester: Trying approach 1 - scopes array');
      try {
        tokenResponse = await authProvider.acquireToken("https://graph.microsoft.com", {
          correlation: correlation,
          forceRenew: true,
          scopes: scopesToRequest
        });
        if (tokenResponse) console.log('GraphApiTester: Approach 1 succeeded');
      } catch (error) {
        console.log('GraphApiTester: Approach 1 failed:', error.message);
      }
      
      // Approach 2: Space-separated scope string
      if (!tokenResponse) {
        console.log('GraphApiTester: Trying approach 2 - scope string');
        try {
          tokenResponse = await authProvider.acquireToken("https://graph.microsoft.com", {
            correlation: correlation,
            forceRenew: true,
            scope: scopesToRequest.join(' ')
          });
          if (tokenResponse) console.log('GraphApiTester: Approach 2 succeeded');
        } catch (error) {
          console.log('GraphApiTester: Approach 2 failed:', error.message);
        }
      }
      
      // Approach 3: Different resource + scopes
      if (!tokenResponse) {
        console.log('GraphApiTester: Trying approach 3 - alternative parameters');
        try {
          tokenResponse = await authProvider.acquireToken("https://graph.microsoft.com", {
            correlation: correlation,
            forceRenew: true,
            resource: "https://graph.microsoft.com",
            extraScopesToConsent: additionalScopes
          });
          if (tokenResponse) console.log('GraphApiTester: Approach 3 succeeded');
        } catch (error) {
          console.log('GraphApiTester: Approach 3 failed:', error.message);
        }
      }
      
      // Fallback: Just get a fresh token without scope expansion
      if (!tokenResponse) {
        console.log('GraphApiTester: All scope expansion approaches failed, getting fresh token');
        tokenResponse = await authProvider.acquireToken("https://graph.microsoft.com", {
          correlation: correlation,
          forceRenew: true
        });
      }

      if (tokenResponse) {
        console.log('GraphApiTester: Got token response with scopes request');
        return this._analyzeToken(tokenResponse);
      }

      return null;
    } catch (error) {
      console.error('GraphApiTester: Error acquiring token with scopes:', error);
      return null;
    }
  }

  /**
   * Analyze token structure and scopes
   */
  _analyzeToken(tokenResponse) {
    const accessToken = tokenResponse.accessToken || 
                       tokenResponse.token || 
                       tokenResponse.access_token ||
                       tokenResponse.idToken;

    if (!accessToken) {
      console.log('GraphApiTester: No access token in response');
      return null;
    }

    // Decode and analyze token
    try {
      const tokenParts = accessToken.split('.');
      if (tokenParts.length === 3) {
        const payload = JSON.parse(atob(tokenParts[1]));
        console.log('GraphApiTester: TOKEN SCOPE ANALYSIS:', {
          scopes: payload.scp || payload.scope || payload.roles || 'No scopes found',
          audience: payload.aud,
          issuer: payload.iss,
          appId: payload.appid || payload.azp || payload.client_id,
          expires: payload.exp ? new Date(payload.exp * 1000).toISOString() : 'No expiry',
          allScopeKeys: Object.keys(payload).filter(key => 
            key.toLowerCase().includes('scp') || 
            key.toLowerCase().includes('scope') || 
            key.toLowerCase().includes('role') || 
            key.toLowerCase().includes('perm')
          )
        });
        
        console.log('GraphApiTester: All token payload keys:', Object.keys(payload));
      }
    } catch (error) {
      console.log('GraphApiTester: Could not decode token:', error.message);
    }

    return accessToken;
  }

  /**
   * Run both /me and /me/presence tests
   * @returns {Promise<Object>} Test results
   */
  async runAllTests() {
    console.debug('GraphApiTester: Running all Graph API tests...');
    
    const results = {
      timestamp: new Date().toISOString(),
      me: null,
      presence: null,
      success: false
    };

    try {
      // Test /me endpoint
      results.me = await this.testMeEndpoint();
      
      // Test /me/presence endpoint
      results.presence = await this.testPresenceEndpoint();

      results.success = !!(results.me || results.presence);

      console.debug('GraphApiTester: Test results:', {
        meSuccess: !!results.me,
        presenceSuccess: !!results.presence,
        overallSuccess: results.success
      });

      return results;

    } catch (error) {
      console.error('GraphApiTester: Error running tests:', error);
      return results;
    }
  }
}

module.exports = new GraphApiTester();