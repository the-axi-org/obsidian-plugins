# Obsidian plugins monorepo

pnpm workspace with Node and pnpm pinned through mise. See README.md for the stack, the reasons behind it, and the layout.

- New plugin: `pnpm new <id> "<Name>"`, then `pnpm install`. Don't hand-copy another plugin.
- Before calling a change done, run `pnpm typecheck && pnpm lint && pnpm test`. Run `pnpm build` too if the build or a manifest changed.
- Plugin code imports from `obsidian`. Tests import helpers from `@op/obsidian-mock`, and Vitest aliases `obsidian` to that same module. When the mock is missing an API a plugin uses, extend `packages/obsidian-mock/src/index.ts`; don't add `vi.mock` calls in individual tests.
- Keep logic that doesn't need the Obsidian API in modules that don't import `obsidian`, and unit test them directly. Vitest maps `obsidian` to the mock, so a stray import won't fail tests. Check imports when you touch these modules.
- Build logic lives in `packages/build/index.mjs`. Each plugin's `esbuild.config.mjs` should stay a one-line call to it.
- Edit `templates/plugin` whenever you change the shape that every plugin shares.
- Never commit anything in `vault/.obsidian/` except `app.json` and `community-plugins.json`.
- Agents in a sandbox: `pnpm install`/`add` write to the pnpm store outside the repo, and downloads need network access, so ask the user to run those commands.
