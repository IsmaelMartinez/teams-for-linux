import { LANGUAGE_LIST } from "./codes.js";

/**
 * SpellCheckProvider manages spell checking languages for the application.
 */
class SpellCheckProvider {
	/**
	 * @param {BrowserWindow} window - The browser window
	 */
	constructor(window) {
		this.window = window;
		this.supportedList = this.window.webContents.session.availableSpellCheckerLanguages;
		this.supportedListByGroup = this.groupLanguages();
	}

	/**
	 * Group languages by their primary language code
	 * @returns {Array} Grouped languages
	 */
	groupLanguages() {
		const groups = {};
		
		for (const code of this.supportedList) {
			const language = LANGUAGE_LIST[code] || code;
			const primaryCode = code.split("-")[0];
			
			if (!groups[primaryCode]) {
				groups[primaryCode] = {
					key: this.getLanguageGroupName(primaryCode),
					list: [],
				};
			}
			
			groups[primaryCode].list.push({
				code: code,
				language: language,
			});
		}

		return Object.values(groups).sort((a, b) => a.key.localeCompare(b.key));
	}

	/**
	 * Get the display name for a language group
	 * @param {string} code - Primary language code
	 * @returns {string} Language group name
	 */
	getLanguageGroupName(code) {
		const groupNames = {
			af: "Afrikaans",
			bg: "Bulgarian",
			ca: "Catalan",
			cs: "Czech",
			cy: "Welsh",
			da: "Danish",
			de: "German",
			el: "Greek",
			en: "English",
			es: "Spanish",
			et: "Estonian",
			fa: "Persian",
			fo: "Faroese",
			fr: "French",
			he: "Hebrew",
			hi: "Hindi",
			hr: "Croatian",
			hu: "Hungarian",
			hy: "Armenian",
			id: "Indonesian",
			it: "Italian",
			ko: "Korean",
			lt: "Lithuanian",
			lv: "Latvian",
			nb: "Norwegian Bokmål",
			nl: "Dutch",
			pl: "Polish",
			pt: "Portuguese",
			ro: "Romanian",
			ru: "Russian",
			sh: "Serbo-Croatian",
			sk: "Slovak",
			sl: "Slovenian",
			sq: "Albanian",
			sr: "Serbian",
			sv: "Swedish",
			ta: "Tamil",
			tg: "Tajik",
			tr: "Turkish",
			uk: "Ukrainian",
			vi: "Vietnamese",
		};

		return groupNames[code] || code.toUpperCase();
	}

	/**
	 * Set the spell checker languages
	 * @param {Array<string>} languages - Language codes to enable
	 * @returns {Array<string>} Actually enabled languages
	 */
	setLanguages(languages) {
		const validLanguages = languages.filter(lang => this.supportedList.includes(lang));
		
		try {
			this.window.webContents.session.setSpellCheckerLanguages(validLanguages);
			console.debug(`Spell checker languages set to: ${validLanguages.join(", ")}`);
			return validLanguages;
		} catch (error) {
			console.error("Error setting spell checker languages:", error);
			return [];
		}
	}

	/**
	 * Get currently active spell checker languages
	 * @returns {Array<string>} Active language codes
	 */
	getLanguages() {
		return this.window.webContents.session.getSpellCheckerLanguages();
	}
}

export { SpellCheckProvider };
