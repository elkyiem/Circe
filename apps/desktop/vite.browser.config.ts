import { resolve } from "node:path";
import { defineConfig } from "vite";
import desktop from "./electron.vite.config";

const renderer = desktop.renderer ?? {};

/** Share Pond's build boundary while emitting only the browser entrypoint. */
export default defineConfig({
  ...renderer,
  base: "/",
  build: {
    ...renderer.build,
    outDir: resolve(import.meta.dirname, "out/browser"),
    emptyOutDir: true,
    rollupOptions: {
      ...renderer.build?.rollupOptions,
      input: {
        browser: resolve(import.meta.dirname, "src/renderer/browser.html"),
      },
    },
  },
});
