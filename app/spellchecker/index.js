const {SpellCheckHandler, ContextMenuListener, ContextMenuBuilder} = require('electron-spellchecker');

const spellCheckHandler = new SpellCheckHandler();

const contextMenuBuilder = new ContextMenuBuilder(spellCheckHandler);
new ContextMenuListener((info) => {
  contextMenuBuilder.showPopupMenu(info);
});

spellCheckHandler.init();