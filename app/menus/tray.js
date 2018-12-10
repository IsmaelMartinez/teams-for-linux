const { Tray, Menu, ipcMain, nativeImage } = require('electron');

class ApplicationTray {
	constructor(window, appMenu, iconPath) {
		this.window = window;
		this.iconPath = iconPath;
		this.appMenu = appMenu;
		this.addTray();
	}

	addTray() {
		this.tray = new Tray(this.iconPath);
		this.tray.setToolTip('Microsoft Teams');
		this.tray.on('click', () => {
			if (this.window.isFocused()) {
				this.window.hide();
			} else {
				this.window.show();
				this.window.focus();
			}
		});
		this.tray.setContextMenu(Menu.buildFromTemplate(this.appMenu));

		ipcMain.on('notifications', (event, {count, icon}) => {
			this.tray.setImage(nativeImage.createFromDataURL(icon));
			this.window.flashFrame(count > 0);
		});
	}
}
exports = module.exports = ApplicationTray;