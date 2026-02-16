// Microsoft Graph API IPC Handlers

const logger = require('electron-log');

/**
 * Register all Graph API IPC handlers
 * @param {object} ipcMain - Electron ipcMain module
 * @param {object} graphApiClient - GraphApiClient instance (can be null if disabled)
 */
function registerGraphApiHandlers(ipcMain, graphApiClient) {
  const notEnabled = { success: false, error: 'Graph API not enabled' };

  // Get current user profile from Microsoft Graph API
  ipcMain.handle('graph-api-get-user-profile', async () => {
    if (!graphApiClient) return notEnabled;
    try {
      return await graphApiClient.getUserProfile();
    } catch (error) {
      logger.error('[GRAPH_API] getUserProfile failed:', { message: error.message });
      return { success: false, error: error.message };
    }
  });

  // Get calendar events with optional OData query options
  ipcMain.handle('graph-api-get-calendar-events', async (_event, options) => {
    if (!graphApiClient) return notEnabled;
    try {
      return await graphApiClient.getCalendarEvents(options);
    } catch (error) {
      logger.error('[GRAPH_API] getCalendarEvents failed:', { message: error.message });
      return { success: false, error: error.message };
    }
  });

  // Get calendar view for a specific time range
  ipcMain.handle('graph-api-get-calendar-view', async (_event, startDateTime, endDateTime, options) => {
    if (!graphApiClient) return notEnabled;
    try {
      return await graphApiClient.getCalendarView(startDateTime, endDateTime, options);
    } catch (error) {
      logger.error('[GRAPH_API] getCalendarView failed:', { message: error.message });
      return { success: false, error: error.message };
    }
  });

  // Create a new calendar event
  ipcMain.handle('graph-api-create-calendar-event', async (_event, event) => {
    if (!graphApiClient) return notEnabled;
    try {
      return await graphApiClient.createCalendarEvent(event);
    } catch (error) {
      logger.error('[GRAPH_API] createCalendarEvent failed:', { message: error.message });
      return { success: false, error: error.message };
    }
  });

  // Get mail messages with optional OData query options
  ipcMain.handle('graph-api-get-mail-messages', async (_event, options) => {
    if (!graphApiClient) return notEnabled;
    try {
      return await graphApiClient.getMailMessages(options);
    } catch (error) {
      logger.error('[GRAPH_API] getMailMessages failed:', { message: error.message });
      return { success: false, error: error.message };
    }
  });

  // Search people using People API (for Quick Chat feature)
  ipcMain.handle('graph-api-search-people', async (_event, query, options) => {
    if (!graphApiClient) return notEnabled;
    try {
      return await graphApiClient.searchPeople(query, options);
    } catch (error) {
      logger.error('[GRAPH_API] searchPeople failed:', { message: error.message });
      return { success: false, error: error.message };
    }
  });

  // Send a chat message to a user via Graph API
  ipcMain.handle('graph-api-send-chat-message', async (_event, contactInfo, content) => {
    if (!graphApiClient) return notEnabled;
    if (!contactInfo || typeof contactInfo.userId !== 'string' || !contactInfo.userId.trim()) {
      return { success: false, error: 'Invalid contact info: userId required' };
    }
    if (typeof content !== 'string' || !content.trim()) {
      return { success: false, error: 'Message content cannot be empty' };
    }
    try {
      return await graphApiClient.sendChatMessageToUser(contactInfo, content.trim());
    } catch (error) {
      logger.error('[GRAPH_API] sendChatMessage failed:', { message: error.message });
      return { success: false, error: error.message };
    }
  });

  logger.debug('[GRAPH_API] IPC handlers registered', {
    channels: 7,
    enabled: !!graphApiClient
  });
}

module.exports = { registerGraphApiHandlers };
