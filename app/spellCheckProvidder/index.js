const codes = require('./codes');
// eslint-disable-next-line no-unused-vars
const { LucidLog } = require('lucid-log');

let _SpellCheckProvider_supportedList = new WeakMap();
let _SpellCheckProvider_logger = new WeakMap();
let _SpellCheckProvider_window = new WeakMap();
class SpellCheckProvider {
	/**
	 * @param {Electron.BrowserWindow} window 
	 * @param {LucidLog} logger;
	 */
	constructor(window, logger) {
		_SpellCheckProvider_logger.set(this, logger);
		_SpellCheckProvider_window.set(this, window);
		init(this, window);
	}

	/**
	 * @type {Array<{language:string,code:string}>}
	 */
	get supportedList() {
		return _SpellCheckProvider_supportedList.get(this);
	}

	/**
	 * @type {Electron.BrowserWindow}
	 */
	get window() {
		return _SpellCheckProvider_window.get(this);
	}

	/**
	 * @type {LucidLog}
	 */
	get logger() {
		return _SpellCheckProvider_logger.get(this);
	}

	isLanguageSupported(code) {
		return this.supportedList.some(i => {
			return i.code === code;
		});
	}

	/**
	 * @param {Array<string>} codes 
	 * @returns {Array<string>}
	 */
	setLanguages(codes) {
		const setlanguages = [];
		for (const c of codes) {
			if (!this.isLanguageSupported(c)) {
				this.logger.warn(`Unsupported language code '${c}' for spellchecker`);
			} else {
				setlanguages.push(c);
			}
		}
		this.window.webContents.session.setSpellCheckerLanguages(setlanguages);
		if (setlanguages.length > 0) {
			this.logger.debug(`Language codes ${setlanguages.join(',')} set for spellchecker`);
		}

		return setlanguages;
	}

	setSystemLanguages() {
		//this.window.webContents.spl
	}
}


/**
 * @param {SpellCheckProvider} intance
 * @param {Electron.BrowserWindow} window 
 */
function init(intance, window) {
	const listFromElectron = window.webContents.session.availableSpellCheckerLanguages;
	_SpellCheckProvider_supportedList.set(intance, codes.filter(lf => {
		return listContains(listFromElectron, lf.code);
	}));
}

/**
 * 
 * @param {Array<string>} list 
 * @param {string} text 
 */
function listContains(list, text) {
	return list.some(l => {
		return l === text;
	});
}

module.exports = { SpellCheckProvider };