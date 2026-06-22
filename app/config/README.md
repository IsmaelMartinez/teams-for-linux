# Config Module

Handles loading configuration from `config.json` and parsing command-line arguments using `yargs`. `validator.js` warns about unknown keys, type mismatches, and invalid values at startup — see [Startup Validation](../../docs-site/docs/configuration.md#startup-validation).

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
