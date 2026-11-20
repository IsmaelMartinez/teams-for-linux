// The asyncgw subdomain is the tenant's region, for example no-prod.
function isUrlPreviewRequest(url) {
  if (!url?.includes('/urlp/v1/url/richInfo')) return false;
  try {
    const { hostname, pathname } = new URL(url);
    return pathname === '/urlp/v1/url/richInfo' && hostname.endsWith('.asyncgw.teams.microsoft.com');
  } catch {
    return false;
  }
}

// For multi-account profile sessions only: Electron keeps one onBeforeRequest
// listener per session, so on the root session this would replace
// onBeforeRequestHandler, which does the same check itself.
function blockUrlPreviews(profileSession, config) {
  if (!config?.platform?.disableUrlPreviews) return;
  profileSession.webRequest.onBeforeRequest(
    { urls: ['https://*.asyncgw.teams.microsoft.com/*'] },
    (details, callback) => callback({ cancel: isUrlPreviewRequest(details.url) })
  );
}

module.exports = { isUrlPreviewRequest, blockUrlPreviews };
