// Usage: pnpm dev <plugin-id>  — watch-build one plugin into the dev vault.
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

const plugins = await readdir(path.resolve(import.meta.dirname, "..", "plugins"));
const id = process.argv[2];

if (!id || !plugins.includes(id)) {
  console.error(`usage: pnpm dev <plugin-id>\navailable: ${plugins.join(", ") || "(none)"}`);
  process.exit(1);
}

spawn("pnpm", ["--filter", id, "dev"], { stdio: "inherit" }).on("exit", (code) =>
  process.exit(code ?? 0),
);
