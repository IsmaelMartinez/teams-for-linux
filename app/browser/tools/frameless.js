/**
 * Add custom tweaks for frameless window.
 *
 * In frameless mode the top bar is draggable and acts as the window title bar. This
 * means that all the clickable elements, like the navigation buttons, waffle menu and search box
 * need to be clickable (not draggable). This function adds CSS rules to make those elements
 * non-draggable.
 *
 * As of now the top bar is already draggable by default in Teams CSS. The settings and account buttons
 * are already non-draggable by default. The navigation buttons are configured as non-draggable in their
 * respective module. This function only needs to make the search box and waffle menu non-draggable.
 */
function init(config, ipcRenderer) {
	if (!config.frame) {
		const style = document.createElement('style');
		style.id = 'frameless-tweaks';
		style.textContent = `
            #ms-searchux-search-box-2-0,
            button[data-tid="waffle-open-button"],
            .tfl-nav-button {
              -webkit-app-region: no-drag;
            }
        `;
		document.head.appendChild(style);
	}
}

module.exports = { init };
