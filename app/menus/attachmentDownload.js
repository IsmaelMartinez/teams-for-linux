const { app, BrowserWindow, Notification, clipboard } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

// Attachment download pipeline used by the context menu (app/menus/index.js).
// Downloads a Teams/SharePoint/OneDrive link or a generic http(s) URL, saves it
// into Documents/Teams-Downloads (or a caller-chosen path) and places a native
// file reference on the clipboard. Microsoft hosts and HTML responses are
// fetched through a locked-down hidden window so the authenticated session and
// viewer redirects work; direct binary responses are streamed straight from
// `session.fetch`.

// Microsoft 365 / SharePoint / OneDrive hosts get the hidden-window download
// treatment (they need the authenticated session and viewer redirects).
// Suffix matching only — a substring test would also match lookalike hosts
// like "mymicrosoft.evil.com". "mcas.ms" covers Defender for Cloud Apps
// proxied hosts ("contoso.sharepoint.com.<region>.mcas.ms").
const MS_HOST_SUFFIXES = [
  "sharepoint.com",
  "sharepoint-df.com",
  "officeapps.live.com",
  "office.com",
  "office.net",
  "microsoft.com",
  "onedrive.com",
  "1drv.ms",
  "svc.ms",
  "mcas.ms",
];

function isMicrosoftHost(urlStr) {
  try {
    const url = new URL(urlStr);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    const host = url.hostname.toLowerCase();
    return MS_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith("." + suffix));
  } catch {
    return false;
  }
}

// Strip any path components from a filename coming from an untrusted source
// (Content-Disposition header, page title, URL path) so it can never escape
// the target directory.
function sanitizeFilename(candidate, fallback = "attachment") {
  if (typeof candidate !== "string") {
    return fallback;
  }
  const base = path.basename(candidate.replaceAll("\\", "/")).trim();
  if (!base || base === "." || base === "..") {
    return fallback;
  }
  return base;
}

// Mirror Chromium's "name (1).ext" de-duplication for direct writes into
// Teams-Downloads, so an existing file is never silently overwritten.
function uniqueFilePath(directory, filename) {
  const ext = path.extname(filename);
  const stem = path.basename(filename, ext);
  let candidate = path.join(directory, filename);
  for (let i = 1; fs.existsSync(candidate); i++) {
    candidate = path.join(directory, `${stem} (${i})${ext}`);
  }
  return candidate;
}

// Strip the viewer suffix from a page title ("notes.txt - SharePoint" →
// "notes.txt"). Plain string operations instead of regexes: the title is
// page-controlled and the previous /\s+-\s+…$/ patterns were flagged as
// backtracking-prone (Sonar S5852).
const VIEWER_TITLE_SUFFIXES = new Set(["sharepoint", "onedrive", "microsoft 365"]);

function stripViewerTitleSuffix(title) {
  const trimmed = title.trim();
  const idx = trimmed.lastIndexOf(" - ");
  if (idx > 0) {
    const suffix = trimmed.slice(idx + 3).trim().toLowerCase();
    if (VIEWER_TITLE_SUFFIXES.has(suffix)) {
      return trimmed.slice(0, idx).trim();
    }
  }
  return trimmed;
}

// Electron's clipboard.write() has no cross-platform "file" type (an unknown
// key like `filenames` is silently ignored), so write the platform-native
// format that file managers actually paste from.
function copyFilePathToClipboard(filePath) {
  try {
    if (process.platform === "darwin") {
      const escaped = filePath
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
      const plist =
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">' +
        `<plist version="1.0"><array><string>${escaped}</string></array></plist>`;
      clipboard.writeBuffer("NSFilenamesPboardType", Buffer.from(plist));
    } else if (process.platform === "linux") {
      const uri = pathToFileURL(filePath).toString();
      clipboard.writeBuffer("text/uri-list", Buffer.from(uri + "\n"));
    } else {
      clipboard.writeText(filePath);
    }
  } catch (error) {
    console.warn("[CopyAttachment] Could not place file on clipboard", {
      message: error?.message,
    });
  }
}

function getDirectDownloadUrl(urlStr) {
  try {
    if (isMicrosoftHost(urlStr)) {
      const url = new URL(urlStr);
      if (!url.searchParams.has("download")) {
        url.searchParams.set("download", "1");
        return url.toString();
      }
    }
  } catch {
    // ignore
  }
  return urlStr;
}

// Download `linkURL` and copy the saved file to the clipboard.
// `options.destinationPath` (when set) saves to that exact path instead of
// Documents/Teams-Downloads — used by the "Save Attachment As…" menu item,
// where the user already picked the location in a save dialog.
async function copyAttachmentAsFile(linkURL, session, mainWindowUrl = "", options = {}) {
  const destinationPath = options.destinationPath || null;
  const progressNotification = new Notification({
    title: "Downloading attachment...",
    body: "Downloading attachment in the background...",
    silent: true,
  });
  progressNotification.show();

  try {
    let downloadURL = getDirectDownloadUrl(linkURL);
    
    // Convert direct path view URLs to direct layout download URLs if possible
    const spDownloadURL = getSharePointDownloadUrl(downloadURL);
    if (spDownloadURL) {
      downloadURL = spDownloadURL;
    }

    // Apply corporate MCAS proxy if active
    if (mainWindowUrl) {
      downloadURL = applyMcasProxy(downloadURL, mainWindowUrl);
    }
    
    const isMS = isMicrosoftHost(downloadURL);

    // Both the M365 path and an HTML response from a generic host go through
    // a hidden window: viewer text extraction for text files (so the Monaco
    // editor renders), navigation download otherwise. Only a direct binary
    // response is saved straight from fetch.
    const fetchViaHiddenWindow = () => {
      if (isTextFile(downloadURL)) {
        let viewerURL = linkURL;
        if (mainWindowUrl) {
          viewerURL = applyMcasProxy(viewerURL, mainWindowUrl);
        }
        return extractTextFromBrowserWindow(viewerURL, session, destinationPath);
      }
      return downloadWithBrowserWindow(downloadURL, session, destinationPath);
    };

    let result;
    if (isMS) {
      result = await fetchViaHiddenWindow();
    } else {
      const response = await session.fetch(downloadURL);
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        result = await fetchViaHiddenWindow();
      } else {
        let filename = "attachment";
        const contentDisposition = response.headers.get("content-disposition");
        if (contentDisposition) {
          const match = contentDisposition.match(/filename\*?=["']?(?:UTF-8'')?([^;"']+)["']?/i);
          if (match && match[1]) {
            filename = decodeURIComponent(match[1]);
          } else {
            const fallbackMatch = contentDisposition.match(/filename=["']?([^;"']+)["']?/i);
            if (fallbackMatch && fallbackMatch[1]) {
              filename = fallbackMatch[1];
            }
          }
        } else {
          try {
            const urlObj = new URL(linkURL);
            const pathname = urlObj.pathname;
            const lastPart = pathname.substring(pathname.lastIndexOf('/') + 1);
            if (lastPart) {
              filename = decodeURIComponent(lastPart);
            }
          } catch (e) {
            // ignore
          }
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        let targetFilePath;
        if (destinationPath) {
          // The user already chose the exact path in the save dialog (which
          // confirms its own overwrites), so honour it verbatim.
          fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
          targetFilePath = destinationPath;
        } else {
          const documentsDir = path.join(app.getPath("documents"), "Teams-Downloads");
          fs.mkdirSync(documentsDir, { recursive: true });
          // The filename came from a server header or URL — never let it carry
          // path segments out of the target directory.
          filename = sanitizeFilename(filename);
          targetFilePath = uniqueFilePath(documentsDir, filename);
        }
        fs.writeFileSync(targetFilePath, buffer);

        copyFilePathToClipboard(targetFilePath);
        result = { filename: path.basename(targetFilePath), targetFilePath };
      }
    }

    const savedLocation = destinationPath
      ? result.targetFilePath
      : `Documents/Teams-Downloads/${result.filename}`;
    const successNotification = new Notification({
      title: "Downloaded & Copied!",
      body: `Saved to ${savedLocation} and copied to clipboard.`,
    });
    successNotification.show();
  } catch (error) {
    // Log the message only — the full error can embed the download URL.
    console.error("[CopyAttachment] Error:", error?.message);
    const errorNotification = new Notification({
      title: "Download Error",
      body: `Failed to save attachment: ${error.message}`,
    });
    errorNotification.show();
  } finally {
    // Always dismiss the progress toast, also when the download failed.
    progressNotification.close();
  }
}

function isTextFile(urlStr) {
  try {
    const url = new URL(urlStr);
    const pathname = url.pathname;
    
    if (pathname.includes("/:t:/")) {
      return true;
    }
    
    const lastPart = pathname.substring(pathname.lastIndexOf('/') + 1);
    const extMatch = lastPart.match(/\.([a-zA-Z0-9]+)$/);
    if (extMatch) {
      const ext = extMatch[1].toLowerCase();
      const TEXT_EXTENSIONS = [
        "txt", "json", "csv", "log", "xml", "html", "htm", "css", "js", "ts",
        "py", "sh", "bat", "ps1", "yml", "yaml", "md", "ini", "conf", "sql"
      ];
      return TEXT_EXTENSIONS.includes(ext);
    }
  } catch (e) {
    // ignore
  }
  return false;
}

// Shared scaffolding for the two hidden-window flows (viewer text extraction
// and navigation download). The window shares the authenticated Teams
// session, so the renderer stays fully locked down: same-origin policy,
// context isolation, and the sandbox all enabled — executeJavaScript still
// works with all of these. The desktop-browser UA keeps the SharePoint
// viewer from serving a mobile or unsupported-browser page.
const HIDDEN_WINDOW_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function createHiddenDownloadWindow(activeSession) {
  const tempWin = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      session: activeSession,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      webSecurity: true,
    },
  });
  tempWin.webContents.setUserAgent(HIDDEN_WINDOW_USER_AGENT);

  const documentsDir = path.join(app.getPath("documents"), "Teams-Downloads");
  fs.mkdirSync(documentsDir, { recursive: true });

  return { tempWin, documentsDir };
}

function extractTextFromBrowserWindow(downloadURL, activeSession, destinationPath = null) {
  return new Promise((resolve, reject) => {
    const { tempWin, documentsDir } = createHiddenDownloadWindow(activeSession);
    if (destinationPath) {
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    }

    let resolved = false;
    let cleanupTimeout;

    const cleanup = () => {
      if (cleanupTimeout) {
        clearTimeout(cleanupTimeout);
      }
      if (!tempWin.isDestroyed()) {
        tempWin.destroy();
      }
    };

    cleanupTimeout = setTimeout(() => {
      if (!resolved) {
        cleanup();
        reject(new Error("Text extraction timed out (30 seconds)"));
      }
    }, 30000);

    tempWin.webContents.on("did-finish-load", async () => {
      try {
        let pageInfo = { success: false };
        for (let i = 0; i < 40; i++) {
          if (tempWin.isDestroyed()) return;
          
          pageInfo = await tempWin.webContents.executeJavaScript(`
            (function() {
              let textVal = "";
              let found = false;
              
              try {
                if (typeof monaco !== 'undefined' && monaco.editor) {
                  const models = monaco.editor.getModels();
                  if (models && models.length > 0) {
                    const val = models[0].getValue();
                    if (val) {
                      textVal = val;
                      found = true;
                    }
                  }
                }
              } catch (e) {}
              
              if (!found) {
                try {
                  const pre = document.querySelector('pre');
                  if (pre && pre.innerText && pre.innerText.trim().length > 0) {
                    textVal = pre.innerText;
                    found = true;
                  }
                } catch (e) {}
              }
              
              if (!found) {
                try {
                  const container = document.querySelector('.text-container') || document.querySelector('.file-viewer');
                  if (container && container.innerText && container.innerText.trim().length > 0) {
                    textVal = container.innerText;
                    found = true;
                  }
                } catch (e) {}
              }
              
              if (found) {
                return { success: true, text: textVal, title: document.title };
              }
              
              return { success: false };
            })()
          `);

          if (pageInfo && pageInfo.success) {
            break;
          }
          await new Promise(r => setTimeout(r, 500));
        }

        if (pageInfo && pageInfo.success) {
          let filename = stripViewerTitleSuffix(pageInfo.title || "attachment.txt");
          // The title is page-controlled — strip any path segments before
          // building the save path.
          filename = sanitizeFilename(filename, "attachment.txt");
          if (!filename.includes(".")) {
            filename += ".txt";
          }

          const targetFilePath = destinationPath || uniqueFilePath(documentsDir, filename);
          fs.writeFileSync(targetFilePath, pageInfo.text, "utf8");

          // Copy the extracted text; a file reference would overwrite it
          // (the clipboard holds one payload at a time).
          clipboard.writeText(pageInfo.text);

          resolved = true;
          cleanup();
          resolve({ filename: path.basename(targetFilePath), targetFilePath });
        }
      } catch (e) {
        console.error("[TextExtract] Error during extraction:", e?.message);
        // Settle now instead of leaving the caller to hit the 30s timeout
        // (or hang forever once `resolved` is set).
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(e);
        }
      }
    });

    tempWin.loadURL(downloadURL).catch((err) => {
      setTimeout(() => {
        if (!resolved) {
          cleanup();
          reject(new Error(`Failed to load URL: ${err.message}`));
        }
      }, 500);
    });
  });
}

function getSharePointDownloadUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    const host = url.hostname.toLowerCase();
    
    // Only target SharePoint and OneDrive domains
    if (host.includes("sharepoint.com") || host.includes("onedrive.com") || host.includes("mcas.ms")) {
      const pathname = url.pathname;
      // Match viewer prefix: /:x:/r/ or /:w:/g/ etc. (supporting sites or personal)
      const viewerRegex = /^\/:[a-z]:\/[rg]\/(personal|sites)\/([^\/]+)\/(.+)$/i;
      const match = pathname.match(viewerRegex);
      
      if (match) {
        const filePath = match[3];
        // Only convert if the file path has a standard file extension
        const hasExtension = /\.[a-zA-Z0-9]{2,5}$/.test(filePath);
        if (hasExtension) {
          const type = match[1];
          const ownerOrSite = match[2];
          
          const directPath = `${url.origin}/${type}/${ownerOrSite}/${filePath}`;
          const siteRoot = `${url.origin}/${type}/${ownerOrSite}`;
          
          const downloadUrl = new URL(`${siteRoot}/_layouts/15/download.aspx`);
          downloadUrl.searchParams.set("SourceUrl", directPath);
          return downloadUrl.toString();
        }
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

function applyMcasProxy(urlStr, mainWindowUrl) {
  try {
    const mainUrl = new URL(mainWindowUrl);
    if (mainUrl.hostname.endsWith(".mcas.ms")) {
      const targetUrl = new URL(urlStr);
      const origHost = targetUrl.hostname;
      if (!origHost.endsWith(".mcas.ms")) {
        const proxiedHost = origHost + ".mcas.ms";
        // String replace to rewrite both the main domain and any URL-encoded SourceUrl domains
        return urlStr.replaceAll(origHost, proxiedHost);
      }
    }
  } catch (e) {
    // ignore
  }
  return urlStr;
}

function downloadWithBrowserWindow(downloadURL, activeSession, destinationPath = null) {
  return new Promise((resolve, reject) => {
    const { tempWin, documentsDir } = createHiddenDownloadWindow(activeSession);
    if (destinationPath) {
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    }

    let downloadInitiated = false;
    let settled = false;
    let cleanupTimeout;

    const cleanup = () => {
      if (cleanupTimeout) {
        clearTimeout(cleanupTimeout);
        cleanupTimeout = null;
      }
      activeSession.removeListener("will-download", handleWillDownload);
      if (!tempWin.isDestroyed()) {
        tempWin.destroy();
      }
    };

    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    cleanupTimeout = setTimeout(() => {
      fail(new Error("Download timed out (no download started within 30 seconds)"));
    }, 30000);

    const handleWillDownload = (event, item, webContents) => {
      if (webContents && webContents.id === tempWin.webContents.id) {
        downloadInitiated = true;
        // The navigation did its job; give the transfer itself a longer
        // backstop so a stalled download can't leak the hidden window and
        // the session listener forever.
        if (cleanupTimeout) {
          clearTimeout(cleanupTimeout);
        }
        cleanupTimeout = setTimeout(() => {
          fail(new Error("Download timed out"));
        }, 10 * 60 * 1000);

        // Tell DownloadManager (which listens on the same session) to skip
        // its own save path, notifications and openWhenDone for this item.
        item.teamsForLinuxExternallyManaged = true;

        const filename = sanitizeFilename(item.getFilename(), "attachment");
        const targetFilePath = destinationPath || uniqueFilePath(documentsDir, filename);

        item.setSavePath(targetFilePath);

        // A transient "interrupted" in `updated` can auto-resume; only the
        // final state in `done` decides the outcome.
        item.once("done", (event, state) => {
          if (settled) return;
          settled = true;
          cleanup();
          if (state === "completed") {
            copyFilePathToClipboard(targetFilePath);
            resolve({ filename: path.basename(targetFilePath), targetFilePath });
          } else {
            reject(new Error(`Download failed with state: ${state}`));
          }
        });
      }
    };

    activeSession.on("will-download", handleWillDownload);

    tempWin.loadURL(downloadURL).catch((err) => {
      setTimeout(() => {
        if (!downloadInitiated) {
          fail(new Error(`Failed to load URL: ${err.message}`));
        }
      }, 500);
    });
  });
}

module.exports = {
  copyAttachmentAsFile,
  // Exported for unit tests:
  getDirectDownloadUrl,
  getSharePointDownloadUrl,
  applyMcasProxy,
  isTextFile,
  sanitizeFilename,
  uniqueFilePath,
  isMicrosoftHost,
  stripViewerTitleSuffix,
  copyFilePathToClipboard,
};
