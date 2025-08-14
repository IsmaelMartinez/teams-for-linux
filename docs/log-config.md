# Logging Configuration

Control logging behavior with console logging, [electron-log](https://www.npmjs.com/package/electron-log) integration, or disable logging entirely (since v1.9.0).

This behavior is controlled by the `logConfig` option, which accepts the
following values:

| Option                         | Description                                                                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Falsy value**                | Any falsy value (see [MDN Falsy](https://developer.mozilla.org/en-US/docs/Glossary/Falsy)) results in no logs being recorded.          |
| **`"console"`**                | Logs messages to the console using the built-in `console` object.                                                                      |
| **`{}` (JSONObject, default)** | A valid configuration object for [electron-log](https://www.npmjs.com/package/electron-log). This object defines how logs are handled. |

> **Note:** The JSON object provided for electron-log must follow the
> configuration options specified in the
> [electron-log documentation](https://www.npmjs.com/package/electron-log).

## Examples of `electron-log` Configuration Options

Here are some examples to help you configure logging:

### Default Configuration Example

The default configuration sets the console logging level to `info` and disables
file logging:

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

### Using the Default Configuration

Simply provide an empty object to use the default electron-log settings:

{ "logConfig": {} }

### Complex Configuration Example

Customize the console log format and enable file logging with log rotation:

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

# Limitations

Not all options available in
[electron-log](https://github.com/megahertz/electron-log) have been fully
tested, especially those that require a function as a configuration value.
