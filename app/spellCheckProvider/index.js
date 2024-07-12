const codes = require('./codes');

let _SpellCheckProvider_supportedList = new WeakMap();
let _SpellCheckProvider_window = new WeakMap();
class SpellCheckProvider {
	constructor(window) {
		_SpellCheckProvider_window.set(this, window);
		init(this, window);
	}
	
	get supportedList() {
		return _SpellCheckProvider_supportedList.get(this);
	}

	get supportedListByGroup() {
		let groupedList = [];
		for (const language of this.supportedList) {
			addLanguageToGroup(groupedList, language.language.substring(0, 1), language);
		}
		return groupedList;
	}

	get window() {
		return _SpellCheckProvider_window.get(this);
	}

	isLanguageSupported(code) {
		return this.supportedList.some(i => {
			return i.code === code;
		});
	}

	setLanguages(codes) {
		const setlanguages = [];
		for (const c of codes) {
			if (!this.isLanguageSupported(c)) {
				console.warn(`Unsupported language code '${c}' for spellchecker`);
			} else {
				setlanguages.push(c);
			}
		}
		this.window.webContents.session.setSpellCheckerLanguages(setlanguages);
		if (setlanguages.length > 0) {
			console.debug(`Language codes ${setlanguages.join(',')} set for spellchecker`);
		} else {
			console.debug('Spellchecker is disabled!');
		}

		return setlanguages;
	}
}

function init(intance, window) {
	const listFromElectron = window.webContents.session.availableSpellCheckerLanguages;
	let list = codes.filter(lf => {
		return listContains(listFromElectron, lf.code);
	});
	sortLanguages(list);
	_SpellCheckProvider_supportedList.set(intance, list);
}

function listContains(list, text) {
	return list.some(l => {
		return l === text;
	});
}

function addLanguageToGroup(groupedList, key, language) {
	const group = groupedList.filter(f => f.key === key)[0];
	if (group) {
		group.list.push(language);
	} else {
		groupedList.push({
			key: key,
			list: [language]
		});
	}
}

function sortLanguages(languages) {
	languages.sort((a, b) => {
		return stringCompare(a.language.toLocaleLowerCase(), b.language.toLocaleLowerCase());
	});
}

function stringCompare(str1, str2) {
	const le = str1 < str2;
	const gr = str1 > str2;
	return le ? -1 : gr ? 1 : 0;
}

module.exports = { SpellCheckProvider };
