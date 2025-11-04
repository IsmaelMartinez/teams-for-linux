# Development Documentation

Welcome to the Teams for Linux development documentation.

## Quick Links

- **[Architecture](./architecture/README.md)** - System architecture and design documents
- **[ADR (Architecture Decision Records)](./adr/README.md)** - Architectural decisions and rationale
- **[Research](./research/README.md)** - Technical research and analysis
- **[Testing](./testing/README.md)** - Testing strategy and guides
- **[Contributing](./contributing.md)** - How to contribute to the project
- **[Security Architecture](./security-architecture.md)** - Security design and implementation

## Documentation Structure

All development documentation is managed using **Docusaurus** and organized in `docs-site/docs/`:

```
docs-site/docs/
├── index.md                    # Main documentation home
├── installation.md             # Installation guides
├── configuration.md            # Configuration reference
├── troubleshooting.md          # Common issues and solutions
└── development/
    ├── architecture/           # Architecture documentation
    │   ├── phase6-completion.md
    │   ├── application-integration.md
    │   └── phase1-*.md
    ├── adr/                    # Architecture Decision Records
    ├── research/               # Technical research and analysis
    ├── testing/                # Testing documentation
    ├── contributing.md         # Contribution guide
    ├── ipc-api.md             # IPC API reference
    ├── log-config.md          # Logging configuration
    ├── release-info.md        # Release management
    ├── security-architecture.md
    └── token-cache-architecture.md
```

## Working with Documentation

### Local Development

```bash
cd docs-site
npm install
npm start
```

This starts the Docusaurus development server at http://localhost:3000

### Adding Documentation

1. Create markdown files in `docs-site/docs/` or appropriate subdirectory
2. Update `docs-site/sidebars.ts` if adding new sections
3. Use Docusaurus markdown features (tabs, admonitions, code blocks)
4. Preview locally before committing

### Documentation Guidelines

- Use clear, concise language
- Include code examples where relevant
- Add diagrams for complex concepts
- Keep documentation up-to-date with code changes
- Follow existing documentation structure

## External Resources

- [Docusaurus Documentation](https://docusaurus.io/)
- [Markdown Features](https://docusaurus.io/docs/markdown-features)
- [GitHub Repository](https://github.com/IsmaelMartinez/teams-for-linux)
