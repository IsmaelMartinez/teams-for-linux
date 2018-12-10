The files in here handle the code that talks with the browser  page.

The [index.js](index.js) is the entry point it load the [zoom.js](zoom.js) and the [pageTitleNotifications.js](pageTitleNotifications.js) files.

The [zoom.js](zoom.js) inject the keyboard shortcuts for zoom in the browser.

The [pageTitleNotifications.js](pageTitleNotifications.js) file handles the emitting of an event when the page-title changes and indicates that there is an unread message.

It also generates a new icon with the notifications count. This can be use later by the tray or app to modify the app icon.