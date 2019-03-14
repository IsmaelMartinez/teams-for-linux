const { selectSource } = require('./captureSelector');

window.chrome = {
	'runtime': {
		'sendMessage': function (extensionId, messageName, callback) {
			if (messageName == 'version') {
				callback({ version: '1.1.0' });
			} else if (messageName == 'get-sourceId') {
				selectSource(source => {
					callback({
						type: 'success',
						streamId: source
					});
				});
			} else {
				callback({
					type: 'error',
					message: 'unknown event'
				});
			}
		}
	}
};
