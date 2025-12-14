globalThis.addEventListener("DOMContentLoaded", () => {
	const screens = [
		{
			width: 1280,
			height: 720,
			name: "HD",
			alt_name: "720p",
			default: false,
		},
		{
			width: 1920,
			height: 1080,
			name: "FHD",
			alt_name: "1080p",
			default: true,
		},
		{
			width: 2048,
			height: 1080,
			name: "2K",
			alt_name: "QHD",
			default: false,
		},
		{
			width: 3840,
			height: 2160,
			name: "4K",
			alt_name: "UHD",
			default: false,
		},
	];
	let windowsIndex = 0;
	const sscontainer = document.getElementById("screen-size");
	createEventHandlers({ screens, sscontainer });
	globalThis.api
		.desktopCapturerGetSources({ types: ["window", "screen"] })
		.then(async (sources) => {
			const rowElement = document.querySelector(".container-fluid .row");
			for (const source of sources) {
				await createPreview({
					source,
					title: source.id.startsWith("screen:")
						? source.name
						: `Window ${++windowsIndex}`,
					rowElement,
					screens,
					sscontainer,
				});
			}
		});
});

async function createPreview(properties) {
	let columnElement = document.createElement("div");
	columnElement.className = `col-5 ${properties.source.id.startsWith("screen:") ? "screen" : "window"}`;
	// Video container
	let videoContainerElement = document.createElement("div");
	videoContainerElement.className = "video-container";
	// Video
	let videoElement = document.createElement("video");
	videoElement.dataset.id = properties.source.id;
	videoElement.title = properties.source.name;
	videoContainerElement.appendChild(videoElement);
	// Label
	let labelElement = document.createElement("div");
	labelElement.className = "label-container";
	labelElement.appendChild(document.createTextNode(properties.title));
	columnElement.appendChild(videoContainerElement);
	columnElement.appendChild(labelElement);
	properties.rowElement.appendChild(columnElement);
	await createPreviewStream(properties, videoElement);
}

async function createPreviewStream(properties, videoElement) {
	// Disable audio in preview streams to prevent echo during screen sharing
	console.debug(`[SCREEN_SHARE_DIAG] Creating preview stream for source: ${properties.source.id}`);
	console.debug(`[SCREEN_SHARE_DIAG] Preview stream - audio: DISABLED, dimensions: 192x108 (echo prevention)`);
	
	const stream = await navigator.mediaDevices.getUserMedia({
		audio: false, // CRITICAL: No audio to prevent duplicate capture sessions causing echo
		video: {
			mandatory: {
				chromeMediaSource: "desktop",
				chromeMediaSourceId: properties.source.id,
				minWidth: 192,
				maxWidth: 192,
				minHeight: 108,
				maxHeight: 108,
			},
		},
	});
	
	console.debug(`[SCREEN_SHARE_DIAG] Preview stream created successfully - ID: ${stream.id}`);
	console.debug(`[SCREEN_SHARE_DIAG] Preview stream tracks - Audio: ${stream.getAudioTracks().length}, Video: ${stream.getVideoTracks().length}`);
	
	videoElement.srcObject = stream;
	playPreview({
		videoElement,
		source: properties.source,
		screens: properties.screens,
		sscontainer: properties.sscontainer,
	});
}

function playPreview(properties) {
	properties.videoElement.onclick = () => {
		console.debug(`[SCREEN_SHARE_DIAG] User selected source: ${properties.source.id}, cleaning up all previews immediately`);
		closePreviews(); // Clean up all preview streams immediately to prevent ongoing capture
		globalThis.api.selectedSource({
			id: properties.source.id,
			screen: properties.screens[properties.sscontainer.value]
		});
	};
	properties.videoElement.onloadedmetadata = () =>
		properties.videoElement.play();
}

function createEventHandlers(properties) {
	createQualitySelector(properties);
	document
		.querySelector("#btn-screens")
		.addEventListener("click", toggleSources);
	document
		.querySelector("#btn-windows")
		.addEventListener("click", toggleSources);
	document.querySelector("#btn-close").addEventListener("click", () => {
		closePreviews();
		globalThis.api.closeView();
	});
}

function closePreviews() {
	// Enhanced logging for preview cleanup - prevents audio echo
	const vidElements = document.getElementsByTagName("video");
	console.debug(`[SCREEN_SHARE_DIAG] Closing ${vidElements.length} preview streams to prevent echo`);
	
	for (const vidElement of vidElements) {
		if (vidElement.srcObject) {
			const stream = vidElement.srcObject;
			console.debug(`[SCREEN_SHARE_DIAG] Closing preview stream: ${stream.id}`, {
				audioTracks: stream.getAudioTracks().length,
				videoTracks: stream.getVideoTracks().length,
				hasAudio: stream.getAudioTracks().length > 0
			});
			
			vidElement.pause();
			
			// Stop all tracks to immediately release desktop capture
			for (const track of stream.getTracks()) {
				console.debug(`[SCREEN_SHARE_DIAG] Stopping track: ${track.kind} - ${track.id}`);
				track.stop();
			}
			
			// Clear the srcObject reference
			vidElement.srcObject = null;
			
			console.debug(`[SCREEN_SHARE_DIAG] Preview stream ${stream.id} cleaned up - desktop capture released`);
		} else {
			console.debug(`[SCREEN_SHARE_DIAG] Video element has no srcObject to clean up`);
		}
	}
	
	console.debug(`[SCREEN_SHARE_DIAG] All preview streams closed - echo prevention complete`);
}

function toggleSources(e) {
	for (const b of document.querySelectorAll("button")) {
		b.classList.toggle("btn-primary");
		b.classList.toggle("btn-secondary");
	}
	document
		.querySelector(".container-fluid")
		.dataset.view = e.target.dataset.view;
}

function createQualitySelector(properties) {
	for (const [i, s] of properties.screens.entries()) {
		const opt = document.createElement("option");
		opt.appendChild(document.createTextNode(s.name));
		opt.value = i;
		properties.sscontainer.appendChild(opt);
	}
	let defaultSelection = properties.screens.findIndex((s) => {
		return s.default;
	});

	defaultSelection =
		defaultSelection > -1 ? defaultSelection : properties.screens.length - 1;
	properties.sscontainer.selectedIndex = defaultSelection;
}
