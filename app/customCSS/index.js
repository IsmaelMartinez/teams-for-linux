const fs = require('fs');
const path = require('path');

exports.onDidFinishLoad = function onDidFinishLoad(content) {
	applyCustomCSSStyleIfPresent(content);
	content.insertCSS('#download-mobile-app-button, #download-app-button, #get-app-button { display:none; }');
	content.insertCSS('.zoetrope { animation-iteration-count: 1 !important; }');
}

function applyCustomCSSStyleIfPresent(content) {
	if (config.customCSSName) {
		applyCustomCSSFromLocation(content, path.join(__dirname, 'assets', 'css', config.customCSSName + '.css'));
	} else if (config.customCSSLocation) {
		applyCustomCSSFromLocation(content, config.customCSSLocation);
	}
}

function applyCustomCSSFromLocation(content, cssLocation) {
	fs.readFile(cssLocation, 'utf-8', (error, data) => {
		if (!error) {
			content.insertCSS(data);
		}
	});
}
