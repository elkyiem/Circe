import { RawImage } from "@huggingface/transformers";
import {
  type EnrichmentOwnerCommand,
  EnrichmentOwnerCommandSchema,
  type EnrichmentOwnerReply,
  type EnrichmentStatus,
  EnrichmentTaskSchema,
  type HostInference,
  HostInferenceSchema,
} from "@shared/enrichment-contracts";
import { z } from "zod";
import * as inference from "@/features/enrichment/lib/inference-client";
import { startEnrichmentSweep } from "@/features/enrichment/lib/sweep";
import * as tasks from "@/features/enrichment/lib/tasks";
import { enrichmentMonitor } from "@/features/enrichment/state/enrichment-monitor";
import { SavePatchesSchema } from "@/features/saves/lib/reconcile";
import { applyActionCoalesced } from "@/features/saves/lib/sync-coalesce";
import { createSaveBootstrap } from "@/features/saves/state/save-bootstrap";
import { loadPrefs } from "@/shared/state/prefs";

declare global {
  interface Window {
    enrichmentOwner: {
      ready(error?: string): Promise<void>;
      status(status: EnrichmentStatus): Promise<void>;
      reply(reply: EnrichmentOwnerReply): Promise<void>;
      onCommand(callback: (raw: EnrichmentOwnerCommand) => void): () => void;
    };
  }
}
const Page = z.object({
  rows: SavePatchesSchema,
  nextCursor: z.object({ savedAt: z.number(), id: z.string() }).nullable(),
  total: z.number().nullable(),
});
const bootstrap = createSaveBootstrap({
  readSnapshot: async () => [],
  scheduleSnapshotWrite: () => {},
  applyActionCoalesced,
  rendererReady: () => {},
  onSyncAction: window.pond.onSyncAction,
  loadAll: async () =>
    SavePatchesSchema.parse(await window.pond.query("saves.list", {})),
  loadPage: async (params) =>
    Page.parse(await window.pond.query("saves.listPage", params)),
});
function image(input: {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  channels: 1 | 2 | 3 | 4;
}) {
  return new RawImage(input.data, input.width, input.height, input.channels);
}
async function infer(input: HostInference) {
  switch (input.op) {
    case "florence":
      return inference.inferFlorence(image(input.image), input.task);
    case "clipImage":
      return Array.from(await inference.inferClipImage(image(input.image)));
    case "clipAesthetic":
      return inference.inferClipAesthetic(image(input.image), input.labels);
    case "sensitiveContent":
      return inference.inferSensitiveContent(input.images.map(image));
    case "embedText":
      return Array.from(await inference.inferEmbedText(input.text));
    case "embedTexts":
      return (await inference.inferEmbedTexts(input.texts)).map((v) =>
        Array.from(v),
      );
    case "embedAudio":
      return Array.from(
        await inference.inferEmbedAudio(Float32Array.from(input.audio)),
      );
    case "transcribe":
      return inference.inferTranscribe(Float32Array.from(input.audio));
    case "embedVideoFrames":
      return Array.from(
        await inference.inferEmbedVideoFrames(
          input.frames.map((f) => ({
            image: image(f.image),
            timestamp: f.timestamp,
          })),
          input.duration,
        ),
      );
  }
}
const TASKS = {
  scan: tasks.runEnrichment,
  caption: tasks.recaption,
  ocr: tasks.reocr,
  transcribe: tasks.retranscribe,
  reembed: tasks.reembed,
  clip: tasks.rebuildVisualIndex,
  sensitiveContent: tasks.reclassifySensitiveContent,
};
window.enrichmentOwner.onCommand((raw) => {
  const command = EnrichmentOwnerCommandSchema.parse(raw);
  void (async () => {
    try {
      let value:
        | Awaited<ReturnType<typeof infer>>
        | Awaited<ReturnType<typeof tasks.runEnrichment>>;
      if (command.kind === "infer")
        value = await infer(HostInferenceSchema.parse(command.input));
      else {
        const task = EnrichmentTaskSchema.parse(command.input);
        value = await TASKS[task.kind](task.ids);
      }
      await window.enrichmentOwner.reply({ id: command.id, value });
    } catch (error) {
      await window.enrichmentOwner.reply({
        id: command.id,
        error: (error instanceof Error
          ? error.message
          : "Enrichment request failed."
        ).slice(0, 1000),
      });
    }
  })();
});
let workerFailure: string | undefined;
let publishTimer: ReturnType<typeof setTimeout> | undefined;
window.addEventListener("enrichment-worker-failed", (event) => {
  const error = z
    .string()
    .catch("The inference worker stopped.")
    .parse(event instanceof CustomEvent ? event.detail : undefined);
  workerFailure = error;
  void window.enrichmentOwner.status({
    state: "failed",
    inflight: 0,
    activeKeys: [],
    failedKeys: [],
    error,
  });
});
function publish() {
  const value = enrichmentMonitor.snapshot();
  void window.enrichmentOwner.status({
    state: workerFailure ? "failed" : "ready",
    error: workerFailure,
    inflight: value.inflight,
    activeKeys: [...value.activeKeys],
    failedKeys: [...value.failedKeys],
  });
}
void (async () => {
  try {
    await loadPrefs();
    await bootstrap.bootPool();
    await bootstrap.hydrateFullPool();
    enrichmentMonitor.subscribe(() => {
      if (!publishTimer)
        publishTimer = setTimeout(() => {
          publishTimer = undefined;
          publish();
        }, 250);
    });
    startEnrichmentSweep();
    await window.enrichmentOwner.ready();
    publish();
  } catch (error) {
    await window.enrichmentOwner.ready(
      error instanceof Error ? error.message : "Enrichment startup failed.",
    );
  }
})();
