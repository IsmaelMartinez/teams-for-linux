# Certificate Management

Configure custom CA certificates for corporate environments and self-signed certificates.

:::note
See [Configuration Documentation](configuration.md) for all available options.
:::

## Getting custom CA Certs fingerprints

The expected fingerprints are of the form `sha256/<base64 encoded sha256sum>`.
Tools like openssl usually deliver the sha256sum encoded in hexadecimal format.
If you have access to the nodejs console, the fingerprint of the CA that cannot
be validated will be printed out. You can then start teams-for-linux again with

```bash
teams-for-linux --customCACertsFingerprints sha256/YOUR-CERTIFICATE-FINGERPRINT [--customCACertsFingerprints ANOTHER-FINGERPRINT-IF-NEEDED]
```

If you already have the certificate in a file locally, you can calculate the
expected fingerprint with the following command:

```bash
echo sha256/$(openssl x509 -in /path/to/certificate -noout -fingerprint -sha256 | sed -e "s/^.*=//g" -e "s/://g" | xxd -r -p | base64)
```

To have your custom certs recognized on every run, add them to your
`~/.config/teams-for-linux/config.json`

```json
{
  "customCACertsFingerprints": [
    "sha256/YOUR-CERTIFICATE-FINGERPRINT-HERE",
    "sha256/ANOTHER-CERTIFICATE-FINGERPRINT-IF-NEEDED"
  ]
}
```

## Linux: the system CA store is not enough

On Linux, Chromium (and therefore Electron, and therefore this app) does not read the
system OpenSSL trust store. It reads a per-user [NSS shared database](https://wiki.mozilla.org/NSS_Shared_DB_And_LINUX)
plus a single PKCS#11 module loaded by filename, `libnssckbi.so`.

The practical consequence differs by distribution:

*   **Debian and Ubuntu** ship the stock NSS built-in roots module. Installing a CA into
    `/usr/local/share/ca-certificates/` and running `update-ca-certificates` has **no effect**
    on this app. You must import the certificate into the NSS database yourself, as below.
    ([Debian bug 704180](https://bugs.debian.org/704180) tracks changing this, open since 2013.)
*   **Fedora, RHEL and openSUSE** replace `libnssckbi.so` with `p11-kit-trust` through
    `update-alternatives`, so certificates added with `update-ca-trust` are picked up
    automatically for every user and no extra step is needed.

:::note
`customCACertsFingerprints` is checked on every TLS verification, so it also covers a proxy
that intercepts every connection. Importing the CA into NSS, as below, is still the stricter
option: the allowlist accepts the connection outright, which also bypasses Chromium's
hostname check for it, whereas a CA trusted through NSS keeps every other check in place.
Prefer the NSS import where you can, and use the allowlist when you cannot modify the trust
store.
:::

### Importing a corporate CA into the NSS database

Install the NSS tools first: `libnss3-tools` on Debian/Ubuntu, `nss-tools` on Fedora,
`mozilla-nss-tools` on openSUSE.

If you already have the CA certificate as a file, skip to the import in step 4 and point
`-i` at your own file. Otherwise capture the chain the proxy presents:

```bash
# 1. Capture the chain (any HTTPS host works)
openssl s_client -connect teams.cloud.microsoft:443 -servername teams.cloud.microsoft \
  -showcerts </dev/null 2>/dev/null > raw.txt

# 2. Split it into individual PEM files
awk 'BEGIN{n=-1} /-----BEGIN CERTIFICATE-----/{n++} n>=0{print > sprintf("chain-%02d.pem",n)}' raw.txt

# 3. Identify them (the self-signed one, where subject equals issuer, is the root)
for f in chain-*.pem; do printf "%s : " "$f"; openssl x509 -in "$f" -noout -subject -issuer; done

# 4. Import the root as a trusted SSL CA, and any intermediate untrusted
certutil -d sql:$HOME/.pki/nssdb -A -n "CorpRootCA"  -t "C,,"  -a -i chain-02.pem
certutil -d sql:$HOME/.pki/nssdb -A -n "CorpProxyCA" -t ",,"   -a -i chain-01.pem
```

The trust flags matter. `C,,` marks the root as trusted for issuing SSL server certificates,
which is the minimum this needs. An intermediate is imported with `,,` so it can be used to
build the chain without itself becoming a trust anchor. Avoid broader flags such as `CT,C,C`,
which would additionally trust the certificate for email and object signing.

Restart Teams for Linux afterwards. You can confirm what is trusted with
`certutil -d sql:$HOME/.pki/nssdb -L`.

Importing the intermediate as well as the root matters when the proxy serves an incomplete
chain. Chromium only follows plain `http` AIA URLs to fetch a missing issuer, so a proxy
that publishes an `https` AIA URL (or none) leaves the chain unbuildable unless the
intermediate is present locally.

#### Which database path to use

Since Chromium 146 the default database is `${XDG_DATA_HOME:-$HOME/.local/share}/pki/nssdb`.
The legacy `~/.pki/nssdb` is still preferred when that directory already exists, which is why
the commands above work: `certutil` creates it, and the app then uses it on the next start.
On a profile where `~/.pki/nssdb` was never created, the app reads the newer location, so
adjust the `-d sql:` path if you want to import there instead.

#### Confined packages

Snap and Flatpak remap `HOME`, so the database lives inside the app's own directory. Both
candidate paths above still apply, just relative to the remapped home:

*   **Snap:** `~/snap/teams-for-linux/current/.pki/nssdb`, or
    `~/snap/teams-for-linux/current/.local/share/pki/nssdb`
*   **Flatpak:** `~/.var/app/com.github.IsmaelMartinez.teams_for_linux/.pki/nssdb`, or
    `~/.var/app/com.github.IsmaelMartinez.teams_for_linux/data/pki/nssdb`

The config file is remapped the same way, which is a common reason
`customCACertsFingerprints` looks like it is being ignored on these packages. See
[Configuration](configuration.md) for the config locations.

## Corporate Certificate Scenarios

### Self-Signed Certificates

For development or internal environments using self-signed certificates:

1. **Extract the certificate fingerprint** using the command above
2. **Add to configuration** in your config.json
3. **Restart Teams for Linux** to apply the new certificate trust

### Corporate Proxy Certificates

Many corporate environments use proxy servers with custom certificates:

```json
{
  "customCACertsFingerprints": [
    "sha256/YOUR-CORPORATE-PROXY-CERT-FINGERPRINT"
  ],
  "proxyServer": "proxy.company.com:8080"
}
```

### Multiple Certificate Authorities

For environments with multiple custom CAs:

```json
{
  "customCACertsFingerprints": [
    "sha256/YOUR-ROOT-CA-FINGERPRINT",
    "sha256/YOUR-INTERMEDIATE-CA-FINGERPRINT",
    "sha256/YOUR-PROXY-CA-FINGERPRINT"
  ]
}
```

## Troubleshooting Certificate Issues

### Common Certificate Errors

#### SSL Certificate Verification Failed
```
Error: certificate verify failed: self signed certificate in certificate chain
```

**Solution**: Add the self-signed certificate fingerprint to `customCACertsFingerprints`.

#### Unknown Certificate Authority
```
Error: certificate verify failed: unable to get local issuer certificate
```

**Solution**: Add your corporate CA certificate fingerprint to the configuration.

### Debugging Certificate Issues

1. **Enable debug logging** to see certificate details:
   ```bash
   ELECTRON_ENABLE_LOGGING=true teams-for-linux
   ```

2. **Check the certificate chain** with openssl:
   ```bash
   openssl s_client -connect teams.cloud.microsoft:443 -showcerts
   ```

3. **Verify your fingerprint calculation** matches the expected format.

### Security Considerations

:::warning Security Notice
- Only add certificate fingerprints from trusted sources
- Regularly review and update certificate fingerprints
- Remove fingerprints for expired or revoked certificates
- Consider using corporate certificate management tools
:::

## Related Documentation

- [Configuration Options](configuration.md) - Complete configuration reference
- [Troubleshooting](troubleshooting.md) - General troubleshooting guide