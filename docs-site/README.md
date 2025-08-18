# Teams for Linux Documentation Site

This directory contains the Docusaurus-based documentation website for Teams for Linux.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run start

# Build for production
npm run build

# Serve production build locally
npm run serve
```

## Deployment

The documentation is automatically deployed to GitHub Pages when changes are pushed to the main branch.

### Automatic Deployment
- **Production**: Pushes to `main` branch automatically deploy to GitHub Pages
- **Testing**: The `docs-test-deploy.yml` workflow can be manually triggered for test deployments

### Manual Deployment Testing
1. Go to GitHub Actions tab
2. Select "Test Deploy Docusaurus (Development)" workflow
3. Click "Run workflow"
4. Optionally specify a test branch name
5. Monitor the deployment process

## Development

### Adding New Documentation
1. Create `.md` or `.mdx` files in the `docs/` directory
2. Update `sidebars.ts` to include new pages in navigation
3. Test locally with `npm run start`
4. Commit and push changes

### Customization
- **Theme**: Edit `src/css/custom.css` for styling changes
- **Configuration**: Modify `docusaurus.config.ts` for site settings
- **Navigation**: Update `sidebars.ts` for sidebar structure

## Architecture

```
docs-site/
├── docs/                 # Documentation pages (.md/.mdx)
├── src/
│   └── css/
│       └── custom.css    # Custom styling
├── static/               # Static assets
├── docusaurus.config.ts  # Main configuration
├── sidebars.ts          # Navigation structure
└── package.json         # Dependencies and scripts
```

## GitHub Pages Configuration

The site is configured to deploy to GitHub Pages with:
- **URL**: `https://ismaelmartinez.github.io/teams-for-linux/`
- **Source**: GitHub Actions deployment
- **Base URL**: `/teams-for-linux/`

## Features

- ✅ Mobile-first responsive design
- ✅ Dark/light theme support
- ✅ Search functionality (when configured)
- ✅ Accessibility features
- ✅ Microsoft Teams-inspired branding
- ✅ Mermaid diagram support
- ✅ Enhanced markdown with admonitions

## Performance

The site is optimized for:
- Fast loading times
- Mobile responsiveness
- SEO-friendly structure
- Accessibility compliance
