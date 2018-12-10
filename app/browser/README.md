The files in here handle the code that talks with the browser  page.

The [index.js](index.js) is the entry point.

The main 2 things that this handles is injecting the zoom events [zoom.js](zoom.js).

The [tray-notifications.js](tray-notifications.js) file handles the emitting of an event when the page-title changes and indicates that there is an unread message.

This file also handles the generation of the tray messages, I assume the reason of its name, but probably will benefit from moving some of the functionality to another file.