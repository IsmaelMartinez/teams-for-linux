/**
 * App Registration Auth Preload Tool
 * Listens for device-code authentication events via IPC and displays
 * an in-app overlay dialog with the device code and verification URL.
 */

function showDeviceCodeOverlay(data) {
  if (!data || !data.userCode || !data.verificationUri) return;

  const existing = document.getElementById('app-registration-device-code-overlay');
  if (existing) {
    existing.remove();
  }

  const overlay = document.createElement('div');
  overlay.id = 'app-registration-device-code-overlay';
  overlay.style.position = 'fixed';
  overlay.style.bottom = '20px';
  overlay.style.right = '20px';
  overlay.style.zIndex = '999999';
  overlay.style.backgroundColor = '#1f1f1f';
  overlay.style.color = '#ffffff';
  overlay.style.border = '1px solid #484644';
  overlay.style.borderRadius = '8px';
  overlay.style.padding = '16px 20px';
  overlay.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.4)';
  overlay.style.fontFamily = 'Segoe UI, system-ui, sans-serif';
  overlay.style.maxWidth = '380px';

  overlay.innerHTML = `
    <div style="font-weight: 600; font-size: 15px; margin-bottom: 8px;">Teams Authentication Required</div>
    <div style="font-size: 13px; color: #d0d0d0; margin-bottom: 12px; line-height: 1.4;">
      Please open <a href="${data.verificationUri}" target="_blank" style="color: #6372ec; text-decoration: underline;">${data.verificationUri}</a> and enter code:
    </div>
    <div style="display: flex; align-items: center; justify-content: space-between; background: #2d2d2d; padding: 8px 12px; border-radius: 4px; margin-bottom: 12px;">
      <span id="app-reg-user-code" style="font-family: monospace; font-size: 18px; font-weight: bold; letter-spacing: 2px; color: #50e6ff;">${data.userCode}</span>
      <button id="app-reg-copy-btn" style="background: #4f52b2; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;">Copy</button>
    </div>
    <div style="text-align: right;">
      <button id="app-reg-close-btn" style="background: transparent; color: #a0a0a0; border: 1px solid #505050; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">Dismiss</button>
    </div>
  `;

  document.body.appendChild(overlay);

  const copyBtn = document.getElementById('app-reg-copy-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(data.userCode).then(() => {
        copyBtn.innerText = 'Copied!';
        setTimeout(() => {
          if (copyBtn) copyBtn.innerText = 'Copy';
        }, 2000);
      });
    });
  }

  const closeBtn = document.getElementById('app-reg-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      overlay.remove();
    });
  }
}

function init(config, ipcRenderer) {
  if (!config?.auth?.appRegistration?.enabled) {
    return;
  }

  if (!ipcRenderer || typeof ipcRenderer.on !== 'function') {
    console.warn('[AUTH_PRELOAD] ipcRenderer not available');
    return;
  }

  ipcRenderer.on('app-registration-device-code', (_event, data) => {
    console.info('[AUTH_PRELOAD] Received device-code notification');
    if (document.body) {
      showDeviceCodeOverlay(data);
    } else {
      window.addEventListener('DOMContentLoaded', () => showDeviceCodeOverlay(data));
    }
  });
}

module.exports = { init, showDeviceCodeOverlay };
