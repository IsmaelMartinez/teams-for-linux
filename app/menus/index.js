const { app, Menu } = require('electron');
const application = require('./application');
const preferences = require('./preferences');
const help = require('./help');
const Tray = require('./tray');
let shouldQuit = false;

class Menus {
	constructor(window, config, iconPath) {
		this.window = window;
		this.iconPath = iconPath;
		this.config = config;
		this.initialize();
	}

	quit() {
		shouldQuit = true;
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

		this.window.on('close', (event) => {
			if (!shouldQuit && !this.config.closeAppOnCross) {
				event.preventDefault();
				this.hide();
			} else {
				app.quit();
			}
		});

		new Tray(this.window, appMenu.submenu, this.iconPath);
	}
}

exports = module.exports = Menus;
