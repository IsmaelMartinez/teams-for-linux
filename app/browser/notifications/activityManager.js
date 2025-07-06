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

  self.ipcRenderer.on("incoming-call-action", (event, action) => {
    console.debug("ActionHTML", document.body.innerHTML);
    const actionWrapper = document.querySelector(
      '[data-testid="calling-actions"],[data-testid="msn-actions"]'
    );
    if (actionWrapper) {
      const buttons = actionWrapper.querySelectorAll("button");
      if (buttons.length > 0) {
        switch (action) {
          case "ACCEPT_AUDIO":
            if (buttons.length == 3) {
              buttons[1].click();
            }
            break;

          case "ACCEPT_VIDEO":
            buttons[0].click();
            break;

          case "DECLINE":
            buttons[buttons.length - 1].click();
            break;

          default:
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
  activityHub.on("meeting-started", meetingStartedHandler(self));
  activityHub.on("meeting-joined", meetingJoinedHandler(self));
  activityHub.on("meeting-left", meetingLeftHandler(self));
  activityHub.on("meeting-invitation", meetingInvitationHandler(self));
  activityHub.on("chat-message", chatMessageHandler(self));
  activityHub.on("screen-sharing-started", screenSharingStartedHandler(self));
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

function meetingStartedHandler(self) {
  return async (data) => {
    console.debug("Meeting started:", data);
    // Trigger notification for meeting start
    if (window.Notification && !self.config.disableNotifications) {
      const notification = new window.Notification(
        data.title || "Meeting Started",
        {
          body: data.text || "You have joined a meeting",
          icon: data.image,
          type: "meeting-started",
        }
      );
      notification.onclick = () => {
        console.debug("Meeting notification clicked");
      };
    }
    self.ipcRenderer.invoke("meeting-started", data);
  };
}

function meetingJoinedHandler(self) {
  return async (data) => {
    console.debug("Meeting joined:", data);
    if (window.Notification && !self.config.disableNotifications) {
      const notification = new window.Notification(
        data.title || "Meeting Joined",
        {
          body: data.text || "You have joined a meeting",
          icon: data.image,
          type: "meeting-joined",
        }
      );
      notification.onclick = () => {
        console.debug("Meeting joined notification clicked");
      };
    }
    self.ipcRenderer.invoke("meeting-joined", data);
  };
}

function meetingLeftHandler(self) {
  return async (data) => {
    console.debug("Meeting left:", data);
    if (window.Notification && !self.config.disableNotifications) {
      const notification = new window.Notification(
        data.title || "Meeting Ended",
        {
          body: data.text || "You have left the meeting",
          icon: data.image,
          type: "meeting-left",
        }
      );
      notification.onclick = () => {
        console.debug("Meeting ended notification clicked");
      };
    }
    self.ipcRenderer.invoke("meeting-left", data);
  };
}

function meetingInvitationHandler(self) {
  return async (data) => {
    console.debug("Meeting invitation:", data);
    if (window.Notification && !self.config.disableNotifications) {
      const notification = new window.Notification(
        data.title || "Meeting Invitation",
        {
          body: data.text || "You have a meeting invitation",
          icon: data.image,
          type: "meeting-invitation",
        }
      );
      notification.onclick = () => {
        console.debug("Meeting invitation notification clicked");
      };
    }
    self.ipcRenderer.invoke("meeting-invitation", data);
  };
}

function chatMessageHandler(self) {
  return async (data) => {
    console.debug("Chat message/notification:", data);
    if (window.Notification && !self.config.disableNotifications) {
      // Determine notification type based on data
      const notificationType =
        data.type === "msGraph" ? "viva-insights" : data.type || "new-message";

      const notification = new window.Notification(
        data.title || "New Message",
        {
          body: data.text || "You have a new message",
          icon: data.image,
          type: notificationType,
        }
      );
      notification.onclick = () => {
        console.debug("Chat/notification clicked");
      };
    }
    self.ipcRenderer.invoke("chat-message", data);
  };
}

function screenSharingStartedHandler(self) {
  return async (data) => {
    console.debug("Screen sharing started:", data);
    if (window.Notification && !self.config.disableNotifications) {
      const notification = new window.Notification(
        data.title || "Screen Sharing Started",
        {
          body: data.text || "Screen sharing is now active",
          icon: data.image,
          type: "screen-sharing-started",
        }
      );
      notification.onclick = () => {
        console.debug("Screen sharing notification clicked");
      };
    }
    self.ipcRenderer.invoke("screen-sharing-started", data);
  };
}

module.exports = exports = ActivityManager;
