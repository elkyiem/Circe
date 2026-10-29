import { createHash } from "node:crypto";
import { resolve } from "node:path";
import sharp from "sharp";
import type { Plugin } from "vite";

/** Only the offline explanation and app icons are cached; Library data stays on the host. */
export function browserPwa(): Plugin {
  return {
    name: "circe-pwa",
    async generateBundle(_options, bundle) {
      const revision = createHash("sha256")
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
        "offline.html",
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#0a0a0a"><title>Circé · Reconnect</title><style>html{color-scheme:dark;background:#0a0a0a;color:#eee;font:16px/1.6 system-ui}body{min-height:100dvh;margin:0;display:grid;place-items:center}main{max-width:28rem;padding:32px}img{border-radius:24px}h1{font-size:28px;line-height:1.2}p{color:#bbb}a{display:inline-block;padding:12px 20px;color:#fff;background:#2563eb;border-radius:12px;text-decoration:none}a:focus-visible{outline:3px solid #fff;outline-offset:4px}</style></head><body><main><img src="/app-icon-192.png" width="80" height="80" alt=""><h1>Reconnect to your Library</h1><p>Connect to Tailscale and make sure the computer hosting Circé is awake and running.</p><p>Your Library stays on that computer. Reconnect to continue.</p><a href="/">Try again</a></main></body></html>`,
      );
      emit(
        "app-sw.js",
        `const CACHE="circe-offline-${revision}";
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(["/offline.html","/app-icon-192.png"]))));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("circe-offline-")&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{const url=new URL(event.request.url);if(url.origin!==self.location.origin||event.request.method!=="GET")return;if(event.request.mode==="navigate")event.respondWith(fetch(event.request).then(response=>response.status>=500?caches.match("/offline.html").then(page=>page||response):response).catch(()=>caches.match("/offline.html").then(page=>page||Response.error())));else if(url.pathname==="/app-icon-192.png")event.respondWith(fetch(event.request).catch(()=>caches.match(event.request).then(icon=>icon||Response.error())));});`,
      );
    },
  };
}
