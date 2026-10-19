// Usage: pnpm new <plugin-id> "<Display Name>" ["Description"]
import { execSync } from "node:child_process";
import { cp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const [id, name, description = ""] = process.argv.slice(2);

function fail(msg) {
  console.error(`error: ${msg}\nusage: pnpm new <plugin-id> "<Display Name>" ["Description"]`);
  process.exit(1);
}

// Obsidian community plugin id rules.
if (!id || !name) fail("plugin id and display name are required");
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) fail("id must be lowercase letters, digits and dashes");
if (id.includes("obsidian")) fail('id must not contain "obsidian"');
if (id.endsWith("plugin")) fail('id must not end with "plugin"');

const target = path.join(root, "plugins", id);
if (await stat(target).catch(() => null)) fail(`plugins/${id} already exists`);

let author = "";
try {
  author = execSync("git config user.name", { encoding: "utf8" }).trim();
} catch {
  // leave blank
}

const vars = {
  id,
  name,
  description: description || `${name} for Obsidian.`,
  author,
  className: name
    .replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""))
    .replace(/^./, (c) => c.toUpperCase()),
};
if (!/^[A-Za-z]/.test(vars.className)) fail("display name must start with a letter");

await cp(path.join(root, "templates", "plugin"), target, { recursive: true });

async function render(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await render(p);
    } else {
      const text = await readFile(p, "utf8");
      await writeFile(
        p,
        text.replace(/\{\{(\w+)\}\}/g, (m, key) => vars[key] ?? m),
      );
    }
  }
}
await render(target);

console.log(`Created plugins/${id}. Next:
  pnpm install
  pnpm dev ${id}
  then enable "${name}" in vault/ (Settings → Community plugins)`);
