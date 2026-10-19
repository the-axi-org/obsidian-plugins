// Usage: pnpm vault:setup — installs the Hot Reload plugin into the dev vault.
// https://github.com/pjeby/hot-reload reloads any plugin folder containing a `.hotreload` file.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const dir = path.resolve(import.meta.dirname, "..", "vault", ".obsidian", "plugins", "hot-reload");
const base = "https://raw.githubusercontent.com/pjeby/hot-reload/master";

await mkdir(dir, { recursive: true });
for (const file of ["main.js", "manifest.json"]) {
  const res = await fetch(`${base}/${file}`);
  if (!res.ok) throw new Error(`GET ${base}/${file}: ${res.status}`);
  await writeFile(path.join(dir, file), await res.text());
}
console.log(`Installed hot-reload into ${path.relative(process.cwd(), dir)}`);
