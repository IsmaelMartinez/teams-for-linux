import globals from "globals";
import pluginJs from "@eslint/js";

export default [
  { ignores: [".claude/", "dist/", "docs-site/build/", "docs-site/.docusaurus/", "test-results/", "playwright-report/"] },
  { files: ["**/*.js"], languageOptions: { sourceType: "commonjs" } },
  {
    files: ["testing/spikes/**/*.js", "tests/e2e/**/*.js", "playwright.config.js"],
    languageOptions: { sourceType: "module" },
  },
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  pluginJs.configs.recommended,
  {
    rules: {
      "no-var": "error",
      "eqeqeq": ["error", "always", { null: "ignore" }],
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  // Playwright requires a destructuring pattern for the fixtures argument,
  // so `async ({}, testInfo) =>` is the only way to reach testInfo.
  { files: ["tests/e2e/**/*.js"], rules: { "no-empty-pattern": "off" } },
];
