# Markdown Validation

Teams for Linux uses `markdownlint-cli2` to ensure consistent markdown formatting across all documentation files. This helps maintain high-quality documentation that follows GitHub's markdown standards.

## Table of Contents
<!-- toc -->
- [Quick Start](#quick-start)
- [Available Commands](#available-commands)
- [Configuration](#configuration)
- [Rules Overview](#rules-overview)
- [Integration](#integration)
- [Troubleshooting](#troubleshooting)
<!-- /toc -->

## Quick Start

Install dependencies:

```bash
npm install
```

Check all markdown files:

```bash
npm run lint:md
```

Auto-fix issues where possible:

```bash
npm run lint:md:fix
```

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run lint:md` | Check all markdown files for style issues |
| `npm run lint:md:fix` | Automatically fix issues where possible |

## Configuration

Markdown linting is configured in `.markdownlint-cli2.jsonc`. This configuration:

- **Follows GitHub Standards**: Aligns with GitHub Flavored Markdown
- **Allows GitHub Features**: Permits HTML comments, alerts, and collapsible sections
- **Flexible Line Length**: Disabled strict line length rules for documentation
- **Smart Ignoring**: Excludes generated files and build directories

### Key Rules Enabled

- **Heading Style**: Use `#` style headings (ATX)
- **List Style**: Use `-` for unordered lists, `1.` for ordered lists
- **Code Blocks**: Must specify language for syntax highlighting
- **Emphasis**: Use `*` for emphasis and `**` for strong text
- **Spacing**: Consistent spacing around headings and lists

### Key Rules Disabled

- **MD013** (Line Length): Documentation can have longer lines
- **MD033** (Inline HTML): GitHub alerts and collapsible sections need HTML
- **MD041** (First Line H1): Many files have frontmatter or different structure

## Rules Overview

The linter checks for 59+ rules covering:

> [!NOTE]
> Complete rule documentation available at [markdownlint rules](https://github.com/DavidAnson/markdownlint/blob/main/doc/Rules.md)

### Critical Rules

- **MD040**: Fenced code blocks must have language specified
- **MD046**: Use fenced code blocks instead of indented
- **MD022**: Headings must have blank lines around them

### Style Rules

- **MD003**: Heading style consistency
- **MD004**: Unordered list marker style
- **MD029**: Ordered list marker style

### Content Rules

- **MD034**: No bare URLs (must be in angle brackets or proper links)
- **MD036**: Don't use emphasis as headings
- **MD045**: Images should have alt text

## Integration

### VS Code Integration

Install the [markdownlint extension](https://marketplace.visualstudio.com/items?itemName=DavidAnson.vscode-markdownlint) for real-time linting in VS Code.

### Pre-commit Hooks

Add to `.pre-commit-config.yaml`:

```yaml
repos:
  - repo: https://github.com/DavidAnson/markdownlint-cli2
    rev: v0.18.1
    hooks:
      - id: markdownlint-cli2
```

### GitHub Actions

Example workflow step:

```yaml
- name: Lint markdown files
  run: npm run lint:md
```

## Troubleshooting

### Common Issues

<details>
<summary><strong>Long lines in code blocks</strong></summary>

Code blocks are exempt from line length rules. Ensure your code is properly fenced:

````markdown
```javascript
// This long line is acceptable in a code block
const veryLongVariableName = someFunction(withManyParameters, andOptions, thatMakeTheLineLong);
```
````
</details>

<details>
<summary><strong>HTML in markdown</strong></summary>

GitHub-standard HTML is allowed:

```markdown
> [!WARNING]
> This is a GitHub alert - HTML is allowed here

<details>
<summary>Collapsible section</summary>
Content here
</details>
```

</details>

<details>
<summary><strong>Duplicate headings</strong></summary>

Duplicate headings are allowed in different sections:

```markdown
# API Documentation

## Configuration
### Options

# User Guide

## Configuration  <!-- This is allowed -->
### Options       <!-- This is also allowed -->
```

</details>

### Ignoring Rules

For specific cases, you can disable rules:

```markdown
<!-- markdownlint-disable MD033 -->
<div class="custom-html">
  This HTML won't be flagged
</div>
<!-- markdownlint-enable MD033 -->
```

Or disable for a single line:

```markdown
<script>alert('test')</script> <!-- markdownlint-disable-line MD033 -->
```

### Custom Rules

If you need project-specific rules, they can be added to the configuration. See the [custom rules documentation](https://github.com/DavidAnson/markdownlint/blob/main/doc/CustomRules.md) for details.

---

For more information about markdown validation in Teams for Linux, see our [knowledge base](knowledge-base.md) or [contribution guidelines](../CONTRIBUTING.md).
