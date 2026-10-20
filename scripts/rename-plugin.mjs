// Usage: pnpm rename <old-id> <new-id> "<New Name>"
// Moves plugins/<old-id> and rewrites the id, display name and class names inside it,
// plus the dev vault's plugin folder and community-plugins.json.
import { readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { idProblem, toClassName, warnIfTaken } from "./plugin-id.mjs";

const root = path.resolve(import.meta.dirname, "..");
const [oldId, newId, newName] = process.argv.slice(2);

function fail(msg) {
  console.error(`error: ${msg}\nusage: pnpm rename <old-id> <new-id> "<New Name>"`);
  process.exit(1);
}

if (!oldId || !newId || !newName) fail("old id, new id and new display name are required");
const problem = idProblem(newId);
if (problem) fail(problem);

const exists = (p) =>
  stat(p).then(
    () => true,
    () => false,
  );
const oldDir = path.join(root, "plugins", oldId);
const newDir = path.join(root, "plugins", newId);
if (!(await exists(oldDir))) fail(`plugins/${oldId} doesn't exist`);
if (oldId !== newId && (await exists(newDir))) fail(`plugins/${newId} already exists`);

const oldName = JSON.parse(await readFile(path.join(oldDir, "manifest.json"), "utf8")).name;
const oldClass = toClassName(oldName);
const newClass = toClassName(newName);
if (!/^[A-Za-z]/.test(newClass)) fail("display name must start with a letter");
await warnIfTaken(newId, newName);

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sentence = (s) => s.charAt(0) + s.slice(1).toLowerCase();
// Ids also appear as prefixes (CSS classes, view types), so only require that they
// aren't part of a longer word. Class names are followed by Plugin, Settings, etc.
const replacements = [
  [new RegExp(`(?<![a-z0-9])${escape(oldId)}(?![a-z0-9])`, "g"), newId],
  [new RegExp(escape(oldName), "g"), newName],
  [new RegExp(escape(sentence(oldName)), "g"), sentence(newName)],
  [new RegExp(`(?<![A-Za-z0-9])${escape(oldClass)}`, "g"), newClass],
];
const rewrite = (text) => replacements.reduce((t, [re, to]) => t.replace(re, to), text);

async function rewriteFile(file) {
  const text = await readFile(file, "utf8");
  const next = rewrite(text);
  if (next === text) return false;
  await writeFile(file, next);
  return true;
}

await rename(oldDir, newDir);
const changed = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(p);
    else if (await rewriteFile(p)) changed.push(path.relative(root, p));
  }
}
await walk(newDir);

// Dev vault: built output and any data.json move with the plugin.
const vaultDir = path.join(root, "vault", ".obsidian");
const oldVaultPlugin = path.join(vaultDir, "plugins", oldId);
if (await exists(oldVaultPlugin)) {
  await rename(oldVaultPlugin, path.join(vaultDir, "plugins", newId));
}
const enabledFile = path.join(vaultDir, "community-plugins.json");
if (await exists(enabledFile)) {
  const enabled = await readFile(enabledFile, "utf8");
  await writeFile(enabledFile, enabled.replace(`"${oldId}"`, `"${newId}"`));
}

console.log(`Renamed plugins/${oldId} → plugins/${newId} ("${oldName}" → "${newName}").
Rewrote ${changed.length} files:
${changed.map((f) => `  ${f}`).join("\n")}
Review the diff (docs like CHANGELOG.md may need a manual pass), then:
  pnpm install
  pnpm build`);
