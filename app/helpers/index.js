const https = require('https');
const http = require('http');

class HTTPHelper {
	joinURLs(url1, url2) {
		return removeTrailingSlash(url1) + '/' + removeLeadingSlash(url2);
	}

	getAsync(url) {
		return new Promise((res, rej) => {
			processRequest(url, res, rej);
		});
	}
}

function removeLeadingSlash(url) {
	return (url[0] == '/') ? url = url.substr(1) : url;
}

function removeTrailingSlash(url) {
	return (url[url.length - 1] == '/') ? url.substr(0, url.length - 1) : url;
}

function processRequest(url, resolve, reject) {
	const request = getHttpClient(url).request(url, (response) => {
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

function getHttpClient(url) {
	return url.startsWith('http://') ? http : https;
}

module.exports = new HTTPHelper();