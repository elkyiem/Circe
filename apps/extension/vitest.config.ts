import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing/vitest-plugin";

export default defineConfig({
  plugins: [WxtVitest()],
  resolve: {
    alias: {
      "@pond/ui": resolve(import.meta.dirname, "../../packages/ui/src"),
    },
  },
});
