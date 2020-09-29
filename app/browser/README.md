# Browser

The files in here handle the code that talks with the browser  page.

The [index.js](index.js) is the entry point.

The [onlineOfflineListener.js](onlineOfflineListener.js) adds listeners to the online/offline events and emit an 'online-status-changed' to the ipc when it receives a online/offline event.

The [zoom.js](zoom.js) inject the keyboard shortcuts for zoom in the browser.

The [rightClickMenuWithSpellcheck.js](rightClickMenuWithSpellcheck.js) handles the spellchecker and right menu click funcionality. We are leveraging the spellchecker capabilitites to [electron-spell-check-provider](https://www.npmjs.com/package/electron-spell-check-provider) and the right click menu to the  [electron-editor-context-menu](https://github.com/mixmaxhq/electron-editor-context-menu) modules.

The notifications folder contains:

*    [pageTitleNotifications.js](notifications/pageTitleNotifications.js) file handles the emitting of an event when the page-title changes and indicates that there is an unread message.
*    [activityManager.js](notifications/activityManager.js) listens for changes in the chatListService and bellNotificationsService to update the unread count.
*    [trayIconRenderer.js](notifications/trayIconRenderer.js) renders a new icon with the number of unread messages.

The desktopShare folder contains the logic to add basic destop sharing capabilities to the app.

It also generates a new icon with the notifications count. This can be use later by the tray or app to modify the app icon.
