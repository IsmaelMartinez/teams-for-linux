# Browser

The files in here handle the code that talks with the browser  page.

The [index.js](index.js) is the entry point.

The [onlineOfflineListener.js](tools/onlineOfflineListener.js) adds listeners to the online/offline events and emit an 'online-status-changed' to the ipc when it receives a online/offline event.

The [zoom.js](tools/zoom.js) inject the keyboard shortcuts for zoom in the browser.

The notifications folder contains:

*    [activityManager.js](notifications/activityManager.js) listens for changes in the chatListService and bellNotificationsService to update the unread count.
*    [trayIconRenderer.js](tools/trayIconRenderer.js) renders a new icon with the number of unread messages.

The desktopShare folder contains the logic to add basic destop sharing capabilities to the app.

It also generates a new icon with the notifications count. This can be use later by the tray or app to modify the app icon.
