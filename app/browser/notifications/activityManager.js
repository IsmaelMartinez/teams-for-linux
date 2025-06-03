const activityHub = require("../tools/activityHub");
const wakeLock = require("../tools/wakeLock");

class ActivityManager {
  constructor(ipcRenderer, config) {
    this.ipcRenderer = ipcRenderer;
    this.config = config;
    this.myStatus = -1;
  }

  start() {
    setActivityHandlers(this);
    setEventHandlers(this);
    activityHub.start();
    this.watchSystemIdleState();
  }

  watchSystemIdleState() {
    const self = this;
    self.ipcRenderer.invoke("get-system-idle-state").then((state) => {
      let timeOut;
      if (this.config.awayOnSystemIdle) {
        timeOut = this.setStatusAwayWhenScreenLocked(state);
      } else {
        timeOut = this.keepStatusAvailableWhenScreenLocked(state);
      }
      setTimeout(() => self.watchSystemIdleState(), timeOut);
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

function setEventHandlers(self) {
  self.ipcRenderer.on("enable-wakelock", () => wakeLock.enable());
  self.ipcRenderer.on("disable-wakelock", () => wakeLock.disable());

  self.ipcRenderer.on('incoming-call-action', (event, action) => {
    console.log("ActionHTML", document.body.innerHTML);
    const actionWrapper = document.querySelector('[data-testid="calling-actions"],[data-testid="msn-actions"]');
    if (actionWrapper) {
      const buttons = actionWrapper.querySelectorAll("button");
      if (buttons.length > 0) {
        switch (action) {
          case 'ACCEPT_AUDIO':
            if (buttons.length == 3) {
              buttons[1].click();
            }

          case 'ACCEPT_VIDEO':
            buttons[0].click();
            break;

          case 'DECLINE':
          default:
            buttons[buttons.length - 1].click();
            break;
        }
      }
    }
  });
}

function setActivityHandlers(self) {
  activityHub.on("incoming-call-created", incomingCallCreatedHandler(self));
  activityHub.on("incoming-call-ended", incomingCallEndedHandler(self));
  activityHub.on("call-connected", callConnectedHandler(self));
  activityHub.on("call-disconnected", callDisconnectedHandler(self));
}

function incomingCallCreatedHandler(self) {
  return async (data) => {
    self.ipcRenderer.invoke("incoming-call-created", data);
  };
}

function incomingCallEndedHandler(self) {
  return async () => {
    self.ipcRenderer.invoke("incoming-call-ended");
  };
}

function callConnectedHandler(self) {
  return async () => {
    self.ipcRenderer.invoke("call-connected");
  };
}

function callDisconnectedHandler(self) {
  return async () => {
    self.ipcRenderer.invoke("call-disconnected");
  };
}

module.exports = exports = ActivityManager;
