# Development Documentation

This directory contains technical documentation for Teams for Linux developers and contributors.

## Structure

### Active Development Docs
- **[token-cache-architecture.md](token-cache-architecture.md)** - Token cache implementation, secure storage architecture, and authentication persistence
- **[dom-access-investigation.md](research/dom-access-investigation.md)** - Research and findings on DOM access requirements, React breaking changes, and API feasibility
- **[security-architecture.md](security-architecture.md)** - Security architecture, threat model, and compensating controls documentation
- **[secure-storage-research.md](research/secure-storage-research.md)** - Research on secure storage options and implementation considerations
- **[token-cache-authentication-research.md](research/token-cache-authentication-research.md)** - Comprehensive research from problem analysis through implementation validation

## For Contributors

When working on Teams for Linux:

1. **Review token cache architecture** for authentication and secure storage patterns
2. **Read the security architecture** to understand security trade-offs and requirements
3. **Review DOM access investigation** ([research](research/dom-access-investigation.md)) for context on current implementation choices
4. **Check ADR documents** for architecture decisions and rationale
5. **Check planning documents** for background on feature decisions and research
6. **Run E2E tests** before submitting PRs with `npm run test:e2e`

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
- [IPC API](ipc-api.md) - Inter-process communication reference
- [Contributing Guidelines](contributing.md) - General contribution guidelines
- [Architecture Decision Records](#adr-index) - Technical decisions and rationale

### Testing

Teams for Linux uses automated end-to-end testing with Playwright to ensure application stability and prevent regressions.

#### Running Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run in debug mode
npx playwright test --debug
```

#### Testing Strategy

The project uses a multi-layered testing approach:
- **E2E Tests (Playwright)**: Full application testing with real Electron runtime
- **Clean State Testing**: Each test runs with isolated temporary userData directory
- **Microsoft Authentication**: Tests validate redirect to login without requiring credentials

For comprehensive testing documentation, see:
- [Contributing Guide - Testing Section](contributing.md#testing)
- [Automated Testing Strategy](research/automated-testing-strategy.md)

### ADR Index
- [ADR-001: DesktopCapturer Source ID Format](adr/001-desktopcapturer-source-id-format.md) - Decision on screen sharing source identification format
- [ADR-002: Token Cache Secure Storage](adr/002-token-cache-secure-storage.md) - Decision to implement OS-level secure storage for authentication tokens
- [ADR-003: Token Refresh Implementation](adr/003-token-refresh-implementation.md) - Decision on token refresh strategy and implementation