import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const mock = (p: string) =>
  fileURLToPath(new URL(`./packages/obsidian-mock/src/${p}`, import.meta.url));

export default defineConfig({
  resolve: {
    // The `obsidian` npm package is types-only; tests run against this mock instead.
    alias: { obsidian: mock("index.ts") },
  },
  test: {
    include: ["plugins/*/test/**/*.test.ts", "packages/*/test/**/*.test.ts"],
    environment: "happy-dom",
    setupFiles: [mock("dom.ts")],
  },
});
