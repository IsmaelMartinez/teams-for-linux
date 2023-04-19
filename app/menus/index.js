const { app, Menu, MenuItem, powerMonitor } = require('electron');
const application = require('./application');
const preferences = require('./preferences');
const help = require('./help');
const Tray = require('./tray');
const { LucidLog } = require('lucid-log');
let scLanguages;

class Menus {
	constructor(window, config, iconPath) {
		this.window = window;
		this.iconPath = iconPath;
		this.config = config;
		this.allowQuit = false;
		this.logger = new LucidLog({
			levels: config.appLogLevels.split(',')
		});
		scLanguages = config.spellCheckerLanguages;
		this.initialize();
	}

	quit() {
		this.allowQuit = true;
		this.window.close();
	}

	open() {
		if (!this.window.isVisible()) {
			this.window.show();
		}

		this.window.focus();
	}

	reload(show = true) {
		if (show) {
			this.window.show();
		}

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

		this.initializeEventHandlers();
		
		this.tray = new Tray(this.window, appMenu.submenu, this.iconPath);
	}

	initializeEventHandlers() {
		app.on('before-quit', () => this.onBeforeQuit());
		this.window.on('close', (event) => this.onClose(event));
		this.window.webContents.on('context-menu', assignContextMenuHandler(this.window));
		powerMonitor.on('resume', assignSystemResumeEventHandler(this));
	}

	onBeforeQuit() {
		this.logger.debug('before-quit');
		this.allowQuit = true;
	}

	onClose(event) {
		this.logger.debug('window close');
		if (!this.allowQuit && !this.config.closeAppOnCross) {
			event.preventDefault();
			this.hide();
		} else {
			this.tray.close();
			this.window.webContents.session.flushStorageData();
		}
	}
}

/**
 * @param {Menus} self 
 * @returns 
 */
function assignSystemResumeEventHandler(self) {
	return async () => {
		self.logger.debug('Reloading the page on system resume');
		self.reload(false);
	};
}

/**
 * @param {Electron.Event} event 
 * @param {Electron.ContextMenuParams} params 
 */
function assignContextMenuHandler(window) {
	return (event, params) => {
		const menu = new Menu();

		// Add each spelling suggestion
		assignReplaceWordHandler(params, menu, window);

		// Allow users to add the misspelled word to the dictionary
		assignAddToDictionaryHandler(params, menu, window);

		menu.popup();
	};
}

function assignReplaceWordHandler(params, menu, window) {
	for (const suggestion of params.dictionarySuggestions) {
		menu.append(new MenuItem({
			label: suggestion,
			click: () => window.webContents.replaceMisspelling(suggestion)
		}));
	}
}

function assignAddToDictionaryHandler(params, menu, window) {
	if (params.misspelledWord) {
		menu.append(
			new MenuItem({
				label: 'Add to dictionary',
				click: () => window.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
			})
		);

		menu.append(
			new MenuItem({
				type: 'separator'
			})
		);
	}

	addTextEditMenuItems(menu, window);
}

/**
 * @param {Electron.Menu} menu 
 * @param {Electron.BrowserWindow} window 
 */
function addTextEditMenuItems(menu, window) {
	menu.append(
		new MenuItem({
			role: 'cut'
		})
	);

	menu.append(
		new MenuItem({
			role: 'copy'
		})
	);

	menu.append(
		new MenuItem({
			role: 'paste'
		})
	);

	addSpellCheckMenuItems(menu, window);
}

/**
 * @param {Electron.Menu} menu 
 * @param {Electron.BrowserWindow} window 
 */
function addSpellCheckMenuItems(menu, window) {
	menu.append(
		new MenuItem({
			type: 'separator'
		})
	);

	menu.append(
		new MenuItem({
			label: 'Writing Language',
			submenu: createSpellCheckLanguagesMenu(window)
		})
	);
}

/**
 * @param {Electron.BrowserWindow} window 
 */
function createSpellCheckLanguagesMenu(window) {
	const curLanguages = window.webContents.session.getSpellCheckerLanguages();
	const sclMenu = new Menu();
	sclMenu.append(
		createAllLanguagesMenuItem(curLanguages, window)
	);

	for (const ln of scLanguages) {
		sclMenu.append(
			createLanguageMenuItem(ln, curLanguages, window)
		);
	}
	return sclMenu;
}

function createLanguageMenuItem(ln, curLanguages, window) {
	return new MenuItem({
		label: ln,
		type: 'radio',
		checked: curLanguages.length == 1 && curLanguages[0] == ln,
		click: () => {
			window.webContents.session.setSpellCheckerLanguages([ln]);
		}
	});
}

function createAllLanguagesMenuItem(curLanguages, window) {
	return new MenuItem({
		label: 'All',
		type: 'radio',
		checked: curLanguages.length > 1,
		click: () => {
			window.webContents.session.setSpellCheckerLanguages(scLanguages);
		}
	});
}

exports = module.exports = Menus;
