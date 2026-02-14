import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */
const sidebars: SidebarsConfig = {
  // Teams for Linux documentation sidebar
  docsSidebar: [
    'index',
    {
      type: 'category',
      label: 'Getting Started',
      items: [
        'installation',
        'uninstall',
        'configuration',
        'multiple-instances',
        'intune-sso',
      ],
    },
    {
      type: 'category',
      label: 'User Guide',
      items: [
        'screen-sharing',
        'custom-backgrounds',
        'mqtt-integration',
        'certificate',
        'troubleshooting',
      ],
    },
    {
      type: 'category',
      label: 'Developer Documentation',
      items: [
        'development/README',
        'development/contributing',
        {
          type: 'category',
          label: 'Development Guides',
          items: [
            'development/ipc-api',
            'development/log-config',
            'development/release-info',
          ],
        },
        {
          type: 'category',
          label: 'Architecture',
          items: [
            'development/module-index',
            'development/token-cache-architecture',
            'development/security-architecture',
          ],
        },
        {
          type: 'category',
          label: 'Architecture Decisions',
          items: [
            'development/adr/README',
            'development/adr/001-desktopcapturer-source-id-format',
            'development/adr/002-token-cache-secure-storage',
            'development/adr/003-token-refresh-implementation',
            'development/adr/004-agents-md-standard-investigation',
            'development/adr/005-ai-powered-changelog-generation',
            'development/adr/006-cli-argument-parsing-library',
            'development/adr/007-embedded-mqtt-broker',
            'development/adr/008-usesystempicker-electron-38',
            'development/adr/009-automated-testing-strategy',
            'development/adr/010-multiple-windows-support',
          ],
        },
        {
          type: 'category',
          label: 'Research & Analysis',
          items: [
            'development/research/README',
            'development/research/electron-40-migration-research',
            'development/research/electron-updater-auto-update-research',
            'development/research/configuration-organization-research',
            'development/research/custom-notification-system-research',
            'development/research/external-browser-authentication-investigation',
            'development/research/external-changelog-generation-research',
            'development/research/github-issue-bot-investigation',
            'development/research/gnome-search-provider-investigation',
            'development/research/graph-api-integration-research',
            'development/research/logout-indicator-investigation',
            'development/research/mqtt-extended-status-investigation',
            'development/research/screen-lock-media-privacy-investigation',
          ],
        },
      ],
    },
  ],
};

export default sidebars;
