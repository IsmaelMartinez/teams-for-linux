const { app, ipcMain, BrowserWindow } = require("electron");
const { execSync } = require("node:child_process");
const path = require("node:path");

let isFirstLoginTry = true;

exports.loginService = function loginService(parentWindow, callback) {
  let win = new BrowserWindow({
    width: 363,
    height: 124,
    modal: true,
    frame: false,
    parent: parentWindow,

    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });
  win.once("ready-to-show", () => {
    win.show();
  });

  // Handle form submission for SSO/authentication workflows
  ipcMain.on("submitForm", submitFormHandler(callback, win));

  win.on("closed", () => {
    win = null;
  });

  win.loadURL(`file://${__dirname}/login.html`);
};

exports.handleLoginDialogTry = function handleLoginDialogTry(
  window,
  ssoBasicAuthUser,
  ssoBasicAuthPasswordCommand,
) {
  window.webContents.on("login", (event, _request, _authInfo, callback) => {
    event.preventDefault();
    if (isFirstLoginTry) {
      isFirstLoginTry = false;
      if (ssoBasicAuthUser && ssoBasicAuthPasswordCommand) {
        console.debug('[SSO] Retrieving password using configured command');
        try {
          // Command comes from user's own config file - shell features (pipes, expansion) are expected
          const ssoPassword = execSync(ssoBasicAuthPasswordCommand).toString();
          callback(ssoBasicAuthUser, ssoPassword);
        } catch (error) {
          console.error(
            `[SSO] Failed to execute password command. Status Code: ${error.status}`,
          );
        }
      } else {
        console.debug("Using dialogue window.");
        this.loginService(window, callback);
      }
    } else {
      // if fails to authenticate we need to relanch the app as we have close the login browser window.
      isFirstLoginTry = true;
      app.relaunch();
      app.exit(0);
    }
  });
};

function submitFormHandler(callback, win) {
  return (_event, data) => {
    callback(data.username, data.password);
    win.close();
  };
}
