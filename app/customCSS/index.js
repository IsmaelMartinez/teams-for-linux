const fs = require('fs');
const path = require('path');

exports.onDidFinishLoad = function onDidFinishLoad(content, config) {
	const customCssLocation = getCustomCssLocation(config);
	if (customCssLocation) {
		applyCustomCSSToContent(content, customCssLocation)
	}
	content.insertCSS('#download-mobile-app-button, #download-app-button, #get-app-button { display:none; }');
	content.insertCSS('.zoetrope { animation-iteration-count: 1 !important; }');
};

exports.onDidFrameFinishLoad = function onDidFrameFinishLoad(webFrame, config) {
	const customCssLocation = getCustomCssLocation(config);
	if (customCssLocation) {
		applyCustomCSSToFrame(webFrame, customCssLocation);
	}
}

function getCustomCssLocation(config) {
	if (config.customCSSName) {
		return path.join(__dirname, "assets", "css", config.customCSSName + ".css");
	} else if (config.customCSSLocation) {
		return config.customCSSLocation;
	}
	return null;
}

function applyCustomCSSToContent(content, cssLocation) {
	fs.readFile(cssLocation, 'utf-8', (error, data) => {
		if (!error) {
			content.insertCSS(data);
		}
	});
}

// Teams V2 use iframe for the main view. The content.insertCSS
// does not work for that for some reason, so here, we listen for
// on-did-frame-finish-load events, and inject additional <style>
// element into them using JavaScript.
function applyCustomCSSToFrame(webFrame, cssLocation) {
	const customCssId = "tfl-custom-css-style";

	fs.readFile(cssLocation, 'utf-8', (error, data) => {
		if (error) {
			return;
		}

		data = data.replace(/`/g, "\\u0060")

		webFrame.executeJavaScript(`
			if(!document.getElementById("${customCssId}")) {
				var style = document.createElement('style');
				style.id = "${customCssId}";
				style.type = "text/css";
				style.innerHTML = \u0060${data}\u0060;
				document.head.appendChild(style);
			}
		`);
	})
}