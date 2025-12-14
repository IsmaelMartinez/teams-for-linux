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
    return await graphApiClient.getUserProfile();
  });

  // Get calendar events with optional OData query options
  ipcMain.handle('graph-api-get-calendar-events', async (_event, options) => {
    if (!graphApiClient) return notEnabled;
    return await graphApiClient.getCalendarEvents(options);
  });

  // Get calendar view for a specific time range
  ipcMain.handle('graph-api-get-calendar-view', async (_event, startDateTime, endDateTime, options) => {
    if (!graphApiClient) return notEnabled;
    return await graphApiClient.getCalendarView(startDateTime, endDateTime, options);
  });

  // Create a new calendar event
  ipcMain.handle('graph-api-create-calendar-event', async (_event, event) => {
    if (!graphApiClient) return notEnabled;
    return await graphApiClient.createCalendarEvent(event);
  });

  // Get mail messages with optional OData query options
  ipcMain.handle('graph-api-get-mail-messages', async (_event, options) => {
    if (!graphApiClient) return notEnabled;
    return await graphApiClient.getMailMessages(options);
  });

  // Run chat API validation spikes (for development/testing)
  ipcMain.handle('run-chat-spikes', async () => {
    if (!graphApiClient) return notEnabled;
    return await graphApiClient.runChatSpikes();
  });

  logger.debug('[GRAPH_API] IPC handlers registered', {
    channels: 6,
    enabled: !!graphApiClient
  });
}

module.exports = { registerGraphApiHandlers };
