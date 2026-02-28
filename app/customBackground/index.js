const httpHelper = require("../helpers");
const { ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

let customBGServiceUrl;

class CustomBackground {
  constructor(app, config) {
    this.app = app;
    this.config = config;
    if (this.isCustomBackgroundEnabled()) {
      // Get list of custom background images for Teams meetings
      ipcMain.handle("get-custom-bg-list", this.handleGetCustomBGList);
    }
  }

  initialize() {
    if (this.isCustomBackgroundEnabled()) {
      this.downloadCustomBGServiceRemoteConfig();
    }
  }

  isCustomBackgroundEnabled() {
    return this.config.isCustomBackgroundEnabled;
  }

  async downloadCustomBGServiceRemoteConfig() {
    let customBGUrl;
    try {
      customBGUrl = new URL("", this.config.customBGServiceBaseUrl);
    } catch (err) {
      console.warn(
        `Failed to load custom background service configuration. ${err}. Setting Background service URL to http://localhost `,
      );
      customBGUrl = new URL("", "http://localhost");
    }

    const remotePath = httpHelper.joinURLs(customBGUrl.href, "config.json");
    console.debug('[CUSTOM_BG] Fetching remote configuration');
    try {
      const data = await httpHelper.getAsync(remotePath);
      this.onCustomBGServiceConfigDownloadSuccess(data);
    } catch (err) {
      this.onCustomBGServiceConfigDownloadFailure(err);
    }
    if (this.config.customBGServiceConfigFetchInterval > 0) {
      setTimeout(
        () => this.downloadCustomBGServiceRemoteConfig(),
        this.config.customBGServiceConfigFetchInterval * 1000,
      );
    }
  }

  async handleGetCustomBGList() {
    const file = path.join(
      this.app.getPath("userData"),
      "custom_bg_remote.json",
    );
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file));
    } else {
      return [];
    }
  }

  beforeRequestHandlerRedirectUrl(details) {
    // Custom background for teams v1
    if (
      details.url.startsWith(
        "https://statics.teams.cdn.office.net/teams-for-linux/custom-bg/",
      )
    ) {
      const reqUrl = details.url.replace(
        "https://statics.teams.cdn.office.net/teams-for-linux/custom-bg/",
        "",
      );
      const imgUrl = httpHelper.joinURLs(customBGServiceUrl.href, reqUrl);
      console.debug('[CUSTOM_BG] Forwarding v1 background request');
      return { redirectURL: imgUrl };
    }
    // Custom background replace for teams v2
    else if (
      details.url.startsWith(
        "https://statics.teams.cdn.office.net/evergreen-assets/backgroundimages/",
      ) &&
      this.config.isCustomBackgroundEnabled
    ) {
      const reqUrl = details.url.replace(
        "https://statics.teams.cdn.office.net/evergreen-assets/backgroundimages/",
        "",
      );
      const imgUrl = httpHelper.joinURLs(customBGServiceUrl.href, reqUrl);
      console.debug('[CUSTOM_BG] Forwarding v2 background request');
      return { redirectURL: imgUrl };
    }
  }

  addCustomBackgroundHeaders(detail) {
    if (!this.isCustomBackgroundEnabled()) {
      return;
    } else if (detail.url.startsWith(customBGServiceUrl.href)) {
      detail.requestHeaders["Access-Control-Allow-Origin"] = "*";
    }
  }

  onHeadersReceivedHandler(details) {
    if (!this.isCustomBackgroundEnabled()) {
      return;
    } else if (details.responseHeaders["content-security-policy"]) {
      const policies =
        details.responseHeaders["content-security-policy"][0].split(";");
      setImgSrcSecurityPolicy(policies);
      setConnectSrcSecurityPolicy(policies);
      details.responseHeaders["content-security-policy"][0] =
        policies.join(";");
    }
  }

  initializeCustomBGServiceURL() {
    if (!this.isCustomBackgroundEnabled()) {
      return;
    }
    try {
      customBGServiceUrl = new URL("", this.config.customBGServiceBaseUrl);
      console.debug('[CUSTOM_BG] Custom background service URL configured');
    } catch (err) {
      console.error(
        `[CUSTOM_BG] Invalid custom background service URL, updating to default. Error: ${err.message}`,
      );
      customBGServiceUrl = new URL("", "http://localhost");
    }
  }

  isCustomBackgroundHttpProtocol() {
    return customBGServiceUrl?.protocol === "http:";
  }

  onCustomBGServiceConfigDownloadFailure(err) {
    const dlpath = path.join(
      this.app.getPath("userData"),
      "custom_bg_remote.json",
    );
    console.error(
      `Failed to fetch custom background remote configuration. ${err.message}`,
    );
    try {
      fs.writeFileSync(dlpath, JSON.stringify([]));
    } catch (err) {
      console.error(
        `Failed to save custom background default configuration at '${dlpath}'. ${err.message}`,
      );
    }
  }

  onCustomBGServiceConfigDownloadSuccess(data) {
    const downloadPath = path.join(
      this.app.getPath("userData"),
      "custom_bg_remote.json",
    );
    try {
      const configJSON = JSON.parse(data);
      for (const config of configJSON) {
        setPath(config);
      }
      fs.writeFileSync(downloadPath, JSON.stringify(configJSON));
      console.debug(
        `Custom background service remote configuration stored at '${downloadPath}'`,
      );
    } catch (err) {
      console.warn(
        `Fetched custom background remote configuration but failed to save at '${downloadPath}'. ${err.message}`,
      );
    }
  }
}

function setPath(cfg) {
  if (!cfg.src.startsWith("/teams-for-linux/custom-bg/")) {
    cfg.src = httpHelper.joinURLs("/teams-for-linux/custom-bg/", cfg.src);
  }

  if (!cfg.thumb_src.startsWith("/teams-for-linux/custom-bg/")) {
    cfg.thumb_src = httpHelper.joinURLs(
      "/teams-for-linux/custom-bg/",
      cfg.thumb_src,
    );
  }
}

function setConnectSrcSecurityPolicy(policies) {
  const connectsrcIndex = policies.findIndex(
    (f) => f.includes("connect-src"),
  );
  if (connectsrcIndex >= 0) {
    policies[connectsrcIndex] =
      policies[connectsrcIndex] + ` ${customBGServiceUrl.origin}`;
  }
}

function setImgSrcSecurityPolicy(policies) {
  const imgsrcIndex = policies.findIndex((f) => f.includes("img-src"));
  if (imgsrcIndex >= 0) {
    policies[imgsrcIndex] =
      policies[imgsrcIndex] + ` ${customBGServiceUrl.origin}`;
  }
}

module.exports = CustomBackground;
