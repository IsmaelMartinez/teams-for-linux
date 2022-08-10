const { app, Menu } = require('electron');
const application = require('./application');
const preferences = require('./preferences');
const help = require('./help');
const Tray = require('./tray');
let shouldQuit = false;

function onBeforeQuit() {
	console.log('before-quit');
	shouldQuit = true;
}

class Menus {
	constructor(window, config, iconPath) {
		this.window = window;
		this.iconPath = iconPath;
		this.config = config;
		this.initialize();
	}

	quit() {
		app.quit();
	}

	open() {
		if (!this.window.isVisible()) {
			this.window.show();
		}

		this.window.focus();
	}

	reload() {
		this.window.show();
		this.window.reload();
	}

	debug() {
		this.window.openDevTools();
	}

	hide() {
		this.window.hide();
	}

	initialize() {
		const appMenu = application(this);

		this.window.setMenu(Menu.buildFromTemplate([
			appMenu,
			preferences(),
			help(app, this.window),
		]));

		app.on('before-quit', onBeforeQuit);

		this.window.on('close', (event) => {
			console.log('window close');
			if (!shouldQuit && !this.config.closeAppOnCross) {
				event.preventDefault();
				this.hide();
			} else {
				this.window.webContents.session.flushStorageData();
				app.quit();
			}
		});

		new Tray(this.window, appMenu.submenu, this.iconPath);
	}
}

exports = module.exports = Menus;
