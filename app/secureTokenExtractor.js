const https = require('https');
const TokenInspector = require('./tokenInspector');

/**
 * Secure Token Extractor - Main process token extraction and Graph API client
 * This module handles secure access to Microsoft Graph API using extracted tokens
 * without requiring DOM access or contextIsolation to be disabled
 */
class SecureTokenExtractor {
  
  constructor(partitionName = 'persist:teams-4-linux') {
    this.partitionName = partitionName;
    this.tokenInspector = new TokenInspector(partitionName);
    this.cachedTokens = new Map();
    this.tokenRefreshInterval = null;
    this.lastTokenRefresh = null;
  }

  /**
   * Extract access token from stored authentication data
   * Prioritizes security by only accessing data from main process
   */
  async extractAccessToken() {
    try {
      console.debug('SecureTokenExtractor: Extracting access token from main process storage');
      
      // Method 1: Check cookies for Bearer tokens
      const cookieToken = await this.extractTokenFromCookies();
      if (cookieToken) {
        console.debug('SecureTokenExtractor: Found token in cookies');
        return this.validateAndCacheToken(cookieToken, 'cookies');
      }

      // Method 2: Check session storage for MSAL tokens
      const sessionToken = await this.extractTokenFromSession();
      if (sessionToken) {
        console.debug('SecureTokenExtractor: Found token in session');
        return this.validateAndCacheToken(sessionToken, 'session');
      }

      // Method 3: Extract from WebContents if available (secure method)
      const rendererToken = await this.extractTokenFromRenderer();
      if (rendererToken) {
        console.debug('SecureTokenExtractor: Found token in renderer');
        return this.validateAndCacheToken(rendererToken, 'renderer');
      }

      console.warn('SecureTokenExtractor: No valid access token found');
      return null;

    } catch (error) {
      console.error('SecureTokenExtractor: Error extracting access token:', error);
      return null;
    }
  }

  /**
   * Extract token from HTTP-only cookies (most secure method)
   */
  async extractTokenFromCookies() {
    try {
      const cookies = await this.tokenInspector.getMicrosoftCookies();
      
      // Look for authentication cookies that might contain or reference tokens
      const authCookies = [
        ...cookies.microsoft || [],
        ...cookies.teams || [],
        ...cookies.live || []
      ].filter(cookie => {
        const name = cookie.name.toLowerCase();
        return name.includes('auth') || 
               name.includes('token') || 
               name.includes('msal') ||
               name.includes('bearer') ||
               name.includes('access') ||
               name === 'authtoken' ||
               name === 'x-ms-token';
      });

      // Extract token from cookie values
      for (const cookie of authCookies) {
        try {
          // Check if cookie value is a token or contains token reference
          const tokenCandidate = this.parseTokenFromCookieValue(cookie.value);
          if (tokenCandidate && tokenCandidate.length > 100) { // Typical access token length
            return tokenCandidate;
          }
        } catch (error) {
          console.debug('SecureTokenExtractor: Cookie parsing error:', error.message);
        }
      }

      return null;
    } catch (error) {
      console.error('SecureTokenExtractor: Error extracting token from cookies:', error);
      return null;
    }
  }

  /**
   * Parse potential token from cookie value
   */
  parseTokenFromCookieValue(cookieValue) {
    try {
      // Method 1: Direct token
      if (cookieValue.startsWith('eyJ') || cookieValue.startsWith('Bearer ')) {
        return cookieValue.replace('Bearer ', '');
      }

      // Method 2: JSON containing token
      try {
        const parsed = JSON.parse(decodeURIComponent(cookieValue));
        if (parsed.access_token) return parsed.access_token;
        if (parsed.accessToken) return parsed.accessToken;
        if (parsed.token) return parsed.token;
      } catch {
        // Not JSON, continue
      }

      // Method 3: URL encoded token
      const urlParams = new URLSearchParams(cookieValue);
      if (urlParams.get('access_token')) return urlParams.get('access_token');
      if (urlParams.get('token')) return urlParams.get('token');

      return null;
    } catch (error) {
      console.debug('SecureTokenExtractor: Error parsing cookie value:', error.message);
      return null;
    }
  }

  /**
   * Extract token from session storage (requires renderer access)
   */
  async extractTokenFromSession() {
    // This would require WebContents access to session storage
    // Implementation depends on whether we have access to the main window
    return null; // Placeholder - implement based on available WebContents
  }

  /**
   * Extract token from renderer process securely
   */
  async extractTokenFromRenderer() {
    // This method would be called when WebContents is available
    // For now, return null as this requires integration with browser window
    return null; // Placeholder - implement when called with WebContents
  }

  /**
   * Validate token format and cache it
   */
  async validateAndCacheToken(token, source) {
    try {
      // Basic token format validation
      if (!token || token.length < 50) {
        console.warn('SecureTokenExtractor: Token too short to be valid');
        return null;
      }

      // JWT token pattern check
      const jwtPattern = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
      if (!token.match(jwtPattern) && !token.startsWith('EwA')) {
        console.warn('SecureTokenExtractor: Token format does not match expected patterns');
        return null;
      }

      // Cache the token with metadata
      const tokenData = {
        token: token,
        source: source,
        extractedAt: new Date().toISOString(),
        lastValidated: null
      };

      this.cachedTokens.set('access_token', tokenData);
      console.debug(`SecureTokenExtractor: Token cached from source: ${source}`);
      
      return tokenData;

    } catch (error) {
      console.error('SecureTokenExtractor: Error validating token:', error);
      return null;
    }
  }

  /**
   * Get cached token or extract new one
   */
  async getValidAccessToken() {
    try {
      // Check if we have a cached valid token
      const cached = this.cachedTokens.get('access_token');
      if (cached && this.isTokenFresh(cached)) {
        return cached.token;
      }

      // Extract fresh token
      const tokenData = await this.extractAccessToken();
      return tokenData ? tokenData.token : null;

    } catch (error) {
      console.error('SecureTokenExtractor: Error getting valid access token:', error);
      return null;
    }
  }

  /**
   * Check if cached token is still fresh (within 5 minutes)
   */
  isTokenFresh(tokenData) {
    if (!tokenData || !tokenData.extractedAt) return false;
    
    const extractedTime = new Date(tokenData.extractedAt);
    const now = new Date();
    const fiveMinutes = 5 * 60 * 1000;
    
    return (now - extractedTime) < fiveMinutes;
  }

  /**
   * Make authenticated Graph API request
   */
  async makeGraphApiRequest(endpoint, options = {}) {
    try {
      const accessToken = await this.getValidAccessToken();
      if (!accessToken) {
        return {
          success: false,
          error: 'No valid access token available'
        };
      }

      const defaultOptions = {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      };

      const requestOptions = { ...defaultOptions, ...options };
      
      // Use Node.js HTTPS module for security (avoid fetch dependency)
      const result = await this.makeHttpsRequest(
        `https://graph.microsoft.com/v1.0${endpoint}`,
        requestOptions
      );

      return result;

    } catch (error) {
      console.error('SecureTokenExtractor: Error making Graph API request:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Make HTTPS request using Node.js built-in module
   */
  makeHttpsRequest(url, options) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      
      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers: options.headers || {}
      };

      const req = https.request(requestOptions, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const result = {
              success: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              statusText: res.statusMessage,
              headers: res.headers
            };

            if (result.success) {
              try {
                result.data = JSON.parse(data);
              } catch {
                result.data = data;
              }
            } else {
              result.error = data;
            }

            resolve(result);
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      if (options.body) {
        req.write(JSON.stringify(options.body));
      }

      req.end();
    });
  }

  /**
   * Test connection to Graph API
   */
  async testGraphConnection() {
    console.log('SecureTokenExtractor: Testing Graph API connection...');
    
    const result = await this.makeGraphApiRequest('/me');
    
    if (result.success) {
      console.log('SecureTokenExtractor: ✅ Graph API connection successful');
      console.log('SecureTokenExtractor: User:', {
        displayName: result.data.displayName,
        userPrincipalName: result.data.userPrincipalName,
        id: result.data.id
      });
      return true;
    } else {
      console.log('SecureTokenExtractor: ❌ Graph API connection failed:', result.error);
      return false;
    }
  }

  /**
   * Get user's calendar events (example Graph API usage)
   */
  async getUserCalendarEvents(daysAhead = 1) {
    try {
      const startTime = new Date();
      const endTime = new Date(startTime.getTime() + (daysAhead * 24 * 60 * 60 * 1000));
      
      const endpoint = `/me/calendar/calendarView?startDateTime=${startTime.toISOString()}&endDateTime=${endTime.toISOString()}`;
      const result = await this.makeGraphApiRequest(endpoint);
      
      if (result.success) {
        return {
          success: true,
          events: result.data.value || [],
          count: result.data.value ? result.data.value.length : 0
        };
      } else {
        return {
          success: false,
          error: result.error
        };
      }
    } catch (error) {
      console.error('SecureTokenExtractor: Error getting calendar events:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get user's mail messages (example Graph API usage)
   */
  async getUserMailMessages(maxResults = 10) {
    try {
      const endpoint = `/me/messages?$top=${maxResults}&$select=id,subject,from,receivedDateTime,importance,isRead`;
      const result = await this.makeGraphApiRequest(endpoint);
      
      if (result.success) {
        return {
          success: true,
          messages: result.data.value || [],
          count: result.data.value ? result.data.value.length : 0
        };
      } else {
        return {
          success: false,
          error: result.error
        };
      }
    } catch (error) {
      console.error('SecureTokenExtractor: Error getting mail messages:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Start periodic token refresh
   */
  startTokenRefresh(intervalMinutes = 5) {
    if (this.tokenRefreshInterval) {
      clearInterval(this.tokenRefreshInterval);
    }

    this.tokenRefreshInterval = setInterval(async () => {
      console.debug('SecureTokenExtractor: Refreshing cached tokens...');
      await this.extractAccessToken();
      this.lastTokenRefresh = new Date();
    }, intervalMinutes * 60 * 1000);

    console.debug(`SecureTokenExtractor: Token refresh started (${intervalMinutes} minute intervals)`);
  }

  /**
   * Stop token refresh
   */
  stopTokenRefresh() {
    if (this.tokenRefreshInterval) {
      clearInterval(this.tokenRefreshInterval);
      this.tokenRefreshInterval = null;
      console.debug('SecureTokenExtractor: Token refresh stopped');
    }
  }

  /**
   * Clear all cached tokens
   */
  clearTokenCache() {
    this.cachedTokens.clear();
    console.debug('SecureTokenExtractor: Token cache cleared');
  }

  /**
   * Get token extraction status
   */
  getStatus() {
    return {
      partitionName: this.partitionName,
      cachedTokens: this.cachedTokens.size,
      lastTokenRefresh: this.lastTokenRefresh,
      refreshActive: this.tokenRefreshInterval !== null
    };
  }
}

module.exports = SecureTokenExtractor;