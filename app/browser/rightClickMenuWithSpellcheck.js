/**
 * Base from
 * https://github.com/mixmaxhq/electron-spell-check-provider/issues/18
 */

const { clipboard, remote, webFrame } = require('electron');
const buildEditorContextMenu = remote.require('electron-editor-context-menu');
const spellchecker = require('spellchecker');
const appLocale = remote.app.getLocale().replace('-', '_');

var EN_VARIANT = /^en/;

// Prevent the spellchecker from showing contractions as errors.
var ENGLISH_SKIP_WORDS = [
	'ain',
	'couldn',
	'didn',
	'doesn',
	'hadn',
	'hasn',
	'mightn',
	'mustn',
	'needn',
	'oughtn',
	'shan',
	'shouldn',
	'wasn',
	'weren',
	'wouldn'
];

function setupLinux(locale) {
	if (process.env.HUNSPELL_DICTIONARIES || locale !== 'en_US') {
		// apt-get install hunspell-<locale> can be run for easy access to other dictionaries
		var location = process.env.HUNSPELL_DICTIONARIES || '/usr/share/hunspell';
		spellchecker.setDictionary(locale, location);
	}
}

// The LANG environment variable is how node spellchecker finds its default language:
//   https://github.com/atom/node-spellchecker/blob/59d2d5eee5785c4b34e9669cd5d987181d17c098/lib/spellchecker.js#L29
if (!process.env.LANG) {
	process.env.LANG = appLocale;
}

setupLinux(appLocale);

var simpleChecker = window.spellChecker = {
	spellCheck: function (text) {
		return !this.isMisspelled(text);
	},
	isMisspelled: function (text) {
		var misspelled = spellchecker.isMisspelled(text);

		// The idea is to make this as fast as possible. For the many, many calls which
		//   don't result in the red squiggly, we minimize the number of checks.
		if (!misspelled) {
			return false;
		}

		// Only if we think we've found an error do we check the locale and skip list.
		if (appLocale.match(EN_VARIANT) && ENGLISH_SKIP_WORDS.includes(text)) {
			return false;
		}

		return true;
	},
	getSuggestions: function (text) {
		return spellchecker.getCorrectionsForMisspelling(text);
	},
	add: function (text) {
		spellchecker.add(text);
	}
};

webFrame.setSpellCheckProvider(
	appLocale,
	true,
	simpleChecker
);


window.addEventListener('contextmenu', (e) => {
	// Only show the context menu in text editors.
	let isEditable = e.target.closest('textarea, input, [contenteditable="true"]');
	let selection = {};
	let template = {};
	if (isEditable) {
		var selectedText = window.getSelection().toString();
		var isMisspelled = selectedText && simpleChecker.isMisspelled(selectedText);
		var spellingSuggestions = isMisspelled && simpleChecker.getSuggestions(selectedText).slice(0, 5);
		selection = {
			isMisspelled: isMisspelled,
			spellingSuggestions: spellingSuggestions,
		};
	} else {
		template = [{
			label: 'Copy',
			role: 'copy'
		}, {
			label: 'Copy URL',
			click: () => {
				clipboard.writeText(e.target.href);
			},
			visible: (e.target.href ? true : false)
		}, {
			type: 'separator'
		}, {
			label: 'Select All',
			role: 'selectall'
		}];
	}
	let menu = buildEditorContextMenu(selection, template);

	// The 'contextmenu' event is emitted after 'selectionchange' has fired but possibly before the
	// visible selection has changed. Try to wait to show the menu until after that, otherwise the
	// visible selection will update after the menu dismisses and look weird.
	setTimeout(function () {
		menu.popup(remote.getCurrentWindow());
	}, 30);
});
