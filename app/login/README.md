# Login

This code handles the login dialog that appears when the app can login using ntlm.

[index.js](index.js) is the entry point that creates an electron browser window with the [login.html](login.html) content. The login.html is a simple html form that sends the username/password to the electron app using the formSender function.

The username/password aren't cached and the browserWindow gets remove once the form is submit.
