const { net } = require('electron');

class HTTPHelper {
	joinURLs(url1, url2) {
		return removeTrailingSlash(url1) + '/' + removeLeadingSlash(url2);
	}

	getAsync(url) {
		return new Promise((res, rej) => {
			processRequest(url, res, rej);
		});
	}

	/**
	 * @param {number} timeout 
	 * @param {number} retries 
	 * @returns 
	 */
	async isOnline(timeout, retries) {
		var resolved = false;
		for (var i = 1; i <= retries && !resolved; i++) {
			// Not using net.isOnline(), because it's too optimistic, it returns
			// true before we can actually issue successful https requests.
			resolved = await isOnlineInternal();
			if (!resolved) await sleep(timeout);
		}
		return resolved;
	}
}

function sleep(timeout) {
	return new Promise(r => setTimeout(r, timeout));
}


function removeLeadingSlash(url) {
	return (url[0] == '/') ? url = url.substr(1) : url;
}

function removeTrailingSlash(url) {
	return (url[url.length - 1] == '/') ? url.substr(0, url.length - 1) : url;
}

function processRequest(url, resolve, reject) {
	const request = net.request(url);

	request.on('response', (response) => {
		let data = '';
		if (response.statusCode >= 200 && response.statusCode < 300) {
			response.on('data', (chunk) => {
				data = data + chunk.toString();
			});

			response.on('end', () => {
				resolve(data);
			});
		} else {
			reject(new Error(`Server returned error code '${response.statusCode}'`));
		}
	});

	request.on('error', (err) => {
		reject(err);
	});

	request.end();
}

function isOnlineInternal() {
	return new Promise((resolve) => {
		var req = net.request({
			url: 'https://teams.microsoft.com',
			method: 'HEAD'
		});
		req.on('response', () => {
			resolve(true);
		});
		req.on('error', () => {
			resolve(false);
		});
		req.end();
	});
}

module.exports = new HTTPHelper();