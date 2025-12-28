const ReactHandler = require("./reactHandler");
const eventHandlers = [];
// Supported events
const supportedEvents = new Set([
  "incoming-call-created",
  "incoming-call-ended",
  "call-connected",
  "call-disconnected"
]);

class ActivityHub {

  on(event, handler) {
    return addEventHandler(event, handler);
  }

  off(event, handle) {
    return removeEventHandler(event, handle);
  }

  start() {
    let attemptCount = 0;
    const maxAttempts = 12; // Try for up to 2 minutes
    
    const setup = setInterval(() => {
      attemptCount++;
      
      // Enhanced logging for tray icon timing issue (#1795)
      console.debug(`ActivityHub: Connection attempt ${attemptCount}/${maxAttempts}`);
      
      const commandChangeReportingService = ReactHandler.getCommandChangeReportingService();
      if (commandChangeReportingService) {
        assignEventHandlers(commandChangeReportingService);
        console.debug("ActivityHub: Events connected successfully", {
          attempt: attemptCount,
          timeElapsed: attemptCount * 10000
        });
        clearInterval(setup);
        
        // Start periodic authentication state logging for #1357 
        this._startAuthenticationMonitoring();
      } else {
        // Log more details about why connection failed
        console.debug(`ActivityHub: Connection attempt ${attemptCount} failed - ReactHandler validation unsuccessful`);
        
        if (attemptCount >= maxAttempts) {
          console.warn('ActivityHub: Maximum connection attempts reached. Teams internal events may not be available.', {
            attempts: attemptCount,
            timeElapsed: attemptCount * 10000,
            note: 'Tray notifications via title mutation should still work'
          });
          clearInterval(setup);
          
          // Still start authentication monitoring even if React connection failed
          this._startAuthenticationMonitoring();
        }
      }
    }, 10000);
  }

  // Monitor authentication state and initialize token cache for #1357
  _startAuthenticationMonitoring() {
    // Log authentication state immediately (this will trigger token cache injection if needed)
    ReactHandler.logAuthenticationState();
    
    // Give Teams a moment to fully initialize, then try manual injection if auto-injection failed
    setTimeout(() => {
      const status = ReactHandler.getTokenCacheStatus();
      if (!status.injected && status.canRetry) {
        console.debug("[TOKEN_CACHE] Auto-injection may have failed, attempting manual injection");
        ReactHandler.injectTokenCache();
      }
    }, 15000); // 15 seconds after initial monitoring starts
    
    // Then log every 5 minutes to track token lifecycle and cache health
    this._authMonitorInterval = setInterval(() => {
      ReactHandler.logAuthenticationState();
      
      // Periodically check token cache status
      const status = ReactHandler.getTokenCacheStatus();
      if (!status.injected && status.canRetry) {
        console.debug("[TOKEN_CACHE] Periodic check: Token cache not injected, retrying");
        ReactHandler.injectTokenCache();
      }
    }, 5 * 60 * 1000); // 5 minutes
    
    console.debug("[AUTH_DIAG] Authentication monitoring started - logging every 5 minutes with token cache management");
  }

  stop() {
    if (this._authMonitorInterval) {
      clearInterval(this._authMonitorInterval);
      this._authMonitorInterval = null;
      console.debug("[AUTH_DIAG] Authentication monitoring stopped");
    }
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
  return supportedEvents.has(event);
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
    if (!["CommandStart", "ScenarioMarked"].includes(e.type) ||
      !["internal-command-handler", "use-command-reporting-callbacks"].includes(e.context.target)) {
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
