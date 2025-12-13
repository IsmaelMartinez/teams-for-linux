/**
 * Register IPC handlers for Graph API operations
 * @param {Electron.IpcMain} ipcMain - IPC main module
 * @param {GraphApiClient|null} graphApiClient - Graph API client instance
 */
export function registerGraphApiHandlers(ipcMain, graphApiClient) {
	// Get user profile from Microsoft Graph API
	ipcMain.handle("graph-api-get-user-profile", async () => {
		if (!graphApiClient) {
			console.debug("[GRAPH_API] Client not available for getUserProfile");
			return null;
		}
		try {
			return await graphApiClient.getUserProfile();
		} catch (error) {
			console.error("[GRAPH_API] Error getting user profile:", error);
			return null;
		}
	});

	// Get calendar events from Microsoft Graph API
	ipcMain.handle("graph-api-get-calendar-events", async (_event, options) => {
		if (!graphApiClient) {
			console.debug("[GRAPH_API] Client not available for getCalendarEvents");
			return [];
		}
		try {
			return await graphApiClient.getCalendarEvents(options);
		} catch (error) {
			console.error("[GRAPH_API] Error getting calendar events:", error);
			return [];
		}
	});

	// Get calendar view (events in date range) from Microsoft Graph API
	ipcMain.handle("graph-api-get-calendar-view", async (_event, start, end, options) => {
		if (!graphApiClient) {
			console.debug("[GRAPH_API] Client not available for getCalendarView");
			return [];
		}
		try {
			return await graphApiClient.getCalendarView(start, end, options);
		} catch (error) {
			console.error("[GRAPH_API] Error getting calendar view:", error);
			return [];
		}
	});

	// Create calendar event via Microsoft Graph API
	ipcMain.handle("graph-api-create-calendar-event", async (_event, eventData) => {
		if (!graphApiClient) {
			console.debug("[GRAPH_API] Client not available for createCalendarEvent");
			return null;
		}
		try {
			return await graphApiClient.createCalendarEvent(eventData);
		} catch (error) {
			console.error("[GRAPH_API] Error creating calendar event:", error);
			return null;
		}
	});

	// Get mail messages from Microsoft Graph API
	ipcMain.handle("graph-api-get-mail-messages", async (_event, options) => {
		if (!graphApiClient) {
			console.debug("[GRAPH_API] Client not available for getMailMessages");
			return [];
		}
		try {
			return await graphApiClient.getMailMessages(options);
		} catch (error) {
			console.error("[GRAPH_API] Error getting mail messages:", error);
			return [];
		}
	});
}
