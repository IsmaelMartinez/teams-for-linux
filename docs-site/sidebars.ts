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
      ],
    },
    {
      type: 'category',
      label: 'Research',
      items: [
        'ai-research/index',
        'ai-research/documentation-health-analysis',
        'ai-research/ui-system-strategic-analysis',
      ],
    },
  ],
};

export default sidebars;
