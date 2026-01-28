let regexPattern = null;

const urlInput = document.getElementById('url-input');
const joinBtn = document.getElementById('join-btn');
const cancelBtn = document.getElementById('cancel-btn');
const errorMessage = document.getElementById('error-message');

function isValidUrl(text) {
    if (!text || !regexPattern) {
        return false;
    }
    try {
        const pattern = new RegExp(regexPattern);
        return pattern.test(text);
    } catch {
        return false;
    }
}

function updateValidation() {
    const url = urlInput.value.trim();
    const isValid = isValidUrl(url);

    joinBtn.disabled = !isValid;

    if (url && !isValid) {
        urlInput.classList.add('invalid');
        errorMessage.textContent = 'Please enter a valid Teams meeting URL';
    } else {
        urlInput.classList.remove('invalid');
        errorMessage.textContent = '';
    }
}

function handleJoin() {
    const url = urlInput.value.trim();
    if (isValidUrl(url)) {
        globalThis.joinMeetingApi.submit(url);
    }
}

function handleCancel() {
    globalThis.joinMeetingApi.cancel();
}

// Initialize when data is received from main process
globalThis.joinMeetingApi.onInit((data) => {
    regexPattern = data.regexPattern;

    // Pre-populate with clipboard text if it's a valid URL
    if (data.clipboardText && isValidUrl(data.clipboardText)) {
        urlInput.value = data.clipboardText;
    }

    updateValidation();
    urlInput.focus();
    urlInput.select();
});

// Event listeners
urlInput.addEventListener('input', updateValidation);
urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !joinBtn.disabled) {
        handleJoin();
    } else if (e.key === 'Escape') {
        handleCancel();
    }
});

joinBtn.addEventListener('click', handleJoin);
cancelBtn.addEventListener('click', handleCancel);
