import type { NewSave, Prefs, Save } from "@pond/schema/db";
import type { EnrichmentTask } from "../../shared/enrichment-contracts";

const TASKS = {
  caption: {
    pref: "enableCaption",
    model: "captionModel",
    name: "Image Captions",
  },
  ocr: { pref: "enableOcr", model: "ocrModel", name: "Text in Images" },
  transcribe: {
    pref: "enableTranscript",
    model: "transcriptModel",
    name: "Transcription",
  },
  reembed: {
    pref: "semanticSearch",
    model: "embeddingModel",
    name: "Semantic Search",
  },
  clip: { pref: "enableClip", model: "clipModel", name: "Visual Similarity" },
  sensitiveContent: {
    pref: "enableSensitiveContent",
    model: "sensitiveModel",
    name: "Sensitive Content",
  },
} as const;
type ModelField = (typeof TASKS)[keyof typeof TASKS]["model"];
export type EnrichmentTaskRow = Pick<Save, "id" | "deletedAt" | ModelField>;
interface EnrichmentTaskStore {
  prefs(): Promise<Pick<Prefs, "ai">>;
  rows(ids?: string[]): Promise<EnrichmentTaskRow[]>;
  persist(id: string, patch: Partial<NewSave>): Promise<boolean>;
}
/** A retry is acknowledged only after its model invalidation survives an owner restart. */
export async function invalidateEnrichmentTask(
  task: EnrichmentTask,
  store: EnrichmentTaskStore,
) {
  if (task.kind === "scan")
    return { ok: true, count: 0, message: "Enrichment sweep started." };
  const definition = TASKS[task.kind];
  if (!(await store.prefs()).ai[definition.pref])
    return {
      ok: false,
      count: 0,
      message: `Turn on ${definition.name} in Enrichments first.`,
    };
  const rows = await store.rows(task.ids?.length ? task.ids : undefined);
  let count = 0;
  for (const row of rows) {
    if (row.deletedAt || row[definition.model] == null) continue;
    if (!(await store.persist(row.id, { [definition.model]: null })))
      throw new Error(
        "This Save is no longer available. Check the Library and retry.",
      );
    count++;
  }
  return {
    ok: true,
    count,
    message: count
      ? `Reprocessing ${count} ${count === 1 ? "item" : "items"} in the background.`
      : "Checking for items to reprocess.",
  };
}
