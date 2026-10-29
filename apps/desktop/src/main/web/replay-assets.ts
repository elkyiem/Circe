import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReplayAssets } from "./replay-host";

/** Bind the service worker and bootstrap to this exact browser build. */
export function replayAssets(input: { browser: string; resources: string }) {
  let loaded: Promise<ReplayAssets> | null = null;
  return () => {
    loaded ??= (async () => {
      const assets = join(input.browser, "assets");
      const files = await readdir(assets);
      const find = (name: string) => {
        const matches = files.filter((file) =>
          new RegExp(`^${name}-[A-Za-z0-9_-]+\\.js$`).test(file),
        );
        if (matches.length !== 1 || !matches[0])
          throw new Error("Rebuild the Circé browser before opening archives.");
        return matches[0];
      };
      const worker = find("replay-worker");
      const bootstrap = find("replay-bootstrap");
      const [ui, workerCode, bootstrapCode] = await Promise.all([
        readFile(join(input.resources, "replay", "ui.js"), "utf8"),
        readFile(join(assets, worker), "utf8"),
        readFile(join(assets, bootstrap), "utf8"),
      ]);
      return {
        ui,
        worker: workerCode,
        bootstrap: bootstrapCode,
        workerAsset: `/assets/${worker}`,
        bootstrapAsset: `/assets/${bootstrap}`,
      };
    })().catch((error: Error) => {
      loaded = null;
      throw error;
    });
    return loaded;
  };
}
