# Certificate

This folder contains the handlers for certicate.

You can define the valid certificates by prodiving the customCACertsFingerprints config option.

Further information about config options can be found in the [config README.md file](../config/README.md).

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
