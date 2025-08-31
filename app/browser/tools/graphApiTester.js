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
      console.debug('GraphApiTester: /me endpoint successful:', {
        id: userData.id,
        displayName: userData.displayName,
        userPrincipalName: userData.userPrincipalName,
        mail: userData.mail
      });

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
          console.debug('GraphApiTester: Token scopes and info:', {
            scopes: payload.scp || payload.scope || 'No scopes found',
            audience: payload.aud,
            issuer: payload.iss,
            appId: payload.appid,
            expires: new Date(payload.exp * 1000).toISOString()
          });
        }
      } catch (error) {
        console.debug('GraphApiTester: Could not decode token:', error.message);
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
    console.debug('GraphApiTester: Token cache cleared');
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