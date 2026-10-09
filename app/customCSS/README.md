# Custom CSS Module

Provides custom styling capabilities for the Teams interface and its iframe content. CSS selection and discovery are separate from injection.

## Configuration Options

- **`appearance.cssLocation`**: Path to custom CSS file
- **`appearance.cssName`**: Built-in theme name or `custom:<id>` for a discovered user theme

`appearance.cssName` takes precedence over `appearance.cssLocation`. Existing built-in names and deprecated `customCSSName` / `customCSSLocation` aliases remain supported. Theme settings are restart-only; the native **Settings → Theme** menu persists selection through `AppConfiguration` and offers a restart.

## Available Themes

- `compactDark`, `compactLight`: Compact interface variants
- `condensedDark`, `condensedLight`: Condensed layout variants
- `tweaks`: General UI improvements

Themes sourced from [userstyles.org](https://userstyles.org). See [issue #77](https://github.com/IsmaelMartinez/teams-for-linux/issues/77) for adding new themes.

These styles do not set Teams' own dark/light preference. Users can choose it in Teams or enable `appearance.followSystemTheme`.

## User Theme Discovery

User themes live under `<configPath>/themes/`, using the application's existing configuration path rather than an installation-specific path. Each immediate child directory contains metadata and a CSS file:

```text
themes/
  my-theme/
    theme.json
    theme.css
```

Minimum `theme.json`:

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "css": "theme.css"
}
```

Optional string metadata fields are `author`, `version`, and `description`. The `id` is the stable persisted identity; the folder name and display `name` may change independently. IDs begin with a letter or digit and contain only letters, digits, dots, underscores, or hyphens. Metadata files are limited to 64 KiB.

Discovery runs at startup and accepts only valid local themes. It does not recursively scan subdirectories or load JavaScript. CSS must resolve to a file inside its theme folder: absolute paths, parent traversal, and escaping symlinks are rejected. Invalid metadata, missing CSS, and unsafe paths produce concise warnings and do not block startup. Built-in IDs are reserved; duplicate custom IDs resolve deterministically to the first valid folder in sorted folder-name order.

## Selection and Fallback

The native **Settings → Theme** menu lists **Default**, **Built-in**, and **Custom** choices using human-readable names. It also provides **Open themes folder**. Installing, removing, or updating themes requires a restart; no filesystem watching is used.

Selecting a theme saves only the relevant theme settings and preserves the rest of `config.json`. A custom selection uses `appearance.cssName: "custom:my-theme"`; built-ins retain their existing bare names. If the selected custom theme is missing or invalid, injection safely falls back to the default appearance without rewriting the saved selection or using `appearance.cssLocation` instead.

The **Custom CSS file** option reuses an existing `appearance.cssLocation`. Selecting a built-in or discovered theme keeps that location available for later reuse. **Default** clears both theme settings. Restarting applies the saved choice and removes the previous theme's injected styling along with the old web content.

Configuration details and user instructions: [Theming & Appearance](../../docs-site/docs/configuration.md#theming--appearance).
