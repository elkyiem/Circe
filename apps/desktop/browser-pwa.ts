import { createHash } from "node:crypto";
import { resolve } from "node:path";
import sharp from "sharp";
import type { Plugin } from "vite";

/** Only the offline UI and its static dependencies are cached; Library data stays on the host. */
export function browserPwa(): Plugin {
  return {
    name: "circe-pwa",
    enforce: "post",
    async generateBundle(_options, bundle) {
      const offline = bundle["offline.html"];
      if (offline?.type !== "asset")
        throw new Error("The offline entry was not built");
      const html = String(offline.source);
      const offlineAssets = new Set(["/offline.html", "/app-icon-192.png"]);
      const collect = (fileName: string) => {
        const path = `/${fileName}`;
        if (offlineAssets.has(path)) return;
        const asset = bundle[fileName];
        if (!asset) throw new Error(`Missing offline dependency: ${fileName}`);
        offlineAssets.add(path);
        if (asset.type === "chunk") {
          for (const dependency of asset.imports) collect(dependency);
          for (const css of asset.viteMetadata?.importedCss ?? []) collect(css);
        }
      };
      for (const match of html.matchAll(
        /(?:src|href)="\/(assets\/[^"?#]+)"/g,
      )) {
        const fileName = match[1];
        if (fileName) collect(fileName);
      }
      const revision = createHash("sha256")
        .update(html)
        .update(Object.keys(bundle).sort().join("\n"))
        .digest("hex")
        .slice(0, 16);
      const emit = (fileName: string, source: string | Uint8Array) =>
        this.emitFile({ type: "asset", fileName, source });
      for (const size of [180, 192, 512])
        emit(
          `app-icon-${size}.png`,
          await sharp(
            resolve(
              import.meta.dirname,
              "../../packages/icons/brand/tints/aqua/default.png",
            ),
          )
            .resize(size, size)
            .png()
            .toBuffer(),
        );
      emit(
        "manifest.webmanifest",
        JSON.stringify({
          id: "/",
          name: "Circé",
          short_name: "Circé",
          description: "Your private Library, on your devices.",
          start_url: "/",
          scope: "/",
          display: "standalone",
          background_color: "#0a0a0a",
          theme_color: "#0a0a0a",
          icons: [192, 512].map((size) => ({
            src: `/app-icon-${size}.png`,
            sizes: `${size}x${size}`,
            type: "image/png",
            purpose: "any",
          })),
        }),
      );
      emit(
        "app-sw.js",
        `const CACHE="circe-offline-${revision}";
const ASSETS=${JSON.stringify([...offlineAssets].sort())};
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("circe-offline-")&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{const url=new URL(event.request.url);if(url.origin!==self.location.origin||event.request.method!=="GET")return;if(event.request.mode==="navigate")event.respondWith(fetch(event.request).then(response=>response.status>=500?caches.match("/offline.html").then(page=>page||response):response).catch(()=>caches.match("/offline.html").then(page=>page||Response.error())));else if(ASSETS.includes(url.pathname))event.respondWith(caches.match(event.request).then(asset=>asset||fetch(event.request)));});`,
      );
    },
  };
}
