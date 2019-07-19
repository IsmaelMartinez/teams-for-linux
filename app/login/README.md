# Login

This code handles the login dialog that appears when the app can login using ntlm.

[index.js](index.js) is the entry point that creates an electron browser window with the [login.html](login.html) content.

The [formSender.js](formSender.js) is the minimum js code that is needed to send the code username/password to the electron app in order to callback with the values.

The username/password aren't cached and the browserWindow gets remove once the form is submit.
