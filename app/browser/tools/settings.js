const ReactHandler = require("./reactHandler");

let _Settings_config = new WeakMap();
let _Settings_ipcRenderer = new WeakMap();
class Settings {
  init(config, ipcRenderer) {
    _Settings_config.set(this, config);
    _Settings_ipcRenderer.set(this, ipcRenderer);
    this.ipcRenderer.on("get-teams-settings", retrieve);
    this.ipcRenderer.on("set-teams-settings", restore);
  }

  get config() {
    return _Settings_config.get(this);
  }

  get ipcRenderer() {
    return _Settings_ipcRenderer.get(this);
  }
}

function validateSettingsInput(settings) {
  if (!settings || typeof settings !== 'object') {
    return false;
  }
  
  // Validate theme input
  if (settings.theme && !['default', 'dark', 'light'].includes(settings.theme)) {
    console.warn('Settings: Invalid theme value:', settings.theme);
    return false;
  }
  
  // Validate chatDensity input
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
    
    // Validate that clientPreferences has expected structure
    if (!clientPreferences.theme || !clientPreferences.density) {
      console.error("Settings: Invalid client preferences structure");
      return;
    }

    const settings = {
      theme: clientPreferences.theme.userTheme,
      chatDensity: clientPreferences.density.chatDensity,
    };
    
    // Validate extracted settings before sending
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
    // Validate input arguments
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
    
    // Validate that clientPreferences has expected structure
    if (!clientPreferences.theme || !clientPreferences.density) {
      console.error("Settings: Invalid client preferences structure for restore");
      return;
    }

    // Only set validated values
    if (args[0].theme) {
      clientPreferences.theme.userTheme = args[0].theme;
    }
    if (args[0].chatDensity) {
      clientPreferences.density.chatDensity = args[0].chatDensity;
    }
    
    event.sender.send("set-teams-settings", true);
  } catch (error) {
    console.error("Settings: Error restoring settings:", error);
    event.sender.send("set-teams-settings", false);
  }
}

module.exports = new Settings();
