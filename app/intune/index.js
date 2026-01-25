const dbus = require("@homebridge/dbus-native");

let inTuneAccount = null;
let brokerVersion = null;
let isNewBroker = false;

// D-Bus connection constants
const BROKER_SERVICE = "com.microsoft.identity.broker1";
const BROKER_PATH = "/com/microsoft/identity/broker1";
const BROKER_INTERFACE = "com.microsoft.identity.Broker1";
const PROTOCOL_VERSION = "0.0";

// Get session bus instance
const sessionBus = dbus.sessionBus();

/**
 * Invoke a D-Bus method directly without relying on introspection.
 * This is required for Microsoft Identity Broker versions > 2.0.1
 * which removed the D-Bus introspection interface.
 *
 * @param {string} methodName - The method to call on the broker interface
 * @param {object} request - The request object to send (will be JSON stringified)
 * @param {string} correlationId - Optional correlation ID for request tracking
 * @returns {Promise<string>} - The JSON response from the broker
 */
function invokeBrokerMethod(methodName, request, correlationId = "") {
  return new Promise((resolve, reject) => {
    sessionBus.invoke({
      destination: BROKER_SERVICE,
      path: BROKER_PATH,
      interface: BROKER_INTERFACE,
      member: methodName,
      signature: "sss",
      body: [PROTOCOL_VERSION, correlationId, JSON.stringify(request)]
    }, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * Detect the broker version and determine if it's a new broker (> 2.0.1).
 * New brokers require different request/response handling.
 */
async function detectBrokerVersion() {
  try {
    const resp = await invokeBrokerMethod("getLinuxBrokerVersion", {});
    const data = JSON.parse(resp);

    if (data.version) {
      brokerVersion = data.version;
      // Compare version: > 2.0.1 means new broker
      const parts = brokerVersion.split(".").map(Number);
      isNewBroker = parts[0] > 2 ||
        (parts[0] === 2 && parts[1] > 0) ||
        (parts[0] === 2 && parts[1] === 0 && parts[2] > 1);

      console.debug("[INTUNE_DIAG] Detected broker version", {
        version: brokerVersion,
        isNewBroker,
        usesDirectInvocation: true
      });
    } else {
      // If version not available, assume old broker for safety
      brokerVersion = "unknown";
      isNewBroker = false;
      console.debug("[INTUNE_DIAG] Could not detect broker version, assuming legacy broker");
    }
  } catch (error) {
    // If version detection fails, try to infer from error type
    // New brokers may still work, old brokers might fail differently
    brokerVersion = "unknown";
    isNewBroker = false;
    console.debug("[INTUNE_DIAG] Broker version detection failed", {
      error: error.message,
      assumingLegacy: true
    });
  }
}

/**
 * Extract cookie content from broker response, handling both old and new formats.
 *
 * Old broker format (≤ 2.0.1): { "cookieContent": "..." }
 * New broker format (> 2.0.1): { "cookieItems": [{ "cookieContent": "..." }] }
 *
 * @param {object} response - Parsed JSON response from broker
 * @returns {string|null} - The cookie content or null if not found
 */
function extractCookieContent(response) {
  // New format (> 2.0.1): cookieItems array
  if (response.cookieItems && Array.isArray(response.cookieItems) && response.cookieItems.length > 0) {
    return response.cookieItems[0].cookieContent;
  }

  // Old format (≤ 2.0.1): direct cookieContent
  if (response.cookieContent) {
    return response.cookieContent;
  }

  return null;
}

function processInTuneAccounts(resp, ssoInTuneAuthUser) {
  // Enhanced account processing with detailed logging
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

/**
 * Wait for the broker service to become available.
 * Uses direct D-Bus invocation to check availability without relying on introspection.
 *
 * @param {number} retries - Number of retry attempts
 * @param {number} delay - Delay between retries in milliseconds
 * @returns {Promise<void>} - Resolves when broker is ready
 */
async function waitForBrokerReady(retries, delay) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Try to get accounts as a health check - this works with all broker versions
      await invokeBrokerMethod("getAccounts", {
        clientId: "88200948-af09-45a1-9c03-53cdcc75c183",
        redirectUri: "urn:ietf:oob",
      });
      console.debug("[INTUNE_DIAG] microsoft-identity-broker D-Bus service is ready", {
        usesDirectInvocation: true
      });
      return;
    } catch (error) {
      if (error?.name === "org.freedesktop.DBus.Error.ServiceUnknown") {
        throw new Error("Broker not found, ensure it's installed");
      }

      if (attempt < retries) {
        console.debug("[INTUNE_DIAG] microsoft-identity-broker not ready, retrying", {
          attemptsRemaining: retries - attempt,
          delay: `${delay}ms`
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error || new Error("Broker D-Bus service not ready");
      }
    }
  }
}

/**
 * Get accounts from the broker using direct D-Bus invocation.
 *
 * @returns {Promise<string>} - JSON response with accounts list
 */
async function getBrokerAccountsAsync() {
  return invokeBrokerMethod("getAccounts", {
    clientId: "88200948-af09-45a1-9c03-53cdcc75c183",
    redirectUri: "urn:ietf:oob",
  });
}

exports.initSso = async function initIntuneSso(ssoInTuneAuthUser) {
  // Enhanced Intune SSO initialization logging for better diagnostics
  console.debug("[INTUNE_DIAG] Initializing InTune SSO", {
    configuredUser: ssoInTuneAuthUser || "(none - will use first available)",
    timestamp: new Date().toISOString(),
    method: "direct D-Bus invocation (supports broker > 2.0.1)"
  });

  try {
    // Wait for broker to be ready (uses direct invocation, no introspection needed)
    await waitForBrokerReady(10, 500);

    // Detect broker version to determine request/response format
    await detectBrokerVersion();

    // Get accounts using direct invocation
    const resp = await getBrokerAccountsAsync();
    processInTuneAccounts(resp, ssoInTuneAuthUser);
  } catch (err) {
    console.warn("[INTUNE_DIAG] Broker cannot initialize SSO", {
      error: err.message || err,
      suggestion: "Ensure Microsoft Identity Broker is installed and running on this system"
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

/**
 * Build the request object for acquirePrtSsoCookie based on broker version.
 *
 * Old broker (≤ 2.0.1): account at top level
 * New broker (> 2.0.1): account nested in authParameters with authorizationType
 *
 * @param {string} ssoUrl - The URL requiring SSO authentication
 * @returns {object} - The request object formatted for the current broker version
 */
function buildPrtSsoCookieRequest(ssoUrl) {
  if (isNewBroker) {
    // New broker format (> 2.0.1)
    return {
      ssoUrl: ssoUrl,
      authParameters: {
        authority: "https://login.microsoftonline.com/common/",
        account: inTuneAccount,
        authorizationType: 8  // PRT_SSO_COOKIE
      }
    };
  }
  // Old broker format (≤ 2.0.1)
  return {
    ssoUrl: ssoUrl,
    account: inTuneAccount,
    authParameters: {
      authority: "https://login.microsoftonline.com/common/",
    }
  };
}

function processPrtResponse(resp, detail) {
  // Enhanced PRT response processing with detailed logging
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
      // Extract cookie content handling both old and new response formats
      const cookieContent = extractCookieContent(response);

      if (cookieContent) {
        console.debug("[INTUNE_DIAG] Adding SSO credential to request", {
          url: detail.url,
          hasCookieContent: true,
          cookieLength: cookieContent.length,
          brokerVersion: brokerVersion || "unknown",
          responseFormat: response.cookieItems ? "new (cookieItems)" : "old (cookieContent)"
        });
        detail.requestHeaders["X-Ms-Refreshtokencredential"] = cookieContent;
      } else {
        console.warn("[INTUNE_DIAG] SSO cookie response missing cookie content", {
          url: detail.url,
          brokerVersion: brokerVersion || "unknown",
          hasError: false
        });
      }
    }
  } catch (error) {
    console.error("[INTUNE_DIAG] Error parsing PRT response", {
      error: error.message,
      url: detail.url,
      rawResponse: resp?.substring(0, 200) + (resp?.length > 200 ? "..." : "")
    });
  }
}

/**
 * Acquire PRT SSO cookie from broker using direct D-Bus invocation.
 *
 * @param {object} detail - Request detail object with URL and headers
 * @param {function} callback - Callback to invoke with modified headers
 */
async function acquirePrtSsoCookieFromBroker(detail, callback) {
  console.debug("[INTUNE_DIAG] Acquiring PRT SSO cookie from broker", {
    url: detail.url,
    account: inTuneAccount.username,
    brokerVersion: brokerVersion || "unknown",
    isNewBroker
  });

  try {
    const request = buildPrtSsoCookieRequest(detail.url);
    const resp = await invokeBrokerMethod("acquirePrtSsoCookie", request);

    console.debug("[INTUNE_DIAG] PRT SSO cookie request completed", {
      url: detail.url,
      hasResponse: !!resp
    });

    processPrtResponse(resp, detail);
  } catch (err) {
    console.warn("[INTUNE_DIAG] Failed to acquire PRT SSO cookie", {
      error: err.message || err,
      url: detail.url,
      account: inTuneAccount.username
    });
  }

  callback({
    requestHeaders: detail.requestHeaders,
  });
}

exports.addSsoCookie = function addIntuneSsoCookie(detail, callback) {
  // Enhanced SSO cookie retrieval with comprehensive logging
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

  // Use direct D-Bus invocation (supports all broker versions including > 2.0.1)
  acquirePrtSsoCookieFromBroker(detail, callback).catch(error => {
    console.error("[INTUNE_DIAG] Unexpected error during SSO cookie retrieval", {
      error: error.message,
      url: detail.url,
      stack: error.stack
    });
    callback({
      requestHeaders: detail.requestHeaders,
    });
  });
};
