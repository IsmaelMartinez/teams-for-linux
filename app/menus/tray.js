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
		this.tray.on('click', () => this.showAndFocusWindow());
		this.tray.setContextMenu(Menu.buildFromTemplate(this.appMenu));

		ipcMain.on('tray-update', (event, {icon, flash}) => this.updateTrayImage(icon, flash));
	}

	showAndFocusWindow() {
		this.window.show();
		this.window.focus();
	}

	updateTrayImage(iconUrl, flash) {
		const image = nativeImage.createFromDataURL(iconUrl);

		this.tray.setImage(image);
		this.window.flashFrame(flash);
	}
}
exports = module.exports = ApplicationTray;