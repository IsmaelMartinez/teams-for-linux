/**
 * This code comes from the electron-spell-check-provider README.md. Refer to it for further details.
 * 
 * I have remove most of the comments and extend it to detect the app locale. 
 */
const { remote, webFrame } = require('electron');
const SpellCheckProvider = require('electron-spell-check-provider');
const buildEditorContextMenu = remote.require('electron-editor-context-menu');
const appLocale = remote.app.getLocale();
let selection;

function resetSelection() {
  selection = {
    isMisspelled: false,
    spellingSuggestions: []
  };
}

function updateSelectionWithSuggestions(suggestions) {
  if (window.getSelection().toString()) {
    selection.isMisspelled = true;
    selection.spellingSuggestions = suggestions.slice(0, 5);
  }
}

spellCheckProviderCallback = new SpellCheckProvider(appLocale).on('misspelling', updateSelectionWithSuggestions);

window.addEventListener('mousedown', resetSelection);
 
webFrame.setSpellCheckProvider(appLocale, true, spellCheckProviderCallback);

window.addEventListener('contextmenu', (e) => {
  if (!e.target.closest('textarea, input, [contenteditable="true"]')) return; 
  setTimeout(() => {
    var menu = buildEditorContextMenu(selection);
    menu.popup(remote.getCurrentWindow());
  }, 30);
});

resetSelection();