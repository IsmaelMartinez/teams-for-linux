const fs = require("node:fs");
const path = require("node:path");

exports.onDidFinishLoad = function onDidFinishLoad(content, config) {
  const customCssLocation = getCustomCssLocation(config);
  if (customCssLocation) {
    applyCustomCSSToContent(content, customCssLocation);
  }
  content.insertCSS(
    "#download-mobile-app-button, #download-app-button, #get-app-button { display:none; }"
  );
  content.insertCSS(".zoetrope { animation-iteration-count: 1 !important; }");
};

exports.onDidFrameFinishLoad = function onDidFrameFinishLoad(webFrame, config) {
  const customCssLocation = getCustomCssLocation(config);
  if (customCssLocation) {
    applyCustomCSSToFrame(webFrame, customCssLocation);
  }
};

function getCustomCssLocation(config) {
  if (config.customCSSName) {
    return path.join(__dirname, "assets", "css", config.customCSSName + ".css");
  } else if (config.customCSSLocation) {
    return config.customCSSLocation;
  }
  return null;
}

function applyCustomCSSToContent(content, cssLocation) {
  fs.readFile(cssLocation, "utf-8", (error, data) => {
    if (!error) {
      content.insertCSS(data);
    }
  });
}

/**
 * Applies custom CSS to iframe-based content for Teams V2.
 * Teams V2 uses iframes for the main view where content.insertCSS() doesn't work,
 * so we inject <style> elements directly into the DOM using JavaScript execution.
 * This is a workaround for iframe CSS isolation in Electron.
 *
 * @param {Electron.WebFrameMain} webFrame - The iframe's web frame
 * @param {string} cssLocation - Path to the CSS file to inject
 */
function applyCustomCSSToFrame(webFrame, cssLocation) {
  const customCssId = "tfl-custom-css-style";

  fs.readFile(cssLocation, "utf-8", (error, data) => {
    if (error) {
      return;
    }

    data = data.replace(/`/g, "\\u0060");

    webFrame.executeJavaScript(`
			if(!document.getElementById("${customCssId}")) {
				var style = document.createElement('style');
				style.id = "${customCssId}";
				style.type = "text/css";
				style.innerHTML = \u0060${data}\u0060;
				document.head.appendChild(style);
			}
		`);
  });
}
