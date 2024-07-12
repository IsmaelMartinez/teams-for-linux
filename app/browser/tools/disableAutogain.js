let disableAutogain = function () {
	function setLegacyChromeConstraint(constraint, name, value) {
		if (constraint.mandatory && name in constraint.mandatory) {
			constraint.mandatory[name] = value;
			return;
		}
		if (constraint.optional) {
			const element = constraint.optional.find(opt => name in opt);
			if (element) {
				element[name] = value;
				return;
			}
		}
		// `mandatory` options throw errors for unknown keys, so avoid that by
		// setting it under optional.
		if (!constraint.optional) {
			constraint.optional = [];
		}
		constraint.optional.push({ [name]: value });
	}
	function setConstraint(constraint, name, value) {
		if (constraint.advanced) {
			const element = constraint.advanced.find(opt => name in opt);
			if (element) {
				element[name] = value;
				return;
			}
		}
		constraint[name] = value;
	}
	function disableAutogain(constraints) {
		console.debug('Automatically unsetting gain!', constraints);
		if (constraints?.audio) {
			if (typeof constraints.audio !== 'object') {
				constraints.audio = {};
			}
			if (constraints.audio.optional || constraints.audio.mandatory) {
				setLegacyChromeConstraint(constraints.audio, 'googAutoGainControl', false);
				setLegacyChromeConstraint(constraints.audio, 'googAutoGainControl2', false);
			} else {
				setConstraint(constraints.audio, 'autoGainControl', false);
			}
		}
	}

	function patchFunction(object, name, createNewFunction) {
		if (name in object) {
			object[name] = createNewFunction(object[name]);
		}
	}

	patchFunction(navigator.mediaDevices, 'getUserMedia', function (original) {
		return function getUserMedia(constraints) {
			disableAutogain(constraints);
			return original.call(this, constraints);
		};
	});
	function patchDeprecatedGetUserMedia(original) {
		return function getUserMedia(constraints, success, error) {
			disableAutogain(constraints);
			return original.call(this, constraints, success, error);
		};
	}
	patchFunction(navigator, 'getUserMedia', patchDeprecatedGetUserMedia);
	patchFunction(navigator, 'mozGetUserMedia', patchDeprecatedGetUserMedia);
	patchFunction(navigator, 'webkitGetUserMedia', patchDeprecatedGetUserMedia);
	patchFunction(MediaStreamTrack.prototype, 'applyConstraints', function (original) {
		return function applyConstraints(constraints) {
			disableAutogain(constraints);
			return original.call(this, constraints);
		};
	});
	console.debug(
		'Disable Autogain by Joey Watts!',
		navigator.mediaDevices.getUserMedia
	);
};

module.exports = disableAutogain;