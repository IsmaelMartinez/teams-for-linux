# Config Module

Handles loading configuration from `config.json` and parsing command-line arguments using `yargs`. `validator.js` warns about unknown keys, type mismatches, and invalid values at startup — see [Startup Validation](../../docs-site/docs/configuration.md#startup-validation). `deprecation.js` builds the startup warning for deprecated options as a single aggregated message covering the config file, command-line flags and environment variables, which `app/config/index.js` logs and adds to the acknowledge-once Configuration Warning modal. `renames.js` projects nested names from all three sources onto the flat keys modules read, command line over environment over config file.

## Usage

View all available options:
```bash
teams-for-linux --help
```

## Configuration

See [`../../docs-site/docs/configuration.md`](../../docs-site/docs/configuration.md) for complete configuration documentation including:

- Configuration file locations and precedence
- All available options with defaults
- Feature-specific settings (custom backgrounds, certificates, cache management, etc.)
- Command-line argument examples
