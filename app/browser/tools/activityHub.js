const ReactHandler = require("./reactHandler");
const eventHandlers = [];
// Supported events
const supportedEvents = [
  "incoming-call-created",
  "incoming-call-ended",
  "call-connected",
  "call-disconnected",
  "meeting-started",
  "meeting-joined",
  "meeting-left",
  "meeting-invitation",
  "chat-message",
  "screen-sharing-started",
];

class ActivityHub {
  on(event, handler) {
    return addEventHandler(event, handler);
  }

  off(event, handle) {
    return removeEventHandler(event, handle);
  }

  start() {
    const setup = setInterval(() => {
      const commandChangeReportingService =
        ReactHandler.getCommandChangeReportingService();
      if (commandChangeReportingService) {
        assignEventHandlers(commandChangeReportingService);

        // Enable debug logging
        ReactHandler.debugAllEvents();

        console.debug("Events connected with debug logging enabled");
        clearInterval(setup);
      }
    }, 10000);
  }

  setMachineState(state) {
    const teams2IdleTracker = ReactHandler.getTeams2IdleTracker();
    if (teams2IdleTracker) {
      try {
        console.debug(`setMachineState teams2 state=${state}`);
        if (state === 1) {
          teams2IdleTracker.handleMonitoredWindowEvent();
        } else {
          teams2IdleTracker.transitionToIdle();
        }
      } catch (e) {
        console.error("Failed to set teams2 Machine State", e);
      }
    }
  }

  setUserStatus(status) {
    const teams2IdleTracker = ReactHandler.getTeams2IdleTracker();
    if (teams2IdleTracker) {
      try {
        console.debug(`setUserStatus teams2 status=${status}`);
        if (status === 1) {
          teams2IdleTracker.handleMonitoredWindowEvent();
        } else {
          teams2IdleTracker.transitionToIdle();
        }
      } catch (e) {
        console.error("Failed to set teams2 User Status", e);
      }
    }
  }

  refreshAppState(controller, state) {
    const self = controller.appStateService;
    controller.appStateService.refreshAppState.apply(self, [
      () => {
        self.inactiveStartTime = null;
        self.setMachineState(state);
        self.setActive(
          state == 1 && (self.current == 4 || self.current == 5)
            ? 3
            : self.current
        );
      },
      "",
      null,
      null,
    ]);
  }
}

function isSupportedEvent(event) {
  return supportedEvents.some((e) => {
    return e === event;
  });
}

function isFunction(func) {
  return typeof func === "function";
}

function getHandleIndex(event, handle) {
  return eventHandlers.findIndex((h) => {
    return h.event === event && h.handle === handle;
  });
}

function addEventHandler(event, handler) {
  let handle;
  if (isSupportedEvent(event) && isFunction(handler)) {
    handle = crypto.randomUUID();
    eventHandlers.push({
      event: event,
      handle: handle,
      handler: handler,
    });
  }
  return handle;
}

function removeEventHandler(event, handle) {
  const handlerIndex = getHandleIndex(event, handle);
  if (handlerIndex > -1) {
    eventHandlers[handlerIndex].handler = null;
    eventHandlers.splice(handlerIndex, 1);
    return handle;
  }

  return null;
}

function getEventHandlers(event) {
  return eventHandlers.filter((e) => {
    return e.event === event;
  });
}

function assignEventHandlers(commandChangeReportingService) {
  commandChangeReportingService.observeChanges().subscribe((e) => {
    // Expanded event handling to capture more Teams events including meetings and chats
    if (
      [
        "CommandStart",
        "ScenarioMarked",
        "Rendered",
        "ChunkLoadStarted",
        "ChunkLoadSucceeded",
      ].indexOf(e.type) < 0
    ) {
      return;
    }

    // Expanded target filtering to capture more event sources
    const validTargets = [
      "internal-command-handler",
      "use-command-reporting-callbacks",
      "internal-command-handler-execute-before-command-handled-hook",
    ];

    if (e.context.target && validTargets.indexOf(e.context.target) < 0) {
      return;
    }

    // Handle different event structures
    if (e.context.entityCommand) {
      handleCallEventEntityCommand(e.context.entityCommand);
    } else if (e.context.step) {
      handleCallEventStep(e.context.step);
    }

    // Handle meeting and chat events based on improved patterns
    handleMeetingChatEvents(e);
  });
}

function handleCallEventEntityCommand(entityCommand) {
  if (entityCommand.entityOptions?.isIncomingCall) {
    console.debug("IncomingCall", entityCommand);
    if (
      "incoming_call" === entityCommand.entityOptions?.crossClientScenarioName
    ) {
      console.debug("Call is incoming");
      // Gets triggered by incoming call.
      onIncomingCallCreated({
        caller: entityCommand.entityOptions.title,
        image: entityCommand.entityOptions.mainImage?.src,
        text: entityCommand.entityOptions.text,
      });
    } else {
      console.debug("Reacted to incoming call");
      // Gets triggered when incoming call toast gets dismissed regardless of accepting or declining the call
      onIncomingCallEnded();
    }
  }
}

function handleCallEventStep(step) {
  switch (step) {
    case "calling-screen-rendered":
      // Gets triggered when call is connected.
      onCallConnected();
      break;
    case "render_disconected":
      // Gets triggered when call is disconnected.
      onCallDisconnected();
      break;
    default:
      break;
  }
}

function handleMeetingChatEvents(event) {
  console.debug(
    "handleMeetingChatEvents called with event:",
    event.type,
    event.context?.entityCommand?.entity?.type
  );

  const step = event.context?.step;
  const crossClientScenario =
    event.context?.entityCommand?.entityOptions?.crossClientScenarioName;
  const entityType = event.context?.entityCommand?.entity?.type;
  const entityAction = event.context?.entityCommand?.entity?.action;
  const scenarioName = event.context?.scenarioName;
  const title = event.context?.entityCommand?.entityOptions?.title;
  const text = event.context?.entityCommand?.entityOptions?.text;
  const mainImage = event.context?.entityCommand?.entityOptions?.mainImage;
  const toastType = event.context?.entityCommand?.entityOptions?.toastType;
  const visibilityState =
    event.context?.entityCommand?.command?.visibilityState;

  // Log any event that might be a notification we're missing
  if (
    title ||
    text ||
    toastType ||
    entityType === "toasts" ||
    entityType === "bannerNotification" ||
    entityAction === "create" ||
    entityAction === "view" ||
    visibilityState === "show"
  ) {
    console.debug("Potential notification event:", {
      type: event.type,
      entityType,
      entityAction,
      visibilityState,
      title,
      text,
      toastType,
      scenarioName,
      crossClientScenario,
    });
  }

  // Toast/Notification detection (Viva Insights, Teams notifications, etc.)
  if (
    entityType === "toasts" &&
    entityAction === "view" &&
    visibilityState === "show"
  ) {
    console.debug("Toast notification detected:", { title, text, toastType });
    onChatMessage({
      title: title || "New Notification",
      text: text || "You have a new notification",
      image: mainImage?.src,
      type: toastType || "notification",
    });
    return; // Early return to avoid duplicate processing
  }

  // Banner notification detection
  if (entityType === "bannerNotification") {
    console.debug("Banner notification detected:", {
      entityAction,
      visibilityState,
      title,
      text,
      id: event.context?.entityCommand?.entity?.id,
    });

    // Only trigger notifications for creation/show events, not deletion/hide events
    if (
      entityAction === "create" ||
      (entityAction === "view" && visibilityState === "show")
    ) {
      console.debug("Triggering notification for banner creation/show");
      onChatMessage({
        title: title || "Teams Notification",
        text: text || "You have a new notification",
        image: mainImage?.src,
        type: "banner-notification",
      });
    } else {
      console.debug("Skipping notification for banner deletion/hide event");
    }
    return; // Early return to avoid duplicate processing
  }

  // Meeting start/join detection
  if (
    step === "render_calling_screen" ||
    step === "calling-screen-rendered" ||
    (entityType === "calls" && entityAction === "create")
  ) {
    onMeetingStarted({
      title: title || "Meeting Started",
      text: text || "You have joined a meeting",
      image: mainImage?.src,
    });
  }

  // Meeting invitation detection
  if (
    crossClientScenario === "meeting_invitation" ||
    (entityType === "shareMeetingInfo" && entityAction === "view")
  ) {
    onMeetingInvitation({
      title: title || "Meeting Invitation",
      text: text || "You have a meeting invitation",
      image: mainImage?.src,
    });
  }

  // Screen sharing detection
  if (
    step === "render_screen_share" ||
    scenarioName?.includes("screen_share")
  ) {
    onScreenSharingStarted({
      title: "Screen Sharing Started",
      text: "Screen sharing is now active",
    });
  }

  // Chat message detection (based on common patterns)
  if (
    step?.includes("message") ||
    scenarioName?.includes("chat") ||
    entityType === "chat" ||
    crossClientScenario?.includes("message")
  ) {
    onChatMessage({
      title: title || "New Message",
      text: text || "You have a new message",
      image: mainImage?.src,
    });
  }

  // Meeting end detection
  if (
    step === "render_disconected" ||
    step === "render_call_end_screen" ||
    step === "pause_ongoing_calling_scenarios"
  ) {
    onMeetingLeft({
      title: "Meeting Ended",
      text: "You have left the meeting",
    });
  }
}

async function onIncomingCallCreated(data) {
  const handlers = getEventHandlers("incoming-call-created");
  for (const handler of handlers) {
    handler.handler(data);
  }
}

async function onIncomingCallEnded() {
  const handlers = getEventHandlers("incoming-call-ended");
  for (const handler of handlers) {
    handler.handler({});
  }
}

async function onCallConnected() {
  const handlers = getEventHandlers("call-connected");
  for (const handler of handlers) {
    handler.handler({});
  }
}

async function onCallDisconnected() {
  const handlers = getEventHandlers("call-disconnected");
  for (const handler of handlers) {
    handler.handler({});
  }
}

async function onMeetingStarted(data) {
  const handlers = getEventHandlers("meeting-started");
  for (const handler of handlers) {
    handler.handler(data);
  }
}

async function onMeetingLeft(data) {
  const handlers = getEventHandlers("meeting-left");
  for (const handler of handlers) {
    handler.handler(data);
  }
}

async function onMeetingInvitation(data) {
  const handlers = getEventHandlers("meeting-invitation");
  for (const handler of handlers) {
    handler.handler(data);
  }
}

async function onChatMessage(data) {
  const handlers = getEventHandlers("chat-message");
  for (const handler of handlers) {
    handler.handler(data);
  }
}

async function onScreenSharingStarted(data) {
  const handlers = getEventHandlers("screen-sharing-started");
  for (const handler of handlers) {
    handler.handler(data);
  }
}

const activityHub = new ActivityHub();
module.exports = activityHub;
