# Menus

This folder handles the menus (tray and main menu).

To access the main menu, press the 'Alt' key while the application is selected.

[index.js](index.js) is the entry point. That loads the different files in this folder that define each menu and submenu items.

*    Application: The [application.js](application.js) file contains the submenu for the application tab. This submenu definition is also in use for the tray menu.
*    Help: The help menu is defined in the [help.js](help.js) file.
*    Preferences: The preferences submenu gets defined in the [preferences.js](preferences.js) file.
*    Tray: [tray.js](tray.js) contains the tray menu and its implementation.
