# D-Bus services

`controlService.js` adapts the optional control service to the user's Linux session bus: it owns the well-known name, exports the fixed control interface, publishes state snapshots/signals, and detaches listeners/releases resources on stop. It is enabled only on Linux when configured and is not a replacement for or dependency of MQTT. With D-Bus control disabled, this service is not started.
