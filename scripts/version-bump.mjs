// Usage: pnpm version-bump <plugin-id> <new-version> [minAppVersion]
// Updates manifest.json, package.json and versions.json of one plugin.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [id, version, minApp] = process.argv.slice(2);
if (!id || !/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("usage: pnpm version-bump <plugin-id> <x.y.z> [minAppVersion]");
  process.exit(1);
}

const dir = path.resolve(import.meta.dirname, "..", "plugins", id);
const readJson = async (f) => JSON.parse(await readFile(path.join(dir, f), "utf8"));
const writeJson = (f, data) => writeFile(path.join(dir, f), JSON.stringify(data, null, 2) + "\n");

const manifest = await readJson("manifest.json");
const pkg = await readJson("package.json");
const versions = await readJson("versions.json");

manifest.version = version;
if (minApp) manifest.minAppVersion = minApp;
pkg.version = version;
versions[version] = manifest.minAppVersion;

await writeJson("manifest.json", manifest);
await writeJson("package.json", pkg);
await writeJson("versions.json", versions);
console.log(`${id} → ${version} (minAppVersion ${manifest.minAppVersion})`);
