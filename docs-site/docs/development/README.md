# Development Documentation

This directory contains technical documentation for Teams for Linux developers and contributors.

## Structure

### Active Development Docs
- **[token-cache-architecture.md](token-cache-architecture.md)** - Token cache implementation, secure storage architecture, and authentication persistence
- **[dom-access-investigation.md](../research/dom-access-investigation.md)** - Research and findings on DOM access requirements, React breaking changes, and API feasibility
- **[security-architecture.md](security-architecture.md)** - Security architecture, threat model, and compensating controls documentation
- **[secure-storage-research.md](../research/secure-storage-research.md)** - Research on secure storage options and implementation considerations
- **[token-cache-research.md](../research/token-cache-research.md)** - Initial research and analysis of token cache requirements

## For Contributors

When working on Teams for Linux:

1. **Review token cache architecture** for authentication and secure storage patterns
2. **Read the security architecture** to understand security trade-offs and requirements
3. **Review DOM access investigation** ([research](../research/dom-access-investigation.md)) for context on current implementation choices
4. **Check ADR documents** for architecture decisions and rationale
5. **Check planning documents** for background on feature decisions and research

### Key Development Patterns

#### Token Cache Integration
When working with authentication-related features:
- Use the existing `tokenCache` singleton from `app/browser/tools/tokenCache.js`
- Follow the established async/await patterns for storage operations
- Implement graceful fallback mechanisms for storage failures
- Maintain PII-safe logging practices

#### Secure Storage Guidelines
- Prefer the unified token cache over direct localStorage access
- Let the system handle storage backend selection automatically
- Don't assume secure storage availability - always implement fallbacks
- Use the `getStorageInfo()` method for debugging and diagnostics

## Documentation Standards

Follow the project's Copilot Instructions (`.github/copilot-instructions.md`) for documentation standards, including:
- Use GitHub's alert syntax for callouts (`> [!NOTE]`, `> [!WARNING]`)  
- Include table of contents with `<!-- toc -->`
- Use proper markdown standards and syntax highlighting

## Related Documentation

- [Configuration Options](../configuration.md) - User-facing configuration documentation
- [IPC API](../ipc-api.md) - Inter-process communication reference
- [Contributing Guidelines](../contributing.md) - General contribution guidelines
- [Architecture Decision Records](#adr-index) - Technical decisions and rationale

### ADR Index
- [ADR-001: Token Cache Secure Storage](../adr/token-cache-secure-storage.md) - Decision to implement OS-level secure storage for authentication tokens