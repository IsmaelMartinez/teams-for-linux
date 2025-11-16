// Microsoft Graph API Client
// Implements Microsoft Graph API integration for Teams for Linux
// Issue #1832 - Strategic Initiative: Microsoft Graph API Integration

const logger = require('electron-log');

/**
 * GraphApiClient - Microsoft Graph API integration client
 *
 * This class provides access to Microsoft Graph API endpoints using
 * the existing Teams authentication infrastructure. It leverages
 * the authentication tokens already obtained by Teams to access
 * Graph API resources without requiring separate authentication.
 *
 * Key Features:
 * - Token acquisition via Teams authentication provider
 * - Calendar access (read/write)
 * - User profile information
 * - Configurable API endpoint access
 * - Graceful error handling and fallback
 */
class GraphApiClient {
  constructor(config = {}) {
    this.config = config;
    this.enabled = config.graphApi?.enabled ?? false;
    this.baseUrl = 'https://graph.microsoft.com/v1.0';
    this.currentToken = null;
    this.tokenExpiry = null;

    logger.info('[GRAPH_API] GraphApiClient initialized', {
      enabled: this.enabled,
      baseUrl: this.baseUrl
    });
  }

  /**
   * Initialize the Graph API client with main window
   * @param {object} mainWindow - Main BrowserWindow instance
   */
  initialize(mainWindow) {
    this.mainWindow = mainWindow;
    logger.debug('[GRAPH_API] Main window set');
  }

  /**
   * Check if Graph API is enabled
   * @returns {boolean} True if enabled
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Acquire a fresh token for Graph API access
   * @param {boolean} forceRefresh - Force token refresh even if cached
   * @returns {Promise<object>} Token acquisition result
   */
  async acquireToken(forceRefresh = false) {
    try {
      if (!this.mainWindow || !this.mainWindow.webContents) {
        logger.warn('[GRAPH_API] Main window not initialized');
        return { success: false, error: 'Main window not initialized' };
      }

      // Check if we have a valid cached token
      if (!forceRefresh && this.currentToken && this.tokenExpiry) {
        const now = Date.now();
        const expiryTime = new Date(this.tokenExpiry).getTime();
        const timeUntilExpiry = expiryTime - now;

        // Use cached token if it's valid for at least 5 more minutes
        if (timeUntilExpiry > 5 * 60 * 1000) {
          logger.debug('[GRAPH_API] Using cached token', {
            timeUntilExpiry: Math.floor(timeUntilExpiry / 1000) + 's'
          });
          return {
            success: true,
            token: this.currentToken,
            fromCache: true,
            expiry: this.tokenExpiry
          };
        }
      }

      // Acquire new token via Teams authentication provider
      const result = await this.mainWindow.webContents.executeJavaScript(`
        (async () => {
          if (window.teamsForLinuxReactHandler && typeof window.teamsForLinuxReactHandler.acquireToken === 'function') {
            return await window.teamsForLinuxReactHandler.acquireToken('https://graph.microsoft.com', {
              forceRenew: ${forceRefresh}
            });
          } else {
            return { success: false, error: 'ReactHandler not available' };
          }
        })()
      `);

      if (result && result.success && result.token) {
        this.currentToken = result.token;
        this.tokenExpiry = result.expiry;

        logger.debug('[GRAPH_API] Token acquired successfully', {
          fromCache: result.fromCache,
          expiry: result.expiry
        });

        return result;
      } else {
        logger.warn('[GRAPH_API] Token acquisition failed', result);
        return result || { success: false, error: 'Unknown error' };
      }

    } catch (error) {
      logger.error('[GRAPH_API] Token acquisition error:', error);
      return {
        success: false,
        error: error.message || error.toString()
      };
    }
  }

  /**
   * Make an authenticated request to the Graph API
   * @param {string} endpoint - API endpoint (e.g., '/me', '/me/calendar/events')
   * @param {object} options - Request options (method, body, headers)
   * @returns {Promise<object>} API response
   */
  async makeRequest(endpoint, options = {}) {
    try {
      if (!this.enabled) {
        logger.warn('[GRAPH_API] Graph API is disabled');
        return { success: false, error: 'Graph API is disabled' };
      }

      // Acquire token
      const tokenResult = await this.acquireToken();
      if (!tokenResult.success || !tokenResult.token) {
        return { success: false, error: 'Failed to acquire token' };
      }

      // Prepare request
      const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
      const method = options.method || 'GET';
      const headers = {
        'Authorization': `Bearer ${tokenResult.token}`,
        'Content-Type': 'application/json',
        ...options.headers
      };

      const requestOptions = {
        method,
        headers
      };

      if (options.body) {
        requestOptions.body = JSON.stringify(options.body);
      }

      logger.debug('[GRAPH_API] Making request', {
        method,
        endpoint: url
      });

      // Make the request
      const response = await fetch(url, requestOptions);

      // Handle response - check if there's a body before parsing JSON
      let data = null;
      const contentType = response.headers.get('content-type');
      const hasJsonContent = contentType && contentType.includes('application/json');

      // Only try to parse JSON if there's content and it's JSON
      if (response.status !== 204 && hasJsonContent) {
        const text = await response.text();
        if (text && text.length > 0) {
          try {
            data = JSON.parse(text);
          } catch (parseError) {
            logger.warn('[GRAPH_API] Failed to parse response as JSON', {
              status: response.status,
              contentType,
              textPreview: text.substring(0, 100)
            });
          }
        }
      }

      if (response.ok) {
        logger.debug('[GRAPH_API] Request successful', {
          status: response.status,
          endpoint: url
        });
        return { success: true, data };
      } else {
        logger.warn('[GRAPH_API] Request failed', {
          status: response.status,
          error: data?.error
        });
        return {
          success: false,
          error: data?.error?.message || `API request failed with status ${response.status}`,
          status: response.status,
          data
        };
      }

    } catch (error) {
      logger.error('[GRAPH_API] Request error:', error);
      return {
        success: false,
        error: error.message || error.toString()
      };
    }
  }

  /**
   * Build OData query string from options
   * @private
   * @param {object} options - Query options
   * @returns {string} Query string (without leading '?')
   */
  _buildODataQuery(options) {
    const params = new URLSearchParams();
    const supportedParams = {
      startDateTime: 'startDateTime',
      endDateTime: 'endDateTime',
      top: '$top',
      select: '$select',
      filter: '$filter',
      orderby: '$orderby',
      skip: '$skip',
      count: '$count',
      search: '$search',
      expand: '$expand'
    };

    for (const [key, value] of Object.entries(options)) {
      if (supportedParams[key] && value !== undefined && value !== null) {
        params.append(supportedParams[key], value);
      }
    }

    return params.toString();
  }

  /**
   * Get current user profile
   * @returns {Promise<object>} User profile data
   */
  async getUserProfile() {
    logger.debug('[GRAPH_API] Getting user profile');
    return await this.makeRequest('/me');
  }

  /**
   * Get user's calendar events
   * @param {object} options - Query options (startDateTime, endDateTime, top, etc.)
   * @returns {Promise<object>} Calendar events
   */
  async getCalendarEvents(options = {}) {
    logger.debug('[GRAPH_API] Getting calendar events', options);

    const queryString = this._buildODataQuery(options);
    const endpoint = queryString ? `/me/calendar/events?${queryString}` : '/me/calendar/events';

    return await this.makeRequest(endpoint);
  }

  /**
   * Get user's calendar view (events within a time range)
   * @param {string} startDateTime - Start date/time (ISO 8601)
   * @param {string} endDateTime - End date/time (ISO 8601)
   * @param {object} options - Additional query options
   * @returns {Promise<object>} Calendar view data
   */
  async getCalendarView(startDateTime, endDateTime, options = {}) {
    logger.debug('[GRAPH_API] Getting calendar view', { startDateTime, endDateTime });

    const queryOptions = {
      startDateTime,
      endDateTime,
      ...options
    };
    const queryString = this._buildODataQuery(queryOptions);
    const endpoint = `/me/calendar/calendarView?${queryString}`;

    return await this.makeRequest(endpoint);
  }

  /**
   * Create a calendar event
   * @param {object} event - Event object (subject, start, end, etc.)
   * @returns {Promise<object>} Created event data
   */
  async createCalendarEvent(event) {
    logger.debug('[GRAPH_API] Creating calendar event', { subject: event.subject });

    return await this.makeRequest('/me/calendar/events', {
      method: 'POST',
      body: event
    });
  }

  /**
   * Update a calendar event
   * @param {string} eventId - Event ID
   * @param {object} updates - Event updates
   * @returns {Promise<object>} Updated event data
   */
  async updateCalendarEvent(eventId, updates) {
    logger.debug('[GRAPH_API] Updating calendar event', { eventId });

    return await this.makeRequest(`/me/calendar/events/${eventId}`, {
      method: 'PATCH',
      body: updates
    });
  }

  /**
   * Delete a calendar event
   * @param {string} eventId - Event ID
   * @returns {Promise<object>} Deletion result
   */
  async deleteCalendarEvent(eventId) {
    logger.debug('[GRAPH_API] Deleting calendar event', { eventId });

    return await this.makeRequest(`/me/calendar/events/${eventId}`, {
      method: 'DELETE'
    });
  }

  /**
   * Get user's mail messages
   * @param {object} options - Query options (top, select, filter, etc.)
   * @returns {Promise<object>} Mail messages
   */
  async getMailMessages(options = {}) {
    logger.debug('[GRAPH_API] Getting mail messages', options);

    const queryString = this._buildODataQuery(options);
    const endpoint = queryString ? `/me/messages?${queryString}` : '/me/messages';

    return await this.makeRequest(endpoint);
  }

  /**
   * Get user's presence information
   * @returns {Promise<object>} Presence data
   */
  async getPresence() {
    logger.debug('[GRAPH_API] Getting presence information');
    return await this.makeRequest('/me/presence');
  }

  /**
   * Get diagnostic information
   * @returns {object} Diagnostic data
   */
  getDiagnostics() {
    return {
      enabled: this.enabled,
      baseUrl: this.baseUrl,
      hasToken: !!this.currentToken,
      tokenExpiry: this.tokenExpiry,
      hasMainWindow: !!this.mainWindow
    };
  }
}

module.exports = GraphApiClient;
