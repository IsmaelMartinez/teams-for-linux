const activityHub = require("../tools/activityHub");
const wakeLock = require("../tools/wakeLock");

class ActivityManager {
  constructor(ipcRenderer, config) {
    this.ipcRenderer = ipcRenderer;
    this.config = config;
    this.myStatus = -1;
  }

  start() {
    setEventHandlers(this);
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
}

module.exports = exports = ActivityManager;
