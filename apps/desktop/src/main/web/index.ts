import { join } from "node:path";
import { serve } from "@hono/node-server";
import { app as electronApp } from "electron";
import { IPC } from "../../shared/constants";
import { stringifyWebValue } from "../../shared/web-serialization";
import { registerSyncActionListener } from "../core/executor";
import { setVideoDownloadPrefs } from "../core/prefs";
import { canRedo, canUndo, redo, undo, undoRevision } from "../core/undo";
import { toWireSyncAction } from "../ipc/wire";
import { subscribeBroadcast } from "../lib/broadcast";
import { resolveMainOut } from "../lib/resolve-preload";
import { libraryId } from "../paths";
import { webAgentStream } from "./agent";
import { createWebApp, type WebHost } from "./app";
import { webAccessKey } from "./auth";
import { runWebCommand, WebCommandSchema } from "./commands";
import { webHostConfig } from "./config";
import { openExtensionAuth } from "./extension-auth";
import { createExtensionBridge } from "./extension-bridge";
import { createWebFiles } from "./files";
import { enqueueFixture, fixtureAsset } from "./fixtures";
import { serveWebMedia } from "./media";
import { applyWebTransactions } from "./mutations";
import { runWebQuery } from "./queries";
import { createWebVideo } from "./video";

export async function startWebHost() {
  const sandbox = process.env.POND_SANDBOX;
  if (!sandbox) throw new Error("The Circé web host requires POND_SANDBOX.");
  const { port, origin, origins } = webHostConfig(process.env);
  const fixtures =
    (process.env.CIRCE_WEB_FIXTURES ?? process.env.IRIS_WEB_FIXTURES) === "1";
  const files = createWebFiles(
    join(electronApp.getPath("userData"), "web-files"),
  );
  const video = createWebVideo();
  const key = await webAccessKey(sandbox);
  const extension = createExtensionBridge(
    await openExtensionAuth({
      path: join(sandbox, "extension-connections.json"),
      key,
    }),
  );
  if (fixtures) await setVideoDownloadPrefs({ autoDownload: true }, "twitter");
  const config: WebHost = {
    origin,
    origins,
    key,
    extension: extension.host,
    assets: resolveMainOut("../browser"),
    libraryId,
    query: async (request) => {
      const reply = await runWebQuery(request);
      const headers = new Headers({ "content-type": "application/json" });
      if (reply.revision !== undefined)
        headers.set("x-iris-history", String(reply.revision));
      return new Response(stringifyWebValue(reply.value), {
        headers,
      });
    },
    history: async (action) => {
      const ok = action
        ? await (action.kind === "undo"
            ? undo(action.revision)
            : redo(action.revision))
        : undefined;
      return {
        ok,
        revision: undoRevision(),
        canUndo: canUndo(),
        canRedo: canRedo(),
      };
    },
    mutate: applyWebTransactions,
    command: async (input) =>
      new Response(
        stringifyWebValue(
          await runWebCommand(
            WebCommandSchema.parse(input),
            extension.connectSource,
          ),
        ),
        { headers: { "content-type": "application/json" } },
      ),
    agent: webAgentStream,
    upload: async (request, filename, expected) =>
      Response.json(await files.upload(request, filename, expected)),
    files: files.query,
    download: files.download,
    video: video.query,
    preview: video.media,
    subscribeStatus: (listener) =>
      subscribeBroadcast((channel, payload) => {
        const names = new Map<string, string>([
          [IPC.prefsChanged, "prefs"],
          [IPC.fish, "fish"],
          [IPC.fishOpen, "fish-open"],
          [IPC.sessionImported, "session-imported"],
          [IPC.sessionImportFailed, "session-failed"],
          [IPC.syncStatus, "source-sync"],
          [IPC.storageStatus, "storage"],
          [IPC.updateNotice, "update"],
          [IPC.eagleImportProgress, "import-progress"],
          [IPC.agentFilter, "agent-filter"],
          [IPC.agentCite, "agent-cite"],
          [IPC.agentOverlay, "agent-overlay"],
        ]);
        const name = names.get(channel);
        if (name) listener({ name, data: stringifyWebValue(payload) });
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
  const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port });
  server.once("close", extension.close);
  return server;
}
