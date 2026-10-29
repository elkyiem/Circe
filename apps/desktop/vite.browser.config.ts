import { resolve } from "node:path";
import { defineConfig } from "vite";
import { browserPwa } from "./browser-pwa";
import desktop from "./electron.vite.config";

const renderer = desktop.renderer ?? {};

/** Share Pond's build boundary while emitting only the browser entrypoint. */
export default defineConfig({
  ...renderer,
  plugins: [...(renderer.plugins ?? []), browserPwa()],
  base: "/",
  build: {
    ...renderer.build,
    outDir: resolve(import.meta.dirname, "out/browser"),
    emptyOutDir: true,
    rollupOptions: {
      ...renderer.build?.rollupOptions,
      input: {
        browser: resolve(import.meta.dirname, "src/renderer/browser.html"),
        "browser-preview": resolve(
          import.meta.dirname,
          "src/renderer/browser-preview.html",
        ),
      },
    },
  },
});
