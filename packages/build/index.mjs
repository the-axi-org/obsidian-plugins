// Shared esbuild pipeline for every plugin in plugins/*.
// Builds src/main.ts -> dist/main.js, then mirrors dist/ into the dev vault.
import esbuild from "esbuild";
import { watch } from "node:fs";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const vaultPluginsDir = path.join(repoRoot, "vault", ".obsidian", "plugins");

// Provided by Obsidian at runtime; must never be bundled.
const external = [
  "obsidian",
  "electron",
  "@codemirror/*",
  "@lezer/*",
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
];

const STATIC_FILES = ["manifest.json", "styles.css"];

async function copyStatic(pluginDir, distDir) {
  for (const file of STATIC_FILES) {
    await copyFile(path.join(pluginDir, file), path.join(distDir, file)).catch((err) => {
      if (err.code !== "ENOENT") throw err;
    });
  }
}

async function syncToVault(distDir, vaultDir) {
  await mkdir(vaultDir, { recursive: true });
  for (const file of await readdir(distDir)) {
    await copyFile(path.join(distDir, file), path.join(vaultDir, file));
  }
  // Tells the Hot Reload plugin to watch this plugin's folder.
  await writeFile(path.join(vaultDir, ".hotreload"), "");
}

/**
 * @param {string} pluginDir absolute path of the plugin package
 * @param {{ production?: boolean }} [options] defaults to `production` being passed on the CLI
 */
export async function buildPlugin(
  pluginDir,
  { production = process.argv.includes("production") } = {},
) {
  const manifest = JSON.parse(await readFile(path.join(pluginDir, "manifest.json"), "utf8"));
  const distDir = path.join(pluginDir, "dist");
  const vaultDir = path.join(vaultPluginsDir, manifest.id);

  const publish = async () => {
    await copyStatic(pluginDir, distDir);
    await syncToVault(distDir, vaultDir);
  };

  const ctx = await esbuild.context({
    entryPoints: [path.join(pluginDir, "src", "main.ts")],
    outfile: path.join(distDir, "main.js"),
    bundle: true,
    format: "cjs",
    target: "es2022",
    external,
    sourcemap: production ? false : "inline",
    minify: production,
    treeShaking: true,
    logLevel: "info",
    plugins: [
      {
        name: "publish-to-vault",
        setup(build) {
          build.onEnd(async (result) => {
            if (result.errors.length === 0) await publish();
          });
        },
      },
    ],
  });

  if (production) {
    await ctx.rebuild();
    await ctx.dispose();
    return;
  }

  await ctx.watch();
  // esbuild only watches the import graph; pick up stylesheet/manifest edits too.
  for (const file of STATIC_FILES) {
    try {
      watch(path.join(pluginDir, file), () => publish().catch(console.error));
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }
  console.log(`[${manifest.id}] watching — output in ${path.relative(repoRoot, vaultDir)}`);
}
