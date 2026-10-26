import { serve } from "@hono/node-server";
import { stringifyWebValue } from "../../shared/web-serialization";
import { registerSyncActionListener } from "../core/executor";
import { setVideoDownloadPrefs } from "../core/prefs";
import { toWireSyncAction } from "../ipc/wire";
import { resolveMainOut } from "../lib/resolve-preload";
import { libraryId } from "../paths";
import { createWebApp, type WebHost } from "./app";
import { webAccessKey } from "./auth";
import { enqueueFixture, fixtureAsset } from "./fixtures";
import { serveWebMedia } from "./media";
import { runWebQuery } from "./queries";

export async function startWebHost() {
  const sandbox = process.env.POND_SANDBOX;
  if (!sandbox) throw new Error("The Iris web host requires POND_SANDBOX.");
  const port = Number(process.env.IRIS_WEB_PORT ?? 4789);
  const origin = process.env.IRIS_WEB_ORIGIN ?? `http://127.0.0.1:${port}`;
  const fixtures = process.env.IRIS_WEB_FIXTURES === "1";
  if (fixtures) await setVideoDownloadPrefs({ autoDownload: true }, "twitter");
  const config: WebHost = {
    origin,
    key: await webAccessKey(sandbox),
    assets: resolveMainOut("../browser"),
    libraryId,
    query: async (request) =>
      new Response(stringifyWebValue(await runWebQuery(request)), {
        headers: { "content-type": "application/json" },
      }),
    media: serveWebMedia,
    subscribe: (listener) =>
      registerSyncActionListener((action) =>
        listener(toWireSyncAction(action)),
      ),
  };
  if (fixtures) {
    config.fixture = (kind) => enqueueFixture(kind, `http://127.0.0.1:${port}`);
    config.fixtureAsset = fixtureAsset;
  }
  const app = createWebApp(config);
  return serve({ fetch: app.fetch, hostname: "127.0.0.1", port });
}
