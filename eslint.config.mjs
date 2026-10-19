import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

// Obsidian's review rules target code that runs inside Obsidian, so lint only plugin sources.
// Tooling (scripts/, packages/, tests, configs) is Node code and is covered by `pnpm typecheck`.
export default defineConfig([
  globalIgnores([
    "**/node_modules/",
    "**/dist/",
    "vault/",
    "templates/",
    "scripts/",
    "packages/",
    "plugins/*/test/",
    "**/*.config.*",
  ]),
  // Obsidian's review rules + typescript-eslint type-checked rules.
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // The declarative settings API needs minAppVersion >= 1.13.0; the template targets 1.8.0.
      // Turn this back on in plugins that raise minAppVersion.
      "obsidianmd/settings-tab/prefer-setting-definitions": "off",
    },
  },
]);
