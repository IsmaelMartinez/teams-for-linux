const fs = require("node:fs");
const path = require("node:path");

const defaultHiddenSelectors = [
  "#download-mobile-app-button",
  "#download-app-button",
  "#get-app-button",
  "[data-tid^='more-options-menu-premium-button']",
  "[data-tid='more-options-header'] > div:first-child",
  "[data-tid='more-options-header'] > span:not(.fui-Button__icon)",
].join(", ");
const defaultHideCss = `${defaultHiddenSelectors} { display: none !important; }`;
const zoetropeCss = ".zoetrope { animation-iteration-count: 1 !important; }";

exports.onDidFinishLoad = function onDidFinishLoad(content, config) {
  const customCssLocation = getCustomCssLocation(config);
  if (customCssLocation) {
    applyCustomCSSToContent(content, customCssLocation);
  }
  applyDefaultCSSToContent(content);
};

exports.onDidFrameFinishLoad = function onDidFrameFinishLoad(webFrame, config) {
  const customCssLocation = getCustomCssLocation(config);
  if (customCssLocation) {
    applyCustomCSSToFrame(webFrame, customCssLocation);
  }
  applyDefaultCSSToFrame(webFrame);
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

function applyDefaultCSSToContent(content) {
  content.insertCSS(defaultHideCss);
  content.insertCSS(zoetropeCss);
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

    data = data.replaceAll("`", String.raw`\u0060`);

    webFrame.executeJavaScript(`
			if(!document.getElementById("${customCssId}")) {
				const style = document.createElement('style');
				style.id = "${customCssId}";
				style.type = "text/css";
				style.textContent = ${JSON.stringify(data)};
				document.head.appendChild(style);
			}
		`);
  });
}

function applyDefaultCSSToFrame(webFrame) {
  const cssContent = JSON.stringify(`${defaultHideCss}\n${zoetropeCss}`);
  webFrame.executeJavaScript(`
			if (!document.getElementById("tfl-default-css-style")) {
				const style = document.createElement('style');
				style.id = "tfl-default-css-style";
				style.type = "text/css";
				style.textContent = ${cssContent};
				document.head.appendChild(style);
			}
		`);
}
