# Config

This folder contains the configuration options available for the app. You can
see this options by running the app with the `--help` flag.

```bash
teams-for-linux --help
```

This folder contains the configuration options available for the app. It is responsible for loading configuration from `config.json` and parsing command-line arguments using `yargs`.

For a comprehensive list of all available configuration options, their types, default values, and descriptions, please refer to the [Configuration Documentation](../../docs/configuration.md).

# Additional Documentation

The Teams for Linux project includes several extra features that enhance its
functionality. For detailed instructions on each feature, please refer to the
corresponding documentation:

- **Multiple Teams Instances:**  
  If you want to run multiple instances of Teams for Linux simultaneously, refer
  to the [Multiple Instances Documentation](../../docs/multiple-instances.md).

- **Custom Backgrounds:**  
  To set up custom background images during video calls, please review the
  [Custom Backgrounds Documentation](../../docs/custom-backgrounds.md).

- **LogConfig:**  
  For details on configuring logging behavior—including options to log to the
  console or use electron-log—see the [LogConfig Documentation](../../docs/log-config.md).

- **Custom CA Certs:**  
  To retrieve custom CA certificates fingerprints, please see the
  [Certificate Documentation](../../docs/certificate.md).

- **Cache Management:**  
  To configure automatic cache cleanup to prevent daily logout issues, please see the
  [Cache Manager Documentation](../../docs/cache-manager.md).
