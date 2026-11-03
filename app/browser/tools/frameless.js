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
function init(config) {
	if (!config.frame) {
		const style = document.createElement('style');
		style.id = 'frameless-tweaks';
		style.textContent = `
            [data-tid="search-f6-navigation-region"],
            [role="search"],
            button[data-tid="waffle-open-button"],
            .tfl-nav-button {
              -webkit-app-region: no-drag;
            }
        `;
		document.head.appendChild(style);
		startWindowControls();
	}
}

// Minimize / maximize / close buttons at the right end of the Teams top bar,
// like the Windows client. Re-injected whenever Teams re-renders the bar.
const { ipcRenderer } = require('electron');
const CONTROLS_ID = 'tfl-window-controls';
const ICONS = {
	minimize: 'M4 10.5h12v1H4z',
	maximize: 'M5 5h10v10H5V5zm1 1v8h8V6H6z',
	restore: 'M7 5h8v8h-2v2H5V7h2V5zm1 2h5v5h1V6H8v1zm-2 1v6h6V8H6z',
	close: 'M5.35 4.65 10 9.29l4.65-4.64.7.7L10.71 10l4.64 4.65-.7.7L10 10.71l-4.65 4.64-.7-.7L9.29 10 4.65 5.35z',
};

function findTopBar() {
	const anchor = document.querySelector('[data-tid="search-f6-navigation-region"], [role="search"]');
	let el = anchor?.parentElement;
	while (el && el !== document.body) {
		const r = el.getBoundingClientRect();
		if (r.top <= 2 && r.width >= window.innerWidth * 0.9 && r.height > 0 && r.height < 80) return el;
		el = el.parentElement;
	}
	return null;
}

function makeButton(action, label) {
	const button = document.createElement('button');
	button.className = 'tfl-window-button tfl-window-' + action;
	button.title = label;
	button.setAttribute('aria-label', label);
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('width', '16');
	svg.setAttribute('height', '16');
	svg.setAttribute('viewBox', '0 0 20 20');
	svg.setAttribute('fill', 'currentColor');
	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	path.setAttribute('d', ICONS[action]);
	svg.appendChild(path);
	button.appendChild(svg);
	button.addEventListener('click', () => ipcRenderer.send('tfl-window-' + action));
	return button;
}

async function updateMaximizeIcon() {
	const path = document.querySelector('#' + CONTROLS_ID + ' .tfl-window-maximize path');
	if (!path) return;
	const maximized = await ipcRenderer.invoke('tfl-window-is-maximized');
	path.setAttribute('d', maximized ? ICONS.restore : ICONS.maximize);
}

function injectWindowControls() {
	if (document.getElementById(CONTROLS_ID)) return;
	const bar = findTopBar();
	if (!bar) return;
	const container = document.createElement('div');
	container.id = CONTROLS_ID;
	container.appendChild(makeButton('minimize', 'Minimize'));
	container.appendChild(makeButton('maximize', 'Maximize'));
	container.appendChild(makeButton('close', 'Close'));
	bar.appendChild(container);
	updateMaximizeIcon();
}

function startWindowControls() {
	const style = document.createElement('style');
	style.id = 'tfl-window-controls-style';
	style.textContent = `
		/* Reserve room for the controls so Teams shrinks the search box instead */
		[data-tid="title-bar"] {
			padding-right: 138px !important;
			box-sizing: border-box !important;
		}
		[data-tid="titlebar-start-slot"],
		[data-tid="titlebar-end-slot"] {
			width: auto !important;
			min-width: 0 !important;
			flex: 0 0 auto !important;
		}
		[data-tid="titlebar-end-slot"] { margin-left: auto !important; }
		[data-tid="search-f6-navigation-region"] {
			flex: 0 1 480px !important;
			min-width: 0 !important;
			margin: 0 auto !important;
		}
		[data-tid="titlebar-main-slot-main-window"] { width: 100% !important; min-width: 0 !important; }
		[data-tid="titlebar-main-slot-main-window"] > * {
			width: 100% !important;
			min-width: 0 !important;
			max-width: 100% !important;
		}
		/* Pinned to the window edge, so they stay visible below Teams' minimum layout width */
		#${CONTROLS_ID} {
			position: fixed;
			top: 0;
			right: 0;
			height: 48px;
			z-index: 1000;
			display: flex;
			align-items: stretch;
			-webkit-app-region: no-drag;
		}
		.tfl-window-button {
			width: 46px;
			border: none;
			background: transparent;
			color: var(--colorNeutralForeground1, currentColor);
			display: flex;
			align-items: center;
			justify-content: center;
			cursor: default;
			padding: 0;
		}
		.tfl-window-button:hover { background: rgba(127, 127, 127, 0.2); }
		.tfl-window-close:hover { background: #c42b1c; color: #fff; }
		.tfl-window-button svg { pointer-events: none; }
	`;
	document.head.appendChild(style);

	let scheduled = false;
	new MutationObserver(() => {
		if (scheduled || document.getElementById(CONTROLS_ID)) return;
		scheduled = true;
		setTimeout(() => { scheduled = false; injectWindowControls(); }, 250);
	}).observe(document.body || document.documentElement, { childList: true, subtree: true });
	window.addEventListener('resize', updateMaximizeIcon);
	injectWindowControls();
}

module.exports = { init };
