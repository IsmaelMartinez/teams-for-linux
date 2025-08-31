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

      const tokenResponse = await authProvider.acquireToken("https://graph.microsoft.com", {
        correlation: correlation,
        forceRenew: false // Try cached token first
      });

      if (!tokenResponse || !tokenResponse.accessToken) {
        console.warn('GraphApiTester: No access token in response');
        return null;
      }

      console.debug('GraphApiTester: Successfully acquired Graph API token');
      
      // Cache the token
      this._lastTokenCache = tokenResponse.accessToken;
      this._tokenCacheTime = now;

      return tokenResponse.accessToken;

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