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
teams-for-linux --customCACertsFingerprints sha256//L/iiGIG9ysnWTyLBwKX4S12ntEO15MHBagJjv/BTRc= [--customCACertsFingerprints otherfingerprint]
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
    "sha256//L/iiGIG9ysnWTyLBwKX4S12ntEO15MHBagJjv/BTRc=",
    "sha256/QNUEPU40JDSrRcW9CSWsPKJ5llVjGcc1AnsIkCF9KV4="
  ]
}
```

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
    "sha256//your-corporate-proxy-cert-fingerprint"
  ],
  "proxyServer": "proxy.company.com:8080"
}
```

### Multiple Certificate Authorities

For environments with multiple custom CAs:

```json
{
  "customCACertsFingerprints": [
    "sha256//root-ca-fingerprint",
    "sha256//intermediate-ca-fingerprint",
    "sha256//proxy-ca-fingerprint"
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
   teams-for-linux --logConfig='{"level":"debug"}'
   ```

2. **Check the certificate chain** with openssl:
   ```bash
   openssl s_client -connect teams.microsoft.com:443 -showcerts
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