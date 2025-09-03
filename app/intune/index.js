const dbus = require("@homebridge/dbus-native");

let inTuneAccount = null;
const brokerService = dbus
  .sessionBus()
  .getService("com.microsoft.identity.broker1");

function processInTuneAccounts(resp, ssoInTuneAuthUser) {
  // v2.5.4: Enhanced account processing with detailed logging
  try {
    const response = JSON.parse(resp);
    
    if ("error" in response) {
      console.warn("[INTUNE_DIAG] Failed to retrieve InTune account list", {
        error: response.error.context,
        errorCode: response.error.code || "unknown",
        suggestion: "Check if Microsoft Identity Broker has valid accounts configured"
      });
      return;
    }

    console.debug("[INTUNE_DIAG] Retrieved InTune accounts", {
      totalAccounts: response.accounts?.length || 0,
      requestedUser: ssoInTuneAuthUser || "(none - will use first)",
      availableUsers: response.accounts?.map(acc => acc.username) || []
    });

    if (!response.accounts || response.accounts.length === 0) {
      console.warn("[INTUNE_DIAG] No InTune accounts found", {
        suggestion: "Configure Microsoft Identity Broker with valid Intune accounts"
      });
      return;
    }

    if (ssoInTuneAuthUser == "") {
      inTuneAccount = response.accounts[0];
      console.debug("[INTUNE_DIAG] Using first available InTune account", {
        selectedUser: inTuneAccount.username,
        accountType: inTuneAccount.accountType || "unknown",
        totalAvailable: response.accounts.length
      });
    } else {
      for (const account of response.accounts) {
        if (account.username == ssoInTuneAuthUser) {
          inTuneAccount = account;
          console.debug("[INTUNE_DIAG] Found matching InTune account", {
            selectedUser: inTuneAccount.username,
            accountType: inTuneAccount.accountType || "unknown"
          });
          break;
        }
      }
      
      if (inTuneAccount == null) {
        console.warn("[INTUNE_DIAG] Failed to find matching InTune account", {
          requestedUser: ssoInTuneAuthUser,
          availableUsers: response.accounts.map(acc => acc.username),
          suggestion: `Either configure '${ssoInTuneAuthUser}' in Identity Broker or use one of the available accounts`
        });
      }
    }

    if (inTuneAccount) {
      console.info("[INTUNE_DIAG] InTune SSO account configured successfully", {
        user: inTuneAccount.username,
        ready: true
      });
    }
    
  } catch (error) {
    console.error("[INTUNE_DIAG] Error parsing InTune accounts response", {
      error: error.message,
      rawResponse: resp?.substring(0, 200) + (resp?.length > 200 ? "..." : "")
    });
  }
}

exports.initSso = function initIntuneSso(ssoInTuneAuthUser) {
  // v2.5.4: Enhanced Intune SSO initialization logging for better diagnostics
  console.debug("[INTUNE_DIAG] Initializing InTune SSO", {
    configuredUser: ssoInTuneAuthUser || "(none - will use first available)",
    timestamp: new Date().toISOString()
  });

  // Check if the D-Bus system is available
  try {
    brokerService.getInterface(
      "/com/microsoft/identity/broker1",
      "com.microsoft.identity.Broker1",
      function (err, broker) {
        if (err) {
          console.warn("[INTUNE_DIAG] Failed to find microsoft-identity-broker DBus interface", {
            error: err.message || err,
            suggestion: "Ensure Microsoft Identity Broker is installed and running on this system"
          });
          return;
        }

        console.debug("[INTUNE_DIAG] Successfully connected to Microsoft Identity Broker D-Bus interface");

        broker.getAccounts(
          "0.0",
          "",
          JSON.stringify({
            clientId: "88200948-af09-45a1-9c03-53cdcc75c183",
            redirectUri: "urn:ietf:oob",
          }),
          function (err, resp) {
            if (err) {
              console.warn("[INTUNE_DIAG] Failed to communicate with microsoft-identity-broker", {
                error: err.message || err,
                suggestion: "Check if the Identity Broker service is responding correctly"
              });
              return;
            }
            
            console.debug("[INTUNE_DIAG] Successfully retrieved accounts from Identity Broker");
            processInTuneAccounts(resp, ssoInTuneAuthUser);
          },
        );
      },
    );
  } catch (error) {
    console.error("[INTUNE_DIAG] Unexpected error during InTune SSO initialization:", {
      error: error.message,
      stack: error.stack,
      suggestion: "This may indicate a system-level D-Bus or Identity Broker issue"
    });
  }
};

exports.setupUrlFilter = function setupUrlFilter(filter) {
  filter.urls.push("https://login.microsoftonline.com/*");
};

exports.isSsoUrl = function isSsoUrl(url) {
  return (
    inTuneAccount != null &&
    url.startsWith("https://login.microsoftonline.com/")
  );
};

function processPrtResponse(resp, detail) {
  // v2.5.4: Enhanced PRT response processing with detailed logging
  try {
    const response = JSON.parse(resp);
    if ("error" in response) {
      console.warn("[INTUNE_DIAG] Failed to retrieve Intune SSO cookie", {
        error: response.error.context,
        errorCode: response.error.code || "unknown",
        url: detail.url,
        suggestion: "Check if the account has valid PRT tokens or needs reauthentication"
      });
    } else {
      console.debug("[INTUNE_DIAG] Adding SSO credential to request", {
        url: detail.url,
        hasCookieContent: !!response["cookieContent"],
        cookieLength: response["cookieContent"]?.length || 0
      });
      detail.requestHeaders["X-Ms-Refreshtokencredential"] =
        response["cookieContent"];
    }
  } catch (error) {
    console.error("[INTUNE_DIAG] Error parsing PRT response", {
      error: error.message,
      url: detail.url,
      rawResponse: resp?.substring(0, 200) + (resp?.length > 200 ? "..." : "")
    });
  }
}

exports.addSsoCookie = function addIntuneSsoCookie(detail, callback) {
  // v2.5.4: Enhanced SSO cookie retrieval with comprehensive logging
  console.debug("[INTUNE_DIAG] Retrieving InTune SSO cookie", {
    url: detail.url,
    hasAccount: !!inTuneAccount,
    accountUser: inTuneAccount?.username || "none"
  });

  if (inTuneAccount == null) {
    console.info("[INTUNE_DIAG] InTune SSO not active - no account configured", {
      url: detail.url,
      suggestion: "Ensure InTune SSO is properly initialized and has valid accounts"
    });
    callback({
      requestHeaders: detail.requestHeaders,
    });
    return;
  }

  try {
    brokerService.getInterface(
      "/com/microsoft/identity/broker1",
      "com.microsoft.identity.Broker1",
      function (err, broker) {
        if (err) {
          console.warn("[INTUNE_DIAG] Failed to get broker interface for SSO cookie", {
            error: err.message || err,
            url: detail.url
          });
          callback({
            requestHeaders: detail.requestHeaders,
          });
          return;
        }

        console.debug("[INTUNE_DIAG] Acquiring PRT SSO cookie from broker", {
          url: detail.url,
          account: inTuneAccount.username
        });

        broker.acquirePrtSsoCookie(
          "0.0",
          "",
          JSON.stringify({
            ssoUrl: detail.url,
            account: inTuneAccount,
            authParameters: {
              authority: "https://login.microsoftonline.com/common/",
            },
          }),
          function (err, resp) {
            if (err) {
              console.warn("[INTUNE_DIAG] Failed to acquire PRT SSO cookie", {
                error: err.message || err,
                url: detail.url,
                account: inTuneAccount.username
              });
            } else {
              console.debug("[INTUNE_DIAG] PRT SSO cookie request completed", {
                url: detail.url,
                hasResponse: !!resp
              });
            }
            
            processPrtResponse(resp, detail);
            callback({
              requestHeaders: detail.requestHeaders,
            });
          },
        );
      },
    );
  } catch (error) {
    console.error("[INTUNE_DIAG] Unexpected error during SSO cookie retrieval", {
      error: error.message,
      url: detail.url,
      stack: error.stack
    });
    callback({
      requestHeaders: detail.requestHeaders,
    });
  }
};
