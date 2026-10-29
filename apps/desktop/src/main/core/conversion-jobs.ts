import { existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  type ConversionJob,
  type ConversionPreset,
  ConversionPresetSchema,
  type ImageCompressionRequest,
} from "../../shared/conversion-contracts";
import { resolveSaveFilePath } from "../ipc/helpers";
import { readBundleJson, writeBundleJson } from "../lib/library-config";
import { resolvePaths } from "../paths";
import type { convertMedia } from "./convert-media";
import type { compressExistingImages } from "./image-compression";
import { libraryAccess } from "./library-access";

export function conversionPresets(
  root = resolvePaths().libraryRoot,
): ConversionPreset[] {
  const file = join(root, "conversion-presets.json");
  const stored = readBundleJson<ConversionPreset[]>(file);
  if (!stored) {
    if (existsSync(file))
      throw new Error("Conversion presets could not be read.");
    return [];
  }
  return z.array(ConversionPresetSchema).parse(stored.data);
}
export function saveConversionPreset(
  preset: ConversionPreset,
): ConversionPreset {
  const parsed = ConversionPresetSchema.parse(preset);
  const presets = conversionPresets().filter((item) => item.id !== parsed.id);
  writeBundleJson(join(resolvePaths().libraryRoot, "conversion-presets.json"), [
    ...presets,
    parsed,
  ]);
  return parsed;
}
export function deleteConversionPreset(id: string): void {
  writeBundleJson(
    join(resolvePaths().libraryRoot, "conversion-presets.json"),
    conversionPresets().filter((item) => item.id !== id),
  );
}

interface ConversionRuntime {
  scope(): string;
  resolve(id: string, fileIndex: number): Promise<string>;
  withSource?<T>(
    id: string,
    fileIndex: number,
    operation: (source: string) => Promise<T>,
  ): Promise<T>;
  convert: typeof convertMedia;
  compress: typeof compressExistingImages;
}
const runtime: ConversionRuntime = {
  scope: () => resolvePaths().libraryRoot,
  async resolve(id, fileIndex) {
    const target = await resolveSaveFilePath(id, fileIndex);
    if (!target.ok) throw new Error(`No file is available for save ${id}.`);
    return target.path;
  },
  async withSource(id, fileIndex, operation) {
    const source = await this.resolve(id, fileIndex);
    return operation(source);
  },
  async convert(input) {
    const { convertMedia } = await import("./convert-media");
    return convertMedia(input);
  },
  async compress(input) {
    const { compressExistingImages } = await import("./image-compression");
    return compressExistingImages(input);
  },
};
export function createConversionJobs(operations: ConversionRuntime) {
  const jobs = new Map<
    string,
    {
      value: ConversionJob;
      controller: AbortController;
      settled: Promise<void>;
    }
  >();
  return {
    start(input: {
      ids: readonly string[];
      fileIndex: number;
      preset: ConversionPreset;
      directory: string;
    }): ConversionJob {
      libraryAccess.assertNewWorkAllowed();
      if (
        [...jobs.values()].filter((job) => job.value.status === "running")
          .length >= 2
      )
        throw new Error(
          "Two conversion jobs are already running. Wait or cancel one before starting another.",
        );
      const scope = operations.scope();
      const ids = [...new Set(input.ids)];
      const value: ConversionJob = {
        id: crypto.randomUUID(),
        kind: "export",
        status: "running",
        completed: 0,
        total: ids.length,
        progress: 0,
        currentId: null,
        directory: input.directory,
        outputs: [],
        changed: 0,
        skipped: 0,
        bytesBefore: 0,
        bytesAfter: 0,
        error: null,
      };
      const controller = new AbortController();
      const settled = Promise.withResolvers<void>();
      jobs.set(value.id, { value, controller, settled: settled.promise });
      for (const [id, job] of jobs) {
        if (jobs.size <= 20) break;
        if (job.value.status !== "running") jobs.delete(id);
      }
      void libraryAccess
        .run(async () => {
          try {
            for (const id of ids) {
              controller.signal.throwIfAborted();
              value.currentId = id;
              if (operations.scope() !== scope)
                throw new Error(
                  "The active library changed. Start the export again.",
                );
              const convert = async (source: string) => {
                if (operations.scope() !== scope)
                  throw new Error(
                    "The active library changed. Start the export again.",
                  );
                return operations.convert({
                  source,
                  directory: input.directory,
                  preset: input.preset,
                  signal: controller.signal,
                  onProgress(progress) {
                    value.progress = Math.min(
                      0.999,
                      (value.completed + progress) / value.total,
                    );
                  },
                });
              };
              const output = operations.withSource
                ? await operations.withSource(id, input.fileIndex, convert)
                : await convert(await operations.resolve(id, input.fileIndex));
              value.outputs.push(output);
              value.completed += 1;
              value.changed += 1;
              value.progress = value.completed / value.total;
            }
            value.currentId = null;
            value.status = controller.signal.aborted ? "cancelled" : "complete";
          } catch (error) {
            value.currentId = null;
            value.status = controller.signal.aborted ? "cancelled" : "failed";
            value.error =
              error instanceof Error ? error.message : "Conversion failed.";
          }
        })
        .finally(() => settled.resolve());
      return structuredClone(value);
    },
    startCompression(input: ImageCompressionRequest): ConversionJob {
      libraryAccess.assertNewWorkAllowed();
      if (
        [...jobs.values()].filter((job) => job.value.status === "running")
          .length >= 2
      )
        throw new Error(
          "Two conversion jobs are already running. Wait or cancel one before starting another.",
        );
      const scope = operations.scope();
      const ids = [...new Set(input.ids)];
      const value: ConversionJob = {
        id: crypto.randomUUID(),
        kind: "compression",
        status: "running",
        completed: 0,
        total: ids.length,
        progress: 0,
        currentId: null,
        directory: "",
        outputs: [],
        changed: 0,
        skipped: 0,
        bytesBefore: 0,
        bytesAfter: 0,
        error: null,
      };
      const controller = new AbortController();
      const settled = Promise.withResolvers<void>();
      jobs.set(value.id, { value, controller, settled: settled.promise });
      void libraryAccess
        .run(async () => {
          try {
            const result = await operations.compress({
              ...input,
              ids,
              signal: controller.signal,
              assertActive() {
                if (operations.scope() !== scope)
                  throw new Error(
                    "The active library changed. Start the compression again.",
                  );
              },
              onProgress(completed, total) {
                value.completed = completed;
                value.progress = total > 0 ? completed / total : 0;
                value.currentId = ids[completed] ?? null;
              },
            });
            value.completed = value.total;
            value.progress = 1;
            value.currentId = null;
            value.changed = result.changed;
            value.skipped = result.skipped;
            value.bytesBefore = result.bytesBefore;
            value.bytesAfter = result.bytesAfter;
            value.status = "complete";
          } catch (error) {
            value.currentId = null;
            value.status = controller.signal.aborted ? "cancelled" : "failed";
            value.error =
              error instanceof Error ? error.message : "Compression failed.";
          }
        })
        .finally(() => settled.resolve());
      return structuredClone(value);
    },
    status(id: string): ConversionJob | null {
      const job = jobs.get(id);
      return job ? structuredClone(job.value) : null;
    },
    cancel(id: string): ConversionJob | null {
      const job = jobs.get(id);
      if (job?.value.status === "running") job.controller.abort();
      return job ? structuredClone(job.value) : null;
    },
    async cancelAll(): Promise<void> {
      const running = [...jobs.values()].filter(
        (job) => job.value.status === "running",
      );
      for (const job of running) job.controller.abort();
      await Promise.all(running.map((job) => job.settled));
    },
  };
}
export const conversionJobs = createConversionJobs(runtime);
