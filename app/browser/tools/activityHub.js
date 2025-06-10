const ReactHandler = require("./reactHandler");
const eventHandlers = [];
// Supported events
const supportedEvents = [
  "incoming-call-created",
  "incoming-call-ended",
  "call-connected",
  "call-disconnected"
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
      const commandChangeReportingService = ReactHandler.getCommandChangeReportingService();
      if (commandChangeReportingService) {
        assignEventHandlers(commandChangeReportingService);
        console.debug("Events connected");
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
            : self.current,
        );
      },
      "",
      null,
      null,
    ]);
  }
}

function isSupportedEvent(event) {
  return supportedEvents.some(e => {
    return e === event;
  });
}

function isFunction(func) {
  return typeof (func) === 'function';
}

function getHandleIndex(event, handle) {
  return eventHandlers.findIndex(h => {
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
      handler: handler
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
  return eventHandlers.filter(e => {
    return e.event === event;
  });
}

function assignEventHandlers(commandChangeReportingService) {
  commandChangeReportingService.observeChanges().subscribe((e) => {
    // Only Handle events that are from type ["CommandStart", "ScenarioMarked"]
    // and have a context target of ["internal-command-handler", "use-command-reporting-callbacks"]
    if (["CommandStart", "ScenarioMarked"].indexOf(e.type) < 0 ||
      ["internal-command-handler", "use-command-reporting-callbacks"].indexOf(e.context.target) < 0) {
      return;
    }
    if (e.context.entityCommand) {
      handleCallEventEntityCommand(e.context.entityCommand);
    } else {
      handleCallEventStep(e.context.step);
    }
  });
}

function handleCallEventEntityCommand(entityCommand) {
  if (entityCommand.entityOptions?.isIncomingCall) {
    console.debug("IncomingCall", entityCommand);
    if ("incoming_call" === entityCommand.entityOptions?.crossClientScenarioName) {
      console.debug("Call is incoming");
      // Gets triggered by incoming call.
      onIncomingCallCreated({
        caller: entityCommand.entityOptions.title,
        image: entityCommand.entityOptions.mainImage?.src,
        text: entityCommand.entityOptions.text
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

async function onIncomingCallCreated(data) {
  const handlers = getEventHandlers('incoming-call-created');
  for (const handler of handlers) {
    handler.handler(data);
  }
}

async function onIncomingCallEnded() {
  const handlers = getEventHandlers('incoming-call-ended');
  for (const handler of handlers) {
    handler.handler({});
  }
}

async function onCallConnected() {
  const handlers = getEventHandlers('call-connected');
  for (const handler of handlers) {
    handler.handler({});
  }
}

async function onCallDisconnected() {
  const handlers = getEventHandlers('call-disconnected');
  for (const handler of handlers) {
    handler.handler({});
  }
}

const activityHub = new ActivityHub();
module.exports = activityHub;
