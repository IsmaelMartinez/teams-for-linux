const instance = require('./instance');

class ThemeManager {
    /**
     * @param {object} config
     * @param {Electron.IpcRenderer} ipcRenderer
     */
    init(config, ipcRenderer) {
        this.ipcRenderer = ipcRenderer;
        this.config = config;
        if (config.followSystemTheme) {
            this.ipcRenderer.on('system-theme-changed', this.applyTheme);
        }
    }

    applyTheme = async (event, ...args) => {
        const theme = args[0] ? 'dark' : 'default';
        const inst = await instance.whenReady().catch(() => {
            console.error('Failed to apply Theme');
        });
        inst.controller.layoutService.setTheme(theme);
    }
}

module.exports = new ThemeManager();
