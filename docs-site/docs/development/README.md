# Development Documentation

This directory contains technical documentation for Teams for Linux developers and contributors.

## Structure

### Active Development Docs
- **[dom-access-investigation.md](dom-access-investigation.md)** - Research and findings on DOM access requirements, React breaking changes, and API feasibility
- **[security-architecture.md](security-architecture.md)** - Security architecture, threat model, and compensating controls documentation

### Planning Archive
- **[planning/](planning/)** - Historical PRDs, spikes, and planning documents that informed development decisions

## For Contributors

When working on Teams for Linux:

1. **Read the security architecture** to understand security trade-offs and requirements
2. **Review DOM access investigation** for context on current implementation choices  
3. **Check planning documents** for background on feature decisions and research

## Documentation Standards

Follow the project's Copilot Instructions (`.github/copilot-instructions.md`) for documentation standards, including:
- Use GitHub's alert syntax for callouts (`> [!NOTE]`, `> [!WARNING]`)  
- Include table of contents with `<!-- toc -->`
- Use proper markdown standards and syntax highlighting

## Related Documentation

- [Configuration Options](../configuration.md) - User-facing configuration documentation
- [IPC API](../ipc-api.md) - Inter-process communication reference
- [Contributing Guidelines](../contributing.md) - General contribution guidelines