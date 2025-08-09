/**
 * @file popOutCall.js
 * @brief Injects a "Pop out" button into the Microsoft Teams web app's call toolbar.
 *        When clicked, it sends an IPC message to the main process to open a separate call window.
 */

exports.injectPopOutScript = function(webFrame) {
    const script = `
        (function() {
            const POPOUT_BUTTON_ID = 'teams-for-linux-popout-button';

            function injectPopOutButton() {
                const callControls = document.querySelector('[data-tid="call-controls-container"]');

                if (callControls && !document.getElementById(POPOUT_BUTTON_ID)) {
                    const popOutButton = document.createElement('button');
                    popOutButton.id = POPOUT_BUTTON_ID;
                    popOutButton.className = 'ts-btn';
                    popOutButton.innerHTML = '<span class="ts-icon ts-icon-popout"></span> Pop Out';
                    popOutButton.title = 'Pop out this call';

                    popOutButton.addEventListener('click', () => {
                        window.electronAPI.createCallPopOutWindow();
                        // Hide the main Teams meeting content
                        const meetingContent = document.querySelector('[data-tid="call-screen"]');
                        if (meetingContent) {
                            meetingContent.style.display = 'none';
                        }
                        console.log('Teams for Linux: Main meeting content hidden.');
                    });

                    callControls.appendChild(popOutButton);
                    console.log('Teams for Linux: Pop out button injected.');
                } else if (!callControls) {
                    console.log('Teams for Linux: Call controls container not found, retrying...');
                }
            }

            const observer = new MutationObserver((mutationsList, observer) => {
                if (document.querySelector('[data-tid="call-controls-container"]')) {
                    injectPopOutButton();
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });
            injectPopOutButton();
        })();
    `;
    webFrame.executeJavaScript(script);
};