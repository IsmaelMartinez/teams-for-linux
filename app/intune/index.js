const dbus = require("@homebridge/dbus-native");

let inTuneAccount = null;
const brokerService = dbus
  .sessionBus()
  .getService("com.microsoft.identity.broker1");

function processInTuneAccounts(resp, ssoInTuneAuthUser) {
  const response = JSON.parse(resp);
  if ("error" in response) {
    console.warn(
      "Failed to retrieve InTune account list: " + response.error.context,
    );
    return;
  }

  if (ssoInTuneAuthUser == "") {
    inTuneAccount = response.accounts[0];
    console.debug(
      "Using first available InTune account (" + inTuneAccount.username + ")",
    );
  } else {
    for (const account of response.accounts) {
      if (account.username == ssoInTuneAuthUser) {
        inTuneAccount = account;
        console.debug(
          "Found matching InTune account (" + inTuneAccount.username + ")",
        );
        break;
      }
    }
    if (inTuneAccount == null) {
      console.warn(
        "Failed to find matching InTune account for " + ssoInTuneAuthUser + ".",
      );
    }
  }
}

function waitForBrokerInterfaceAsync(retries, delay) {
  return new Promise((resolve, reject) => {
    function attempt(remaining) {
      brokerService.getInterface(
        "/com/microsoft/identity/broker1",
        "com.microsoft.identity.Broker1",
        function (err, broker) {
          if (!err && broker) {
            console.debug("microsoft-identity-broker DBus interface is ready");
            return resolve(broker);
          }

          if (err?.name === "org.freedesktop.DBus.Error.ServiceUnknown") {
            return reject(new Error("not found, ensure it's installed"));
          }

          if (remaining > 0) {
            console.debug(
              `microsoft-identity-broker interface not ready, retrying in ${delay}ms (${remaining} attempts left)`
            );
            setTimeout(() => attempt(remaining - 1), delay);
          } else {
            return reject(err || new Error("Interface not ready"));
          }
        }
      );
    }

    attempt(retries);
  });
}

function getBrokerAccountsAsync(broker) {
  return new Promise((resolve, reject) => {
    broker.getAccounts(
      "0.0",
      "",
      JSON.stringify({
        clientId: "88200948-af09-45a1-9c03-53cdcc75c183",
        redirectUri: "urn:ietf:oob",
      }),
      (err, resp) => {
        if (err) return reject(err);
        resolve(resp);
      }
    );
  });
}

exports.initSso = async function initIntuneSso(ssoInTuneAuthUser) {
  console.debug("Initializing InTune SSO");

  try {
    const broker = await waitForBrokerInterfaceAsync(10, 500);
    const resp = await getBrokerAccountsAsync(broker);
    processInTuneAccounts(resp, ssoInTuneAuthUser);
  } catch (err) {
    console.warn(`Broker ${err.message}, cannot initialize SSO`);
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
  const response = JSON.parse(resp);
  if ("error" in response) {
    console.warn(
      "Failed to retrieve Intune SSO cookie: " + response.error.context,
    );
  } else {
    console.debug("Adding SSO credential");
    detail.requestHeaders["X-Ms-Refreshtokencredential"] =
      response["cookieContent"];
  }
}

exports.addSsoCookie = function addIntuneSsoCookie(detail, callback) {
  console.debug("Retrieving InTune SSO cookie");
  if (inTuneAccount == null) {
    console.info("InTune SSO not active");
    callback({
      requestHeaders: detail.requestHeaders,
    });
    return;
  }
  brokerService.getInterface(
    "/com/microsoft/identity/broker1",
    "com.microsoft.identity.Broker1",
    function (_err, broker) {
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
        function (_err, resp) {
          processPrtResponse(resp, detail);
          callback({
            requestHeaders: detail.requestHeaders,
          });
        },
      );
    },
  );
};
