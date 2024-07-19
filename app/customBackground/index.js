const httpHelper = require('../helpers');
const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let customBGServiceUrl;

class CustomBackground {
    constructor(app, config) {
        this.app = app;
        this.config = config;
        if (this.isCustomBackgroundEnabled()) {
            this.downloadCustomBGServiceRemoteConfig();
            ipcMain.handle('get-custom-bg-list', this.handleGetCustomBGList);
        }
    }

    isCustomBackgroundEnabled() {
        return this.config.isCustomBackgroundEnabled;
    }

    async downloadCustomBGServiceRemoteConfig() {
        let customBGUrl;
        try {
            customBGUrl = new URL('', this.config.customBGServiceBaseUrl);
        }
        catch (err) {
            console.warning(`Failed to load custom background service configuration. ${err}. Setting Background service URL to http://localhost `);
            customBGUrl = new URL('', 'http://localhost');
        }
    
        const remotePath = httpHelper.joinURLs(customBGUrl.href, 'config.json');
        console.debug(`Fetching custom background configuration from '${remotePath}'`);
        httpHelper.getAsync(remotePath)
            .then(this.onCustomBGServiceConfigDownloadSuccess.bind(this))
            .catch(this.onCustomBGServiceConfigDownloadFailure.bind(this));
        if (this.config.customBGServiceConfigFetchInterval > 0) {
            setTimeout(this.downloadCustomBGServiceRemoteConfig, this.config.customBGServiceConfigFetchInterval * 1000);
        }
    }

    async handleGetCustomBGList() {
        const file = path.join(this.app.getPath('userData'), 'custom_bg_remote.json');
        if (!fs.existsSync(file)) {
            return [];
        } else {
            return JSON.parse(fs.readFileSync(file));
        }
    }

    beforeRequestHandlerRedirectUrl(details) {
        // Custom background for teams v1
        if (details.url.startsWith('https://statics.teams.cdn.office.net/teams-for-linux/custom-bg/')) {
            const reqUrl = details.url.replace('https://statics.teams.cdn.office.net/teams-for-linux/custom-bg/', '');
            const imgUrl = httpHelper.joinURLs(customBGServiceUrl.href, reqUrl);
            console.debug(`Forwarding '${details.url}' to '${imgUrl}'`);
            return { redirectURL: imgUrl };
        }
        // Custom background replace for teams v2
        else if (details.url.startsWith('https://statics.teams.cdn.office.net/evergreen-assets/backgroundimages/') && this.config.isCustomBackgroundEnabled) {
            const reqUrl = details.url.replace('https://statics.teams.cdn.office.net/evergreen-assets/backgroundimages/', '');
            const imgUrl = httpHelper.joinURLs(customBGServiceUrl.href, reqUrl);
            console.debug(`Forwarding '${details.url}' to '${imgUrl}'`);
            return { redirectURL: imgUrl };
        }
    }

    addCustomBackgroundHeaders(detail) {
        if (!this.isCustomBackgroundEnabled()) {
            return;
        } else if (detail.url.startsWith(customBGServiceUrl.href)) {
			detail.requestHeaders['Access-Control-Allow-Origin'] = '*';
		}
    }

    onHeadersReceivedHandler(details) {
        if (!this.isCustomBackgroundEnabled()) {
            return;
        } else if (details.responseHeaders['content-security-policy']) {
            const policies = details.responseHeaders['content-security-policy'][0].split(';');
            setImgSrcSecurityPolicy(policies);
            setConnectSrcSecurityPolicy(policies);
            details.responseHeaders['content-security-policy'][0] = policies.join(';');
        }
    }

    initializeCustomBGServiceURL() {
        if (!this.isCustomBackgroundEnabled()) {
            return;
        }
        try {
            customBGServiceUrl = new URL('', this.config.customBGServiceBaseUrl);
            console.debug(`Custom background service url is '${this.config.customBGServiceBaseUrl}'`);
        }
        catch (err) {
            console.error(`Invalid custom background service url '${this.config.customBGServiceBaseUrl}' \n ${err} \n Updating to default 'http://localhost'`);
            customBGServiceUrl = new URL('', 'http://localhost');
        }
    }

    isCustomBackgroundHttpProtocol() {
        return customBGServiceUrl?.protocol === 'http:';
    }

    onCustomBGServiceConfigDownloadFailure(err) {
        const dlpath = path.join(this.app.getPath('userData'), 'custom_bg_remote.json');
        console.error(`Failed to fetch custom background remote configuration. ${err.message}`);
        try {
            fs.writeFileSync(dlpath, JSON.stringify([]));
        }
        catch (err) {
            console.error(`Failed to save custom background default configuration at '${dlpath}'. ${err.message}`);
        }
    }
    
    onCustomBGServiceConfigDownloadSuccess(data) {
        const downloadPath = path.join(this.app.getPath('userData'), 'custom_bg_remote.json');
        try {
            const configJSON = JSON.parse(data);
            for (let config of configJSON) {
                setPath(config);
            }
            fs.writeFileSync(downloadPath, JSON.stringify(configJSON));
            console.debug(`Custom background service remote configuration stored at '${downloadPath}'`);
        }
        catch (err) {
            console.error(`Fetched custom background remote configuration but failed to save at '${downloadPath}'. ${err.message}`);
        }
    }
}

function setPath(cfg) {
    if (!cfg.src.startsWith('/teams-for-linux/custom-bg/')) {
        cfg.src = httpHelper.joinURLs('/teams-for-linux/custom-bg/', cfg.src);
    }

    if (!cfg.thumb_src.startsWith('/teams-for-linux/custom-bg/')) {
        cfg.thumb_src = httpHelper.joinURLs('/teams-for-linux/custom-bg/', cfg.thumb_src);
    }
}

function setConnectSrcSecurityPolicy(policies) {
	const connectsrcIndex = policies.findIndex(f => f.indexOf('connect-src') >= 0);
	if (connectsrcIndex >= 0) {
		policies[connectsrcIndex] = policies[connectsrcIndex] + ` ${customBGServiceUrl.origin}`;
	}
}

function setImgSrcSecurityPolicy(policies) {
	const imgsrcIndex = policies.findIndex(f => f.indexOf('img-src') >= 0);
	if (imgsrcIndex >= 0) {
		policies[imgsrcIndex] = policies[imgsrcIndex] + ` ${customBGServiceUrl.origin}`;
	}
}


module.exports = CustomBackground;
