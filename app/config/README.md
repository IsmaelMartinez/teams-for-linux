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
  to the [Multiple Instances README](MULTIPLE_INSTANCES.md).

- **Custom Backgrounds:**  
  To set up custom background images during video calls, please review the
  [Custom Backgrounds README](../customBackground/README.md).

- **LogConfig:**  
  For details on configuring logging behavior—including options to log to the
  console or use electron-log—see the [LogConfig README](LOG_CONFIG.md).

- **Custom CA Certs:**  
  To retrieve custom CA certificates fingerprints, please see the
  [Certificate README](../certificate/README.md).

- **Cache Management:**  
  To configure automatic cache cleanup to prevent daily logout issues, please see the
  [Cache Manager README](../cacheManager/README.md).
