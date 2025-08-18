# Logging Configuration

Control logging behavior with console logging, [electron-log](https://www.npmjs.com/package/electron-log) integration, or disable logging entirely (since v1.9.0).

:::info
See [Configuration Documentation](configuration.md) for all available configuration options.
:::

## Configuration Options

This behavior is controlled by the `logConfig` option, which accepts the following values:

| Option | Description |
|--------|-------------|
| **Falsy value** | Any falsy value (see [MDN Falsy](https://developer.mozilla.org/en-US/docs/Glossary/Falsy)) results in no logs being recorded. |
| **`"console"`** | Logs messages to the console using the built-in `console` object. |
| **`{}` (JSONObject, default)** | A valid configuration object for [electron-log](https://www.npmjs.com/package/electron-log). This object defines how logs are handled. |

:::note Configuration Reference
The JSON object provided for electron-log must follow the configuration options specified in the [electron-log documentation](https://www.npmjs.com/package/electron-log).
:::

## Configuration Examples

### Default Configuration

The default configuration sets the console logging level to `info` and disables file logging:

```json
{
  "logConfig": {
    "transports": {
      "console": {
        "level": "info"
      },
      "file": {
        "level": false
      }
    }
  }
}
```

### Minimal Configuration

Simply provide an empty object to use the default electron-log settings:

```json
{
  "logConfig": {}
}
```

### Advanced Configuration

Customize the console log format and enable file logging with rotation:

```json
{
  "logConfig": {
    "transports": {
      "file": {
        "maxSize": 100000,
        "format": "{processType} [{h}:{i}:{s}.{ms}] {text}",
        "level": "debug"
      },
      "console": {
        "format": "[{h}:{i}:{s}.{ms}] {text}",
        "level": "info"
      }
    }
  }
}
```

### Debug Configuration

For troubleshooting, enable verbose debug logging:

```json
{
  "logConfig": {
    "transports": {
      "console": {
        "level": "debug"
      },
      "file": {
        "level": "debug",
        "maxSize": 1000000
      }
    }
  }
}
```

## Command Line Usage

You can also configure logging via command line arguments:

```bash
# Enable debug logging
teams-for-linux --logConfig='{"transports":{"console":{"level":"debug"}}}'

# Disable all logging
teams-for-linux --logConfig=false

# Use console logging only
teams-for-linux --logConfig="console"
```

## Log Levels

Available log levels (in order of verbosity):

1. **error** - Only error messages
2. **warn** - Warnings and errors  
3. **info** - Informational messages, warnings, and errors
4. **verbose** - Detailed information for troubleshooting
5. **debug** - All messages including debug information
6. **silly** - Maximum verbosity (not recommended for production)

## File Logging Options

When using file transport, you can configure:

| Option | Description | Default |
|--------|-------------|---------|
| `level` | Minimum log level to record | `"info"` |
| `maxSize` | Maximum file size in bytes | `1048576` (1MB) |
| `format` | Log message format string | `"[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}"` |
| `fileName` | Log file name | `"main.log"` |

## Troubleshooting Logging

### Common Issues

#### Logs Not Appearing
1. **Check log level**: Ensure the configured level includes your message level
2. **Verify configuration**: Validate JSON syntax in logConfig
3. **File permissions**: Ensure write access to log directory

#### Large Log Files
1. **Set maxSize**: Configure file rotation with appropriate size limits
2. **Adjust log level**: Use less verbose levels in production
3. **Regular cleanup**: Implement log file rotation and cleanup

### Debug Information

To diagnose logging issues, temporarily enable debug mode:

```bash
teams-for-linux --logConfig='{"transports":{"console":{"level":"debug"}}}'
```

## Limitations

:::warning Limitations
Not all options available in [electron-log](https://github.com/megahertz/electron-log) have been fully tested, especially those that require a function as a configuration value.
:::

## Related Documentation

- [Configuration Options](configuration.md) - Complete configuration reference
- [Troubleshooting](troubleshooting.md) - General troubleshooting guide