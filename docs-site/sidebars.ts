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
            'development/token-cache-architecture',
            'development/security-architecture',
          ],
        },
        {
          type: 'category',
          label: 'Architecture Decisions',
          items: [
            'development/adr/001-desktopcapturer-source-id-format',
            'development/adr/002-token-cache-secure-storage',
            'development/adr/003-token-refresh-implementation',
          ],
        },
        {
          type: 'category',
          label: 'Research & Analysis',
          items: [
            'development/research/README',
            {
              type: 'category',
              label: 'Authentication & Security',
              items: [
                'development/research/token-cache-authentication-research',
                'development/research/secure-storage-research',
                'development/research/dom-access-investigation',
              ],
            },
            {
              type: 'category',
              label: 'Testing & Development',
              items: [
                'development/research/automated-testing-strategy',
              ],
            },
            {
              type: 'category',
              label: 'Electron & Framework',
              items: [
                'development/research/electron-38-migration-analysis',
                'development/research/usesystempicker-investigation',
              ],
            },
            {
              type: 'category',
              label: 'Strategic Analysis',
              items: [
                'development/research/documentation-health-analysis',
                'development/research/ui-system-strategic-analysis',
              ],
            },
          ],
        },
      ],
    },
  ],
};

export default sidebars;
