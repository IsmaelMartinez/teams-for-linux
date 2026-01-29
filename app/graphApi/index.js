const logger = require('electron-log');
const ChatApiSpikes = require('./chatSpikes');

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

  initialize(mainWindow) {
    this.mainWindow = mainWindow;
    logger.debug('[GRAPH_API] Main window set');
  }

  isEnabled() {
    return this.enabled;
  }

  async acquireToken(forceRefresh = false) {
    try {
      if (!this.mainWindow || !this.mainWindow.webContents) {
        logger.warn('[GRAPH_API] Main window not initialized');
        return { success: false, error: 'Main window not initialized' };
      }

      if (!forceRefresh && this.currentToken && this.tokenExpiry) {
        const now = Date.now();
        const expiryTime = new Date(this.tokenExpiry).getTime();
        const timeUntilExpiry = expiryTime - now;

        // Require 5-minute buffer before expiry to avoid race conditions
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

  async makeRequest(endpoint, options = {}) {
    try {
      if (!this.enabled) {
        logger.warn('[GRAPH_API] Graph API is disabled');
        return { success: false, error: 'Graph API is disabled' };
      }

      const tokenResult = await this.acquireToken();
      if (!tokenResult.success || !tokenResult.token) {
        return { success: false, error: 'Failed to acquire token' };
      }

      const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
      const method = options.method || 'GET';

      logger.debug('[GRAPH_API] Making request', { method, endpoint: url });

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${tokenResult.token}`,
          'Content-Type': 'application/json',
          ...options.headers
        },
        ...(options.body && { body: JSON.stringify(options.body) })
      });
      const responseText = await response.text();

      let data = null;
      if (responseText) {
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          // Intentionally catch - continue with null data for non-JSON responses (e.g., 204 No Content)
          logger.warn('[GRAPH_API] Failed to parse response as JSON', {
            status: response.status,
            textPreview: responseText.substring(0, 100),
            parseError: parseError.message
          });
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
          error: data?.error?.message || responseText || 'API request failed',
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

  /** Get current user profile from Graph API */
  async getUserProfile() {
    logger.debug('[GRAPH_API] Getting user profile');
    return await this.makeRequest('/me');
  }

  /** Get calendar events with optional OData query options (top, select, filter, etc.) */
  async getCalendarEvents(options = {}) {
    logger.debug('[GRAPH_API] Getting calendar events', options);

    const queryString = this._buildODataQuery(options);
    const endpoint = queryString ? `/me/calendar/events?${queryString}` : '/me/calendar/events';

    return await this.makeRequest(endpoint);
  }

  /** Get calendar view for a time range (ISO 8601 date strings) */
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

  /** Create a calendar event (requires subject, start, end objects) */
  async createCalendarEvent(event) {
    logger.debug('[GRAPH_API] Creating calendar event', { subject: event.subject });

    return await this.makeRequest('/me/calendar/events', {
      method: 'POST',
      body: event
    });
  }

  /** Update a calendar event by ID */
  async updateCalendarEvent(eventId, updates) {
    logger.debug('[GRAPH_API] Updating calendar event', { eventId });

    return await this.makeRequest(`/me/calendar/events/${eventId}`, {
      method: 'PATCH',
      body: updates
    });
  }

  /** Delete a calendar event by ID */
  async deleteCalendarEvent(eventId) {
    logger.debug('[GRAPH_API] Deleting calendar event', { eventId });

    return await this.makeRequest(`/me/calendar/events/${eventId}`, {
      method: 'DELETE'
    });
  }

  /** Get mail messages with optional OData query options */
  async getMailMessages(options = {}) {
    logger.debug('[GRAPH_API] Getting mail messages', options);

    const queryString = this._buildODataQuery(options);
    const endpoint = queryString ? `/me/messages?${queryString}` : '/me/messages';

    return await this.makeRequest(endpoint);
  }

  /**
   * Run chat API validation spikes
   * These spikes validate if the chat modal feature is feasible
   * @returns {Promise<object>} Results of all spikes
   */
  async runChatSpikes() {
    logger.info('[GRAPH_API] Running chat API validation spikes');

    if (!this.enabled) {
      return {
        success: false,
        error: 'Graph API is disabled. Enable it in config to run spikes.',
        overallResult: 'BLOCKED'
      };
    }

    const spikes = new ChatApiSpikes(this);
    return await spikes.runAllSpikes();
  }
}

module.exports = GraphApiClient;
