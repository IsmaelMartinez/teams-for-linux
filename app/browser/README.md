# Browser

The files in here handle the code that talks with the browser page.

The [index.js](index.js) is the entry point.

The notifications folder contains the [activityManager.js](notifications/activityManager.js) listens for changes in the chatListService and bellNotificationsService to update the unread count.

The tools folder contains a lot of files that should be self descriptive.

The desktopShare folder contains the logic to add basic destop sharing capabilities to the app.

It also generates a new icon with the notifications count. This can be use later by the tray or app to modify the app icon.
