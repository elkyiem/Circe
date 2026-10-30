import { saves } from "@pond/schema/db";
import type { Transaction } from "@pond/schema/tx";
import { inArray } from "drizzle-orm";
import { BrowserWindow, powerMonitor } from "electron";
import log from "electron-log/main.js";
import { z } from "zod";
import {
  ENRICHMENT_IPC,
  type EnrichmentCommandValue,
  EnrichmentOwnerReplySchema,
  type EnrichmentStatus,
  EnrichmentStatusSchema,
  type EnrichmentTask,
  type HostInference,
  HostInferenceResultSchema,
} from "../../shared/enrichment-contracts";
import { getDb } from "../db";
import { safeHandle } from "../ipc/helpers";
import { mediaProcessingQueries } from "../ipc/queries/media-processing";
import {
  createMediaUnderstandingQueries,
  mediaUnderstandingQueries,
} from "../ipc/queries/media-understanding";
import { savesQueries } from "../ipc/queries/saves";
import { settingsQueries } from "../ipc/queries/settings";
import { tagsQueries } from "../ipc/queries/tags";
import { sampleFramesQuery, videoQueries } from "../ipc/queries/video";
import { broadcast } from "../lib/broadcast";
import { resolveMainOut, resolvePreload } from "../lib/resolve-preload";
import { libraryId } from "../paths";
import { invalidateEnrichmentTask } from "./enrichment-tasks";
import { executeTransaction, withMutationScope } from "./executor";
import { libraryAccess } from "./library-access";
import { persistSave } from "./persist-save";
import { getPrefs } from "./prefs";
import { recordForUndo } from "./undo";
import { hasUserTitle } from "./user-metadata";

interface Owner {
  window: BrowserWindow;
  abort: AbortController;
  library: string;
  ready: Promise<void>;
  resolve(): void;
  reject(error: Error): void;
}
let owner: Owner | null = null;
let registered = false;
let quitting = false;
let sequence = 0;
let state: EnrichmentStatus = {
  state: "starting",
  inflight: 0,
  activeKeys: [],
  failedKeys: [],
};
const pending = new Map<
  number,
  {
    resolve(value: EnrichmentCommandValue): void;
    reject(error: Error): void;
    timer: ReturnType<typeof setTimeout>;
    bytes: number;
  }
>();
const reads = {
  "settings.getPrefs": settingsQueries["settings.getPrefs"],
  "saves.list": savesQueries["saves.list"],
  "saves.listPage": savesQueries["saves.listPage"],
  "saves.getMany": savesQueries["saves.getMany"],
  "saves.getEmbedding": savesQueries["saves.getEmbedding"],
  "saves.setEmbedding": savesQueries["saves.setEmbedding"],
  "saves.patchDerived": savesQueries["saves.patchDerived"],
  "tags.list": tagsQueries["tags.list"],
  "video.sampleFrames": videoQueries["video.sampleFrames"],
  "media.decodeAudio": mediaProcessingQueries["media.decodeAudio"],
  "saves.understandMedia": mediaUnderstandingQueries["saves.understandMedia"],
};
const Names = z.enum(Object.keys(reads));
const QueryName = z.custom<keyof typeof reads>(
  (value) => Names.safeParse(value).success,
);
function current(sender: number): Owner {
  if (
    !owner ||
    owner.window.webContents.id !== sender ||
    owner.library !== libraryId()
  )
    throw new Error("This enrichment owner is no longer active.");
  return owner;
}
function publish(next: EnrichmentStatus): void {
  state = EnrichmentStatusSchema.parse(next);
  broadcast(ENRICHMENT_IPC.status, state);
}
function fail(error: Error): void {
  owner?.reject(error);
  for (const job of pending.values()) {
    clearTimeout(job.timer);
    job.reject(error);
  }
  pending.clear();
  publish({
    state: "failed",
    inflight: 0,
    activeKeys: [],
    failedKeys: state.failedKeys,
    error: error.message.slice(0, 1000),
  });
}
function register(): void {
  if (registered) return;
  registered = true;
  safeHandle(ENRICHMENT_IPC.query, (event, name: string, params) => {
    const active = current(event.sender.id);
    const parsed = QueryName.parse(name);
    return libraryAccess.run(async () => {
      if (owner !== active) throw new Error("This enrichment owner stopped.");
      const input = z.record(z.string(), z.unknown()).parse(params ?? {});
      if (parsed === "saves.understandMedia")
        return createMediaUnderstandingQueries({
          signal: () => active.abort.signal,
        })[parsed](input);
      if (parsed === "video.sampleFrames")
        return sampleFramesQuery(active.abort.signal)(input);
      return reads[parsed](input);
    });
  });
  safeHandle(ENRICHMENT_IPC.title, (event, raw) => {
    const active = current(event.sender.id);
    const input = z
      .object({
        id: z.string().min(1),
        title: z.string().min(1).max(80),
        before: z.string().nullable(),
      })
      .strict()
      .parse(raw);
    return libraryAccess.run(() =>
      withMutationScope(async () => {
        if (owner !== active) throw new Error("This enrichment owner stopped.");
        const rows = await savesQueries["saves.getMany"]({ ids: [input.id] });
        const row = rows[0];
        if (!row || row.title?.trim() || hasUserTitle(input.id)) return;
        const tx: Transaction = {
          kind: "update",
          model: "save",
          id: input.id,
          before: { title: row.title },
          patch: { title: input.title },
          titleLock: { before: false, after: true },
          meta: { actor: "user", actorReason: "ai:auto-title" },
        };
        await executeTransaction(tx);
        recordForUndo(tx);
      }),
    );
  });
  safeHandle(ENRICHMENT_IPC.ready, (event, error?: string) => {
    const active = current(event.sender.id);
    if (error) {
      fail(new Error(String(error).slice(0, 1000)));
      return;
    }
    active.resolve();
    publish({ ...state, state: "ready" });
  });
  safeHandle(ENRICHMENT_IPC.reply, (event, raw) => {
    current(event.sender.id);
    const reply = EnrichmentOwnerReplySchema.parse(raw);
    const job = pending.get(reply.id);
    if (!job) return;
    pending.delete(reply.id);
    clearTimeout(job.timer);
    if ("error" in reply) job.reject(new Error(reply.error));
    else job.resolve(reply.value);
  });
  safeHandle(ENRICHMENT_IPC.status, (event, raw) => {
    current(event.sender.id);
    publish(EnrichmentStatusSchema.parse(raw));
  });
  powerMonitor.on("suspend", () => stopEnrichmentOwner());
  powerMonitor.on("resume", () => {
    if (libraryAccess.isOpen())
      void startEnrichmentOwner().catch((error) =>
        log.error("[enrichment] resume failed", error),
      );
  });
}
export async function startEnrichmentOwner(): Promise<void> {
  if (quitting) throw new Error("The host is shutting down.");
  if (owner && state.state === "failed") stopEnrichmentOwner();
  if (owner) return owner.ready;
  libraryAccess.assertNewWorkAllowed();
  register();
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: resolvePreload("enrichment.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  let resolve: () => void = () => {};
  let reject: (error: Error) => void = () => {};
  const ready = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const active = {
    window,
    library: libraryId(),
    ready,
    resolve,
    reject,
    abort: new AbortController(),
  };
  owner = active;
  publish({ state: "starting", inflight: 0, activeKeys: [], failedKeys: [] });
  const timer = setTimeout(() => {
    if (owner === active)
      fail(
        new Error("The enrichment owner did not start. Retry Check Library."),
      );
  }, 30000);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("console-message", (event) => {
    if (event.level === "warning" || event.level === "error")
      log.warn("[enrichment owner]", event.message);
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    if (owner === active) {
      fail(
        new Error(
          `Enrichment renderer stopped (${details.reason}). Retry Check Library.`,
        ),
      );
      active.abort.abort();
      owner = null;
      if (!window.isDestroyed()) window.destroy();
    }
  });
  window.once("closed", () => {
    if (owner === active) {
      fail(
        new Error(
          "The enrichment owner closed unexpectedly. Retry Check Library.",
        ),
      );
      active.abort.abort();
      owner = null;
    }
  });
  try {
    await Promise.all([
      ready,
      process.env.ELECTRON_RENDERER_URL
        ? window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/enrichment.html`)
        : window.loadFile(resolveMainOut("../renderer/enrichment.html")),
    ]);
  } catch (error) {
    if (owner === active) {
      fail(
        error instanceof Error
          ? error
          : new Error("Enrichment startup failed."),
      );
      owner = null;
    }
    if (!window.isDestroyed()) window.destroy();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
export function stopEnrichmentOwner(shutdown = false): void {
  if (shutdown) quitting = true;
  const active = owner;
  owner = null;
  active?.abort.abort();
  active?.reject(new Error("Enrichment owner stopped."));
  for (const job of pending.values()) {
    clearTimeout(job.timer);
    job.reject(new Error("Enrichment paused for the host transition."));
  }
  pending.clear();
  if (active && !active.window.isDestroyed()) active.window.destroy();
  publish({ state: "paused", inflight: 0, activeKeys: [], failedKeys: [] });
}
async function command(
  kind: "task" | "infer",
  input: EnrichmentTask | HostInference,
): Promise<EnrichmentCommandValue> {
  libraryAccess.assertNewWorkAllowed();
  await startEnrichmentOwner();
  libraryAccess.assertNewWorkAllowed();
  if (!owner || owner.library !== libraryId())
    throw new Error("The Library changed. Retry this action.");
  if (pending.size >= 16)
    throw new Error("Wait for the current enrichment requests to finish.");
  const bytes =
    "op" in input
      ? "image" in input
        ? input.image.data.byteLength
        : "images" in input
          ? input.images.reduce((sum, image) => sum + image.data.byteLength, 0)
          : "frames" in input
            ? input.frames.reduce(
                (sum, frame) => sum + frame.image.data.byteLength,
                0,
              )
            : "audio" in input
              ? input.audio.byteLength
              : 0
      : 0;
  if (
    [...pending.values()].reduce((sum, job) => sum + job.bytes, bytes) >
    512 * 1024 * 1024
  )
    throw new Error("Wait for the current media processing to finish.");
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      // Retain admission until the owner settles the timed-out work.
      reject(
        new Error(
          "Enrichment request timed out. Check processing status and retry.",
        ),
      );
    }, 180000);
    pending.set(id, { resolve, reject, timer, bytes });
    const active = owner;
    if (!active) {
      clearTimeout(timer);
      pending.delete(id);
      reject(new Error("The enrichment owner stopped."));
      return;
    }
    active.window.webContents.send(ENRICHMENT_IPC.command, { id, kind, input });
  });
}
export const enrichmentOwner = {
  status: () => state,
  run: async (input: EnrichmentTask) => {
    libraryAccess.assertNewWorkAllowed();
    const result = await invalidateEnrichmentTask(input, {
      prefs: getPrefs,
      rows: async (ids) => {
        const db = await getDb();
        return db
          .select({
            id: saves.id,
            deletedAt: saves.deletedAt,
            captionModel: saves.captionModel,
            ocrModel: saves.ocrModel,
            transcriptModel: saves.transcriptModel,
            embeddingModel: saves.embeddingModel,
            clipModel: saves.clipModel,
            sensitiveModel: saves.sensitiveModel,
          })
          .from(saves)
          .where(ids ? inArray(saves.id, ids) : undefined)
          .all();
      },
      persist: async (id, patch) =>
        Boolean(
          await persistSave(id, patch, {
            actorReason: `enrichment:retry:${input.kind}`,
          }),
        ),
    });
    if (result.ok) await command("task", { kind: "scan", ids: input.ids });
    return { ok: result.ok, message: result.message };
  },
  infer: async (input: HostInference) =>
    HostInferenceResultSchema.parse(await command("infer", input)),
};
