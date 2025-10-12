import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
  title: 'Teams for Linux Documentation',
  tagline: 'Unofficial Microsoft Teams client for Linux - Documentation',
  favicon: 'img/favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: 'https://ismaelmartinez.github.io',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/teams-for-linux/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'IsmaelMartinez', // Usually your GitHub org/user name.
  projectName: 'teams-for-linux', // Usually your repo name.

  onBrokenLinks: 'throw',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/IsmaelMartinez/teams-for-linux/tree/main/docs-site/',
          routeBasePath: '/', // Serve the docs at the site's root
        },
        blog: false, // Disable blog for this documentation site
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    [
      require.resolve('@easyops-cn/docusaurus-search-local'),
      {
        // Whether to index docs pages
        indexDocs: true,
        // Whether to index blog pages (we have blog disabled)
        indexBlog: false,
        // Language
        language: ['en'],
        // Enable highlighting of search terms in results
        highlightSearchTermsOnTargetPage: true,
        // Explode search terms for better matching
        explicitSearchResultPath: true,
        // Route base path must match docs route
        docsRouteBasePath: '/',
        // Hash search index for better caching
        hashed: true,
      },
    ],
  ],

  // Enable Mermaid support
  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  themes: ['@docusaurus/theme-mermaid'],

  themeConfig: {
    mermaid: {
      theme: {
        light: 'default',
        dark: 'dark',
      },
      options: {
        fontFamily: 'var(--ifm-font-family-base)',
      },
    },
    // Replace with your project's social card
    image: 'img/docusaurus-social-card.jpg',
    navbar: {
      title: 'Teams for Linux',
      logo: {
        alt: 'Teams for Linux Logo',
        src: 'img/logo.svg',
      },
      hideOnScroll: true,
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          href: 'https://github.com/IsmaelMartinez/teams-for-linux',
          label: 'GitHub',
          position: 'right',
          className: 'header-github-link',
          'aria-label': 'GitHub repository',
        },
        {
          href: 'https://github.com/IsmaelMartinez/teams-for-linux/releases',
          label: 'Releases',
          position: 'right',
        },
      ],
    },
    docs: {
      sidebar: {
        hideable: true,
        autoCollapseCategories: true,
      },
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Getting Started',
              to: '/',
            },
            {
              label: 'Configuration',
              to: '/configuration',
            },
            {
              label: 'Troubleshooting',
              to: '/troubleshooting',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub Issues',
              href: 'https://github.com/IsmaelMartinez/teams-for-linux/issues',
            },
            {
              label: 'GitHub Discussions',
              href: 'https://github.com/IsmaelMartinez/teams-for-linux/discussions',
            },
          ],
        },
        {
          title: 'Project',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/IsmaelMartinez/teams-for-linux',
            },
            {
              label: 'Releases',
              href: 'https://github.com/IsmaelMartinez/teams-for-linux/releases',
            },
            {
              label: 'License',
              href: 'https://github.com/IsmaelMartinez/teams-for-linux/blob/main/LICENSE.md',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Teams for Linux Contributors. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
