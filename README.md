# Obsidian plugins

A monorepo for building several Obsidian plugins with shared build, test and lint tooling, plus a local vault for testing them by hand.

## Quick start

```sh
mise install          # Node 24 + pnpm, pinned in mise.toml
pnpm install
pnpm vault:setup      # install the Hot Reload plugin into vault/
pnpm dev hello-world  # rebuild on every change into vault/.obsidian/plugins/hello-world
```

Open `vault/` as a vault in Obsidian. On Windows with the repo in WSL, use the path
`\\wsl$\<distro>\mnt\wsl\storage\repos\my\obsidian-plugins\vault`.
Then enable community plugins. Hello World and Hot Reload are already listed in `community-plugins.json`.

## Commands

| Command                                   | What it does                                                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm new <id> "<Name>" ["desc"]`         | Creates `plugins/<id>` from `templates/plugin` and checks the id against Obsidian's rules             |
| `pnpm rename <old> <new> "<Name>"`        | Moves `plugins/<old>` and rewrites its id, name and class names, plus the vault entries               |
| `pnpm dev <id>`                           | esbuild in watch mode for one plugin; output goes to `plugins/<id>/dist` and is copied into the vault |
| `pnpm build`                              | Type-checks and builds every plugin for production (minified)                                         |
| `pnpm test` / `pnpm test:watch`           | Vitest for all plugins; `pnpm test hello-world` runs only the files whose path matches                |
| `pnpm typecheck`                          | `tsc` for the shared code and each plugin                                                             |
| `pnpm lint`                               | ESLint with Obsidian's review rules, on every plugin                                                  |
| `pnpm format`                             | Prettier                                                                                              |
| `pnpm version-bump <id> <x.y.z> [minApp]` | Updates `manifest.json`, `package.json` and `versions.json` together                                  |

Run `pnpm install` after `pnpm new` so the new plugin's workspace dependencies get linked.

## Layout

```
mise.toml                Node + pnpm versions
pnpm-workspace.yaml      workspace = packages/* + plugins/*
tsconfig.base.json       strict TS settings shared by everything
eslint.config.mjs        obsidianmd recommended rules, plugin sources only
vitest.config.ts         maps `obsidian` to the mock and uses happy-dom
packages/
  build/                 @op/build: shared esbuild pipeline, copies output into the vault
  obsidian-mock/         @op/obsidian-mock: runtime stand-in for the `obsidian` API + test helpers
plugins/<id>/            one folder per plugin: manifest.json, src/, test/, styles.css
templates/plugin/        what `pnpm new` copies
scripts/                 new-plugin, rename-plugin, dev, version-bump, setup-vault
vault/                   test vault (only notes and minimal config are committed)
```

## Stack and why

| Concern        | Choice                                           | Why                                                                                                                                                                                              |
| -------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Toolchain      | **mise** (Node 24 LTS, pnpm)                     | Every machine gets the same versions and nothing is installed globally                                                                                                                           |
| Language       | **TypeScript** (strict)                          | The Obsidian API is published as TypeScript types (`obsidian` on npm), and the official sample plugin is written in TS                                                                           |
| Bundler        | **esbuild**                                      | Same bundler as Obsidian's sample plugin. A plugin ships as a single CommonJS `main.js`, and rebuilds take well under a second                                                                   |
| Monorepo       | **pnpm workspaces**                              | Strict dependency isolation, a shared content-addressed store, `--filter` to work on one plugin, and internal packages linked with `workspace:*`                                                 |
| Tests          | **Vitest** + **happy-dom** + `@op/obsidian-mock` | The `obsidian` npm package contains only types and no runtime code, so tests point it at a mock. happy-dom provides the DOM, and the mock adds Obsidian's DOM helpers (`createEl`, `empty`, ...) |
| Lint           | **ESLint 9** + `eslint-plugin-obsidianmd`        | The same rules Obsidian applies when reviewing community plugins, plus typescript-eslint's type-checked rules                                                                                    |
| Manual testing | Local `vault/` + **Hot Reload**                  | Builds go straight into the vault, and Hot Reload reloads any plugin folder that contains a `.hotreload` file, which the build creates                                                           |

Version notes:

- TypeScript is pinned to `~6.0` because typescript-eslint doesn't support TS 7 (the native port) yet.
- ESLint is on 9 because the obsidianmd plugin's dependencies don't support 10 yet.
- `eslint-plugin-obsidianmd` asks for `obsidian@1.8.7` exactly as a peer. We use newer typings, so pnpm shows a peer warning; it's harmless.

## Writing tests

```ts
import { getSettings, loadPlugin, notices } from "@op/obsidian-mock";
import manifest from "../manifest.json";
import MyPlugin from "../src/main";

const plugin = await loadPlugin(MyPlugin, manifest, { data: {/* saved settings */} });
plugin.commands.find((c) => c.id === "my-command")?.callback?.();
expect(notices).toContain("Done");
```

The mock gives you an in-memory `Vault`, `Workspace` events, `Setting`/component fakes with `simulateChange` and `simulateClick`, and `Modal`. It only covers part of the API. When a plugin needs more, add it to `packages/obsidian-mock/src/index.ts` and match the signatures in `obsidian.d.ts`.

## Conventions

- Plugin ids are lowercase with dashes, must not contain `obsidian`, and must not end in `plugin`. The package name matches the id, so `pnpm --filter <id>` works.
- `minAppVersion` in the template is `1.8.0`. Code written against the newer `obsidian` typings can call APIs that don't exist in older Obsidian versions, so raise `minAppVersion` when you use them. One example is the declarative settings API (`getSettingDefinitions`, 1.13+). Its lint rule is turned off in `eslint.config.mjs` for that reason.
- Lint covers only `plugins/*/src`. Tooling, tests and the mock are Node code and are checked by `pnpm typecheck`.

## Publishing

Obsidian's community plugin directory expects **one GitHub repo per plugin**, with `manifest.json` at the repo root and `main.js`, `manifest.json` and `styles.css` attached to a GitHub release. When a plugin is ready to publish, mirror `plugins/<id>` into its own repo, for example with `git subtree split --prefix plugins/<id>` or a CI sync job, and attach the files from `plugins/<id>/dist/` to the release.
