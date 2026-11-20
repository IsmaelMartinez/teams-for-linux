// Teams registers a `beforeunload` handler while a call is active. Electron
// treats that as "cancel the close" unless the app handles `will-prevent-unload`,
// so the tray Quit closed nothing and left the call window running. Once the
// user has asked to quit, let every page unload.
let quitting = false;

function markQuitting() {
  quitting = true;
}

function isQuitting() {
  return quitting;
}

function allowUnloadWhenQuitting(event) {
  if (quitting) event.preventDefault();
}

// Hooks every webContents, including call pop-outs and profile views.
function install(app) {
  app.on("before-quit", markQuitting);
  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-prevent-unload", allowUnloadWhenQuitting);
  });
}

module.exports = { install, markQuitting, isQuitting, allowUnloadWhenQuitting };
