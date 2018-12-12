const {SpellCheckHandler, ContextMenuListener, ContextMenuBuilder} = require('electron-spellchecker');

window.spellCheckHandler = new SpellCheckHandler();
window.spellCheckHandler.attachToInput();

window.spellCheckHandler.switchLanguage('en-UK');

let contextMenuBuilder = new ContextMenuBuilder(window.spellCheckHandler);
new ContextMenuListener((info) => {
	contextMenuBuilder.showPopupMenu(info);
});