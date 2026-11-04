"use strict";

const ReactHandler = require("./reactHandler");

// ipcRenderer is used in init only and never stored: page script can patch
// WeakMap.prototype.set and read anything on `this` (GHSA-58j7-22f8-6xqp).
class Settings {
  #config;

  init(config, ipcRenderer) {
    this.#config = config;
    ipcRenderer.on("get-teams-settings", retrieve);
    ipcRenderer.on("set-teams-settings", restore);
  }

  get config() {
    return this.#config;
  }
}

function validateSettingsInput(settings) {
  if (!settings || typeof settings !== 'object') {
    return false;
  }
  
  if (settings.theme && !['default', 'dark', 'light'].includes(settings.theme)) {
    console.warn('Settings: Invalid theme value:', settings.theme);
    return false;
  }

  if (settings.chatDensity && !['compact', 'comfy'].includes(settings.chatDensity)) {
    console.warn('Settings: Invalid chatDensity value:', settings.chatDensity);
    return false;
  }
  
  return true;
}

async function retrieve(event) {
  try {
    const clientPreferences = ReactHandler.getTeams2ClientPreferences();

    if (!clientPreferences) {
      console.error("Failed to retrieve Teams settings from react");
      return;
    }
    
    if (!clientPreferences.theme || !clientPreferences.density) {
      console.error("Settings: Invalid client preferences structure");
      return;
    }

    const settings = {
      theme: clientPreferences.theme.userTheme,
      chatDensity: clientPreferences.density.chatDensity,
    };
    
    if (validateSettingsInput(settings)) {
      event.sender.send("get-teams-settings", settings);
    } else {
      console.error("Settings: Retrieved invalid settings data");
    }
  } catch (error) {
    console.error("Settings: Error retrieving settings:", error);
  }
}

async function restore(event, ...args) {
  try {
    if (!args[0] || typeof args[0] !== 'object') {
      console.error("Settings: Invalid restore arguments");
      return;
    }
    
    if (!validateSettingsInput(args[0])) {
      console.error("Settings: Invalid settings values for restore");
      return;
    }
    
    const clientPreferences = ReactHandler.getTeams2ClientPreferences();

    if (!clientPreferences) {
      console.warn("Failed to retrieve Teams settings from react");
      return;
    }
    
    if (!clientPreferences.theme || !clientPreferences.density) {
      console.error("Settings: Invalid client preferences structure for restore");
      return;
    }

    // Only set validated values
    if ('theme' in args[0]) {
      clientPreferences.theme.userTheme = args[0].theme;
    }
    if ('chatDensity' in args[0]) {
      clientPreferences.density.chatDensity = args[0].chatDensity;
    }
    
    event.sender.send("set-teams-settings", true);
  } catch (error) {
    console.error("Settings: Error restoring settings:", error);
    event.sender.send("set-teams-settings", false);
  }
}

module.exports = new Settings();
