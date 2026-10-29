import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import log from "electron-log/main.js";
import { z } from "zod";
import { libraryRoot } from "../paths";
import { createAutoImportConfiguration } from "./auto-import-configuration";
import { createAutoImportOwner } from "./auto-import-owner";
import { emitFeedback } from "./feedback";
import { createManualSave } from "./manual-import";
import { getPrefs, setPrefs } from "./prefs";

const AutoImportLogSchema = z.object({
  entries: z.array(
    z.object({
      at: z.number(),
      name: z.string(),
      mode: z.enum(["copy", "move"]),
      ok: z.boolean(),
      id: z.string().optional(),
    }),
  ),
});
type AutoImportLog = z.infer<typeof AutoImportLogSchema>;

const owner = createAutoImportOwner({
  create: createWorker,
  warn: (error) => log.warn("[pond auto-import] scan failed", error),
});
let quitting = false;

const configuration = createAutoImportConfiguration({
  read: async () => (await getPrefs()).autoImport,
  normalize: async (next) => {
    if (next.enabled) {
      const { autoImportLocation } = await import("./auto-import-location");
      next.path = (await autoImportLocation(next.path, libraryRoot())).path;
    }
    return next;
  },
  write: async (config) => {
    await setPrefs({ autoImport: config });
  },
  start: () => owner.start(),
});
export const configureAutoImport = configuration.configure;

function logPath(root = libraryRoot()): string {
  return join(root, "auto-import-log.json");
}

async function readLogFile(root: string): Promise<AutoImportLog> {
  let raw: string;
  try {
    raw = await readFile(logPath(root), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return { entries: [] };
    throw error;
  }
  return AutoImportLogSchema.parse(JSON.parse(raw));
}

export function readAutoImportLog(): Promise<AutoImportLog> {
  return readLogFile(libraryRoot());
}

export const stopAutoImport = owner.stop;
export function startAutoImport(): Promise<void> {
  return quitting ? Promise.resolve() : owner.start();
}
export async function shutdownAutoImport(): Promise<void> {
  quitting = true;
  const configured = configuration.close();
  try {
    await owner.stop();
  } finally {
    await configured;
  }
}

async function createWorker() {
  const root = libraryRoot();
  const prefs = await getPrefs();
  const cfg = prefs.autoImport;
  if (!cfg.enabled || !cfg.path) return null;
  const [{ autoImportLocation }, { createAutoImportWorker }] =
    await Promise.all([
      import("./auto-import-location"),
      import("./auto-import-worker"),
    ]);
  const selected = await autoImportLocation(cfg.path, root);
  const next = await createAutoImportWorker({
    directory: selected.path,
    checkpointPath: join(root, "auto-import-checkpoints.json"),
    mode: cfg.mode,
    async ingest(input) {
      if (libraryRoot() !== root)
        throw new Error("The import library changed.");
      return createManualSave({
        filePaths: [input.path],
        sourceId: input.sourceId,
      });
    },
    async report(entry) {
      try {
        const history = await readLogFile(root);
        history.entries = [
          { ...entry, at: Date.now(), mode: cfg.mode },
          ...history.entries,
        ].slice(0, 200);
        await mkdir(root, { recursive: true });
        await writeFile(logPath(root), JSON.stringify(history, null, 2));
      } catch (error) {
        log.warn("[pond auto-import] import log not updated", error);
      }
      if (entry.ok) {
        await emitFeedback("autoImport").catch((error) =>
          log.warn("[pond auto-import] feedback failed", error),
        );
      }
    },
  });
  return {
    stop: next.stop,
    async scan() {
      const location = await autoImportLocation(selected.path, root);
      if (location.dev !== selected.dev || location.ino !== selected.ino)
        throw new Error(
          "The watched folder was replaced. Choose it again before importing.",
        );
      await next.scan();
    },
  };
}
