import { mapConcurrent } from "@shared/map-concurrent";
import type { EagleImportProgress } from "@shared/saves-import-contracts";
import {
  WebEagleImportSchema,
  WebRelativePathSchema,
} from "@shared/web-files-contracts";
import type { WebValue } from "@shared/web-serialization";
import { z } from "zod";

interface EagleSelection {
  files: File[];
  tokens: Set<string>;
  uploads: Map<File, Promise<string>>;
  disposed: boolean;
  running: boolean;
}

export function createBrowserEagleImport(input: {
  pick(): Promise<File[]>;
  upload(file: File): Promise<string>;
  remove(token: string, keepalive?: boolean): Promise<void>;
  request(path: string, body: string): Promise<WebValue>;
  progress(value: EagleImportProgress): void;
}) {
  const selections = new Map<string, EagleSelection>();
  let listening = false;
  let generation = 0;
  async function cleanup(selection: EagleSelection, keepalive = false) {
    selection.disposed = true;
    await Promise.allSettled(
      [...selection.tokens].map((token) => input.remove(token, keepalive)),
    );
    selection.tokens.clear();
  }
  function listen() {
    if (listening) return;
    listening = true;
    window.addEventListener("pagehide", () => {
      generation++;
      for (const selection of selections.values())
        void cleanup(selection, true);
      selections.clear();
    });
  }
  return {
    async pick() {
      listen();
      const picking = generation;
      const files = await input.pick();
      if (!files.length || picking !== generation)
        return { ok: false, reason: "cancelled" };
      if (files.length > 1000000)
        throw new Error(
          "Choose an Eagle Library containing at most 1,000,000 files per import.",
        );
      for (const file of files)
        WebRelativePathSchema.parse(file.webkitRelativePath);
      const path = `iris-eagle:${crypto.randomUUID()}`;
      selections.set(path, {
        files,
        tokens: new Set(),
        uploads: new Map(),
        disposed: false,
        running: false,
      });
      return { ok: true, path };
    },
    async import(raw: Record<string, z.infer<ReturnType<typeof z.json>>>) {
      const params = z
        .strictObject({
          path: z.string(),
          dryRun: z.boolean().optional(),
          importShortcuts: z.boolean().optional(),
          progressId: z.string().optional(),
        })
        .parse(raw);
      const selection = selections.get(params.path);
      if (!selection)
        throw new Error(
          "Choose the Eagle Library folder again on this device.",
        );
      if (selection.running || selection.disposed)
        throw new Error("This Eagle import is already running or has ended.");
      selection.running = true;
      let retain = false;
      let completed = 0;
      const progress = () => {
        if (params.progressId)
          input.progress({
            id: params.progressId,
            stage: "uploading",
            processed: completed,
            total: selection.files.length,
            imported: 0,
            skipped: 0,
            failed: 0,
          });
      };
      progress();
      try {
        const files = await mapConcurrent(selection.files, 4, async (file) => {
          let upload = selection.uploads.get(file);
          if (!upload) {
            upload = input.upload(file);
            selection.uploads.set(file, upload);
          }
          const token = await upload;
          if (selection.disposed) {
            await input.remove(token, true);
            throw new Error(
              "The Eagle import was interrupted. Choose the folder again.",
            );
          }
          selection.tokens.add(token);
          completed++;
          progress();
          return { token, path: file.webkitRelativePath };
        });
        const result = await input.request(
          "files",
          JSON.stringify({
            name: "saves.importEagleLibrary",
            params: WebEagleImportSchema.parse({
              files,
              dryRun: params.dryRun,
              importShortcuts: params.importShortcuts,
              progressId: params.progressId,
            }),
          }),
        );
        retain = params.dryRun === true;
        return result;
      } finally {
        selection.running = false;
        if (!retain) {
          await cleanup(selection);
          selections.delete(params.path);
        }
      }
    },
  };
}
