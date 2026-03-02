const logger = require('electron-log');

class GraphApiClient {
  constructor(config = {}) {
    this.config = config;
    this.enabled = config.graphApi?.enabled ?? false;
    this.baseUrl = 'https://graph.microsoft.com/v1.0';
    this.currentToken = null;
    this.tokenExpiry = null;
    this.cachedSenderInfo = null;

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
      if (!this.mainWindow?.webContents) {
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

      if (result?.success && result?.token) {
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

  _escapeHtml(text) {
    return text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
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
   * Search people using the People API
   * Returns contacts ranked by interaction frequency (relevance-based)
   * @param {string} query - Search query string
   * @param {object} options - Optional OData query options (top, select)
   * @returns {Promise<object>} - API response with people list
   */
  async searchPeople(query, options = {}) {
    logger.debug('[GRAPH_API] Searching people');

    const queryOptions = {
      top: options.top ?? 10,
      ...options
    };

    if (query) {
      // Escape quotes and backslashes in search query
      const escapedQuery = query
        .replaceAll('\\', String.raw`\\`)
        .replaceAll('"', String.raw`\"`);
      queryOptions.search = `"${escapedQuery}"`;
    }

    const queryString = this._buildODataQuery(queryOptions);
    const endpoint = queryString ? `/me/people?${queryString}` : '/me/people';

    return await this.makeRequest(endpoint);
  }

  /** Resolve or create a 1:1 chat with a user via Teams internal services */
  async resolveConversation(recipientUserId) {
    try {
      if (!this.enabled) {
        return { success: false, error: 'Graph API is disabled' };
      }

      if (!this.mainWindow?.webContents) {
        return { success: false, error: 'Main window not initialized' };
      }

      // Validate recipientUserId is a GUID to prevent injection
      const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!guidRegex.test(recipientUserId)) {
        return { success: false, error: 'Invalid user ID format' };
      }

      const recipientMri = `8:orgid:${recipientUserId}`;

      // Step 1: Use Teams' entityCommanding to ensure the 1:1 chat exists
      await this.mainWindow.webContents.executeJavaScript(`
        (async () => {
          const handler = window.teamsForLinuxReactHandler;
          if (!handler) return;
          const coreServices = handler._getTeams2CoreServices();
          if (!coreServices) return;
          const chatCommanding = coreServices.entityCommanding?.chat;
          if (chatCommanding) await chatCommanding.chatWithUsers([${JSON.stringify(recipientMri)}]);
        })()
      `);

      // Wait for Teams to process the navigation
      await new Promise(r => setTimeout(r, 2000));

      // Step 2: Collect candidate thread IDs from the DOM
      // Scan specific attributes to reduce performance impact
      const candidates = await this.mainWindow.webContents.executeJavaScript(String.raw`
        (() => {
          const ids = new Set();
          const maxElements = 1000; // Cap to prevent UI hangs
          let count = 0;

          // Target specific attributes likely to contain chat IDs
          const attributesToCheck = ['id', 'data-tid', 'aria-label', 'data-convid'];
          const elements = document.querySelectorAll('[id], [data-tid], [aria-label], [data-convid]');

          for (const el of elements) {
            if (++count > maxElements) break;

            for (const attrName of attributesToCheck) {
              const attrValue = el.getAttribute(attrName);
              if (attrValue && attrValue.includes('19:')) {
                const matches = attrValue.matchAll(/19:[a-zA-Z0-9_-]+@(?:thread\.v2|unq\.gbl\.spaces)/gi);
                for (const m of matches) {
                  if (!m[0].includes('meeting_')) ids.add(m[0]);
                }
              }
            }
          }
          return [...ids];
        })()
      `);

      logger.info('[GRAPH_API] Found candidate chat IDs', { count: candidates?.length });

      if (!candidates?.length) {
        return { success: false, error: 'No chat thread IDs found' };
      }

      // Step 3: Check each candidate's members to find the 1:1 chat with the target user
      for (const chatId of candidates) {
        const membersResult = await this.makeRequest(`/chats/${encodeURIComponent(chatId)}/members`);
        if (!membersResult.success || !membersResult.data?.value) continue;

        const members = membersResult.data.value;

        // Skip group chats — a 1:1 chat has exactly 2 members
        if (members.length !== 2) {
          continue;
        }

        const hasRecipient = members.some(
          member => member.userId === recipientUserId
        );

        if (hasRecipient) {
          logger.info('[GRAPH_API] Conversation resolved via member check', {
            chatId: chatId.substring(0, 40) + '...',
            checkedCount: candidates.indexOf(chatId) + 1
          });
          return { success: true, conversationId: chatId };
        }
      }

      logger.warn('[GRAPH_API] No chat found containing target user');
      return { success: false, error: 'Could not find a chat with this user. You may need to start a conversation in Teams first.' };
    } catch (error) {
      logger.error('[GRAPH_API] Conversation resolution error:', error);
      return { success: false, error: error.message || error.toString() };
    }
  }

  /** Send a chat message via Graph API (uses ChatMessage.Send scope) */
  async sendChatMessage(chatId, content) {
    try {
      const result = await this.makeRequest(`/chats/${encodeURIComponent(chatId)}/messages`, {
        method: 'POST',
        body: {
          body: {
            content: content,
            contentType: 'text'
          }
        }
      });

      if (result.success) {
        logger.info('[GRAPH_API] Chat message sent via Graph API', {
          chatId: chatId?.substring(0, 30) + '...'
        });
        return { success: true };
      }

      logger.warn('[GRAPH_API] Send message failed', {
        chatId: chatId?.substring(0, 30) + '...',
        status: result.status,
        error: result.error
      });
      return result;
    } catch (error) {
      logger.error('[GRAPH_API] Send message error:', error);
      return { success: false, error: error.message || error.toString() };
    }
  }

  /** Send a chat message to a user (orchestrates resolve + send) */
  async sendChatMessageToUser(contactInfo, content) {
    try {
      if (!this.enabled) {
        return { success: false, error: 'Graph API is disabled' };
      }

      // Resolve conversation
      const conversationResult = await this.resolveConversation(contactInfo.userId);
      if (!conversationResult.success) {
        return conversationResult;
      }

      // Send message via Graph API
      return await this.sendChatMessage(conversationResult.conversationId, content);
    } catch (error) {
      logger.error('[GRAPH_API] sendChatMessageToUser error:', error);
      return { success: false, error: error.message || error.toString() };
    }
  }
}

module.exports = GraphApiClient;
