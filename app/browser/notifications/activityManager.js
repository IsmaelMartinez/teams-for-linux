"use strict";

const activityHub = require("../tools/activityHub");
const wakeLock = require("../tools/wakeLock");

class ActivityManager {
  // Private and passed to the handlers below as an argument: anything on
  // `this` is reachable from page script (GHSA-58j7-22f8-6xqp).
  #ipcRenderer;

  constructor(ipcRenderer, config) {
    this.#ipcRenderer = ipcRenderer;
    this.config = config;
    this.myStatus = -1;
  }

  start() {
    setActivityHandlers(this.#ipcRenderer);
    setEventHandlers(this.#ipcRenderer);
    activityHub.start();
    this.watchSystemIdleState();
  }

  watchSystemIdleState() {
    this.#ipcRenderer.invoke("get-system-idle-state").then((state) => {
      let timeOut;
      if (this.config.awayOnSystemIdle) {
        timeOut = this.setStatusAwayWhenScreenLocked(state);
      } else {
        timeOut = this.keepStatusAvailableWhenScreenLocked(state);
      }
      setTimeout(() => this.watchSystemIdleState(), timeOut);
    });
  }

  setStatusAwayWhenScreenLocked(state) {
    activityHub.setMachineState(state.system === "active" ? 1 : 2);
    const timeOut =
      (state.system === "active"
        ? this.config.appIdleTimeoutCheckInterval
        : this.config.appActiveCheckInterval) * 1000;

    if (state.system === "active" && state.userIdle === 1) {
      activityHub.setUserStatus(1);
    } else if (state.system !== "active" && state.userCurrent === 1) {
      activityHub.setUserStatus(3);
    }
    return timeOut;
  }

  keepStatusAvailableWhenScreenLocked(state) {
    if (state.system === "active" || state.system === "locked") {
      activityHub.setMachineState(1);
      return this.config.appIdleTimeoutCheckInterval * 1000;
    }
    activityHub.setMachineState(2);
    return this.config.appActiveCheckInterval * 1000;
  }
}

function setEventHandlers(ipcRenderer) {
  ipcRenderer.on("enable-wakelock", () => wakeLock.enable());
  ipcRenderer.on("disable-wakelock", () => wakeLock.disable());

  ipcRenderer.on('incoming-call-action', (event, action) => {
    const actionWrapper = document.querySelector('[data-testid="calling-actions"],[data-testid="msn-actions"]');
    if (actionWrapper) {
      const buttons = actionWrapper.querySelectorAll("button");
      if (buttons.length > 0) {
        switch (action) {
          case 'ACCEPT_AUDIO':
            if (buttons.length === 3) {
              buttons[1].click();
            }
            break;

          case 'ACCEPT_VIDEO':
            buttons[0].click();
            break;

          case 'DECLINE':
            buttons[buttons.length - 1].click();
            break;

          default:
            break;
        }
      }
    }
  });
}

function setActivityHandlers(ipcRenderer) {
  activityHub.on("incoming-call-created", incomingCallCreatedHandler(ipcRenderer));
  activityHub.on("incoming-call-ended", incomingCallEndedHandler(ipcRenderer));
  activityHub.on("call-connected", callConnectedHandler(ipcRenderer));
  activityHub.on("call-disconnected", callDisconnectedHandler(ipcRenderer));
}

function incomingCallCreatedHandler(ipcRenderer) {
  return async (data) => {
    ipcRenderer.invoke("incoming-call-created", data);
  };
}

function incomingCallEndedHandler(ipcRenderer) {
  return async () => {
    ipcRenderer.invoke("incoming-call-ended");
  };
}

function callConnectedHandler(ipcRenderer) {
  return async () => {
    ipcRenderer.invoke("call-connected");
  };
}

function callDisconnectedHandler(ipcRenderer) {
  return async () => {
    ipcRenderer.invoke("call-disconnected");
  };
}

module.exports = exports = ActivityManager;
