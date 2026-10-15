# Control service

`teamsControlService.js` provides transport-neutral, named Teams actions and the selected-profile state snapshot to optional adapters. It owns the fixed shortcut mappings and incoming-call action dispatch boundary; arbitrary shortcut input and Graph/calendar access are not part of this service.

The service is created and started by the application only on Linux when D-Bus control is enabled. It observes state when supplied, and `dispose()` detaches that listener during shutdown. MQTT command handling remains independent and unchanged. Without an enabled adapter, this module is not started.
