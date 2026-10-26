import { defineConfig } from "tsup";

/** JXA calls a global `run(argv)`, so each entry is an IIFE that assigns one. */
export default defineConfig({
  entry: { search: "src/search.ts", save: "src/save.ts" },
  format: ["iife"],
  globalName: "PondAlfred",
  target: "es2020",
  platform: "neutral",
  outDir: "dist",
  clean: true,
  noExternal: ["zod"],
  footer: { js: "function run(argv) { return PondAlfred.run(argv); }" },
});
