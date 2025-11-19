// Microsoft Graph API IPC Handlers
// Extracted module following #1959 architecture modernization pattern

const logger = require('electron-log');

/**
 * Register all Graph API IPC handlers
 * @param {object} ipcMain - Electron ipcMain module
 * @param {object} graphApiClient - GraphApiClient instance (can be null if disabled)
 */
function registerGraphApiHandlers(ipcMain, graphApiClient) {
  const handlers = {
    "graph-api-get-user-profile": (client) => client.getUserProfile(),
    "graph-api-get-calendar-events": (client, options) => client.getCalendarEvents(options),
    "graph-api-get-calendar-view": (client, startDateTime, endDateTime, options) =>
      client.getCalendarView(startDateTime, endDateTime, options),
    "graph-api-create-calendar-event": (client, event) => client.createCalendarEvent(event),
    "graph-api-get-mail-messages": (client, options) => client.getMailMessages(options),
    "graph-api-get-presence": (client) => client.getPresence(),
    "graph-api-get-diagnostics": (client) => client.getDiagnostics(),
  };

  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, async (_event, ...args) => {
      if (!graphApiClient) {
        return { success: false, error: "Graph API not enabled" };
      }
      return await handler(graphApiClient, ...args);
    });
  }

  logger.debug('[GRAPH_API] IPC handlers registered', {
    channels: Object.keys(handlers).length,
    enabled: !!graphApiClient
  });
}

module.exports = { registerGraphApiHandlers };
