// app/security/webviewGuard.js

/**
 * Refuse every `<webview>` attach, app-wide.
 *
 * Nothing in the app or in Teams web uses `<webview>`, and a guest can ask
 * for its own preload with `webpreferences="sandbox=no"`, which runs that file
 * with full Node.js (GHSA-6xpg-fhf9-chcr). The windows already set
 * `webviewTag: false`; this guard covers any webContents created later,
 * including ones whose webPreferences we do not control.
 *
 * @param {import("electron").App} app
 * @param {{ warn: Function }} [logger] - defaults to console
 */
function installWebviewGuard(app, logger = console) {
  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-attach-webview", (attachEvent) => {
      attachEvent.preventDefault();
      logger.warn("[SECURITY] Blocked a <webview> attach");
    });
  });
}

module.exports = { installWebviewGuard };
