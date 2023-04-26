const { app, Menu, MenuItem, powerMonitor, clipboard } = require('electron');
const application = require('./application');
const preferences = require('./preferences');
const help = require('./help');
const Tray = require('./tray');
const { LucidLog } = require('lucid-log');
const { SpellCheckProvider } = require('../spellCheckProvider');
const checkConnectivity = require('./connectivity');

class Menus {
	constructor(window, config, iconPath) {
		this.window = window;
		this.iconPath = iconPath;
		this.config = config;
		this.allowQuit = false;
		this.logger = new LucidLog({
			levels: config.appLogLevels.split(',')
		});
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
		this.spellCheckProvider = new SpellCheckProvider(this.window, this.logger);
	}

	initializeEventHandlers() {
		app.on('before-quit', () => this.onBeforeQuit());
		this.window.on('close', (event) => this.onClose(event));
		this.window.webContents.on('context-menu', assignContextMenuHandler(this));
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
		self.logger.debug('Waiting for network');
		const isConnected = await checkConnectivity(2000, 30);
		if (isConnected) {
			self.logger.debug('Reloading the page on system resume');
			self.reload(false);
		} else {
			self.logger.error('No internet connection');
		}
	};
}

/**
 * @param {Menus} menus 
 */
function assignContextMenuHandler(menus) {
	return (event, params) => {
		const menu = new Menu();

		// Add each spelling suggestion
		assignReplaceWordHandler(params, menu, menus);

		// Allow users to add the misspelled word to the dictionary
		assignAddToDictionaryHandler(params, menu, menus);

		if (menu.items.length > 0) {
			menu.popup();
		}
	};
}

/**
 * @param {object} params 
 * @param {Electron.Menu} menu 
 * @param {Menus} menus 
 */
function assignReplaceWordHandler(params, menu, menus) {
	for (const suggestion of params.dictionarySuggestions) {
		menu.append(new MenuItem({
			label: suggestion,
			click: () => menus.window.webContents.replaceMisspelling(suggestion)
		}));
	}
}

/**
 * @param {object} params 
 * @param {Electron.Menu} menu 
 * @param {Menus} menus 
 */
function assignAddToDictionaryHandler(params, menu, menus) {
	if (params.misspelledWord) {
		menu.append(
			new MenuItem({
				label: 'Add to dictionary',
				click: () => menus.window.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
			})
		);

		menu.append(
			new MenuItem({
				type: 'separator'
			})
		);
	}

	addTextEditMenuItems(params, menu, menus);
}

/**
 * @param {Electron.Menu} menu 
 * @param {Menus} menus 
 */
function addTextEditMenuItems(params, menu, menus) {
	if (params.isEditable) {
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

		addSpellCheckMenuItems(menu, menus);
	} else if (params.linkURL !== '') {
		menu.append(
			new MenuItem({
				label: 'Copy',
				click: () => clipboard.writeText(params.linkURL)
			})
		);
	}
}

/**
 * @param {Electron.Menu} menu 
 * @param {Menus} menus 
 */
function addSpellCheckMenuItems(menu, menus) {
	menu.append(
		new MenuItem({
			type: 'separator'
		})
	);

	menu.append(
		new MenuItem({
			label: 'Writing Languages',
			submenu: createSpellCheckLanguagesMenu(menus)
		})
	);
}

/**
 * @param {Menus} menus 
 */
function createSpellCheckLanguagesMenu(menus) {
	const activeLanguages = menus.window.webContents.session.getSpellCheckerLanguages();
	const splChkMenu = new Menu();
	for (const language of menus.spellCheckProvider.supportedList) {
		splChkMenu.append(
			createLanguageMenuItem(language, activeLanguages, menus)
		);
	}
	return splChkMenu;
}

/**
 * @param {{language:string,code:string}} language 
 * @param {Array<string>} activeLanguages 
 * @param {Menus} menus 
 * @returns 
 */
function createLanguageMenuItem(language, activeLanguages, menus) {
	return new MenuItem({
		label: language.language,
		type: 'checkbox',
		id: language.code,
		checked: activeLanguages.some(c => language.code === c),
		click: (menuItem) => chooseLanguage(menuItem, menus)
	});
}

/**
 * @param {MenuItem} item 
 * @param {Menus} menus 
 */
function chooseLanguage(item, menus) {
	const activeLanguages = menus.window.webContents.session.getSpellCheckerLanguages();
	if (item.checked) {
		addToList(activeLanguages, item.id);
	} else {
		removeFromList(activeLanguages, item.id);
	}
	menus.spellCheckProvider.setLanguages(activeLanguages);
}

/**
 * @param {Array<string>} list 
 * @param {string} item 
 */
function removeFromList(list, item) {
	const itemIndex = list.findIndex(l => l == item);
	if (itemIndex >= 0) {
		list.splice(itemIndex, 1);
	}

	return list;
}

/**
 * @param {Array<string>} list 
 * @param {string} item 
 */
function addToList(list, item) {
	const itemIndex = list.findIndex(l => l == item);
	if (itemIndex < 0) {
		list.push(item);
	}

	return list;
}

exports = module.exports = Menus;
