# Config

This folder contains the configuration options available for the app.

## Available starting arguments

The application uses [yargs](https://www.npmjs.com/package/yargs) to allow command line arguments.

Here is the list of available arguments and its usage:

| Option | Usage | Default Value |
|:-:|:-:|:-:|
| help  | show the available commands | false |
| version | show the version number | false |
| onlineOfflineReload | Reload page when going from offline to online | true |
| disableDesktopNotificationsHack | disable electron-desktop-notifications extension hack | false |
| closeAppOnCross | Close the app when clicking the close (X) cross | false |
| partition | [BrowserWindow](https://electronjs.org/docs/api/browser-window) webpreferences partition | persist:teams-4-linux |
| webDebug | start with the browser developer tools open  |  false |
| url | url to open | https://teams.microsoft.com/ |
| config | config file location | ~/.config/teams-for-linux/config.json |
| chromeUserAgent | user agent string for chrome | Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.80 Safari/537.36 |
| ntlmV2enabled | set enable-ntlm-v2 value | true |
| authServerWhitelist | set auth-server-whitelist value | * |
| customCSSName | Custom CSS name for the packaged available css files. Currently those are: "compactDark", "compactLight", "tweaks", "condensedDark" and "condensedLight" | |
| customCSSLocation | Location for custom CSS styles | |
| customCACertsFingerprints | custom CA Certs Fingerprints to allow SSL unrecognized signer or self signed certificate (see below) | [] |

As an example, to disable the persitence, you can run the following command:

```bash
teams-for-linux --partition nopersist
```

Alternatively, you can use a file called `config.json` with the configuration options. This file needs to be located in `~/.config/teams-for-linux/config.json`

[yargs](https://www.npmjs.com/package/yargs) allows for extra modes of configuration. Refer to their documentation if you prefer to use a configuration file instead of arguments.

## Getting custom CA Certs fingerprints

The expected fingerprints are of the form `sha256/<base64 encoded sha256sum>`. Tools like openssl usually deliver the sha256sum
 encoded in hexadecimal format. If you have access to the nodejs console, the fingerprint of the CA that cannot be validated
 will be printed out. You can then start teams-for-linux again with

```bash
teams-for-linux --customCACertsFingerprints sha256//L/iiGIG9ysnWTyLBwKX4S12ntEO15MHBagJjv/BTRc= [--customCACertsFingerprints otherfingerprint]`
```

If you already have the certificate in a file locally, you can calculate the expected fingerprint with the following command:

```bash
echo sha256/$(openssl x509 -in /path/to/certificate -noout -fingerprint -sha256 | sed -e "s/^.*=//g" -e "s/://g" | xxd -r -p | base64)
```

To have your custom certs recognized on every run, add them to your `~/.config/teams-for-linux/config.json`

```json
{
    "customCACertsFingerprints": [
        "sha256//L/iiGIG9ysnWTyLBwKX4S12ntEO15MHBagJjv/BTRc=",
        "sha256/QNUEPU40JDSrRcW9CSWsPKJ5llVjGcc1AnsIkCF9KV4="
    ]
}
```
