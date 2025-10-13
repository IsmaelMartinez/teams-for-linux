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
      label: 'Developer',
      items: [
        'contributing',
        'ipc-api',
        'log-config',
        'release-info',
        {
          type: 'category',
          label: 'Architecture',
          items: [
            'development/README',
            'development/token-cache-architecture',
            'development/security-architecture',
          ],
        },
        {
          type: 'category',
          label: 'Architecture Decisions',
          items: [
            'adr/token-cache-secure-storage',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Research',
      items: [
        'research/README',
        {
          type: 'category',
          label: 'Authentication & Security',
          items: [
            'research/token-cache-authentication-research',
            'research/secure-storage-research',
            'research/dom-access-investigation',
          ],
        },
        {
          type: 'category',
          label: 'Testing & Development',
          items: [
            'research/automated-testing-strategy',
          ],
        },
        {
          type: 'category',
          label: 'Electron & Framework',
          items: [
            'research/electron-38-migration-analysis',
            'research/usesystempicker-investigation',
          ],
        },
        {
          type: 'category',
          label: 'Strategic Analysis',
          items: [
            'research/documentation-health-analysis',
            'research/ui-system-strategic-analysis',
          ],
        },
      ],
    },
  ],
};

export default sidebars;
