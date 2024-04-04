const ReactHandler = require('./reactHandler');

class ThemeManager {
    /**
     * @param {object} config
     * @param {Electron.IpcRenderer} ipcRenderer
     */
    init(config, ipcRenderer) {
        this.ipcRenderer = ipcRenderer;
        this.config = config;
        ReactHandler.getTeams2ClientPreferences().followOsTheme = config.followSystemTheme;
        if (config.followSystemTheme) {
            console.log('followSystemTheme', config.followSystemTheme);
            this.ipcRenderer.on('system-theme-changed', this.applyTheme);   
        }
    }

    applyTheme = async (event, ...args) => {
        const theme = args[0] ? 'dark' : 'default';
        const clientPreferences = ReactHandler.getTeams2ClientPreferences();
        clientPreferences.useTheme = theme;
        console.log('Theme changed to', theme);
    }
}

module.exports = new ThemeManager();
