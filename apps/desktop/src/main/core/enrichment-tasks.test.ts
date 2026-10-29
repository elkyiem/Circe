import { DEFAULT_PREFS } from "@pond/schema";
import { expect, it } from "vitest";
import {
  type EnrichmentTaskRow,
  invalidateEnrichmentTask,
} from "./enrichment-tasks";

const row = (): EnrichmentTaskRow => ({
  id: "save",
  deletedAt: null,
  captionModel: "current",
  ocrModel: null,
  transcriptModel: null,
  embeddingModel: null,
  clipModel: null,
  sensitiveModel: null,
});
it("acknowledges a rerun only after invalidation is durable and survives fresh reads", async () => {
  let stored = row();
  let release = () => {};
  const persistence = new Promise<void>((resolve) => {
    release = resolve;
  });
  let acknowledged = false;
  const operation = invalidateEnrichmentTask(
    { kind: "caption", ids: ["save"] },
    {
      prefs: async () => ({ ai: { ...DEFAULT_PREFS.ai, enableCaption: true } }),
      rows: async (ids) => {
        expect(ids).toEqual(["save"]);
        return [{ ...stored }];
      },
      persist: async (id, patch) => {
        expect(id).toBe("save");
        await persistence;
        stored = { ...stored, ...patch };
        return true;
      },
    },
  ).then((result) => {
    acknowledged = true;
    return result;
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(acknowledged).toBe(false);
  expect(stored.captionModel).toBe("current");
  release();
  await expect(operation).resolves.toMatchObject({ ok: true, count: 1 });
  expect({ ...stored }.captionModel).toBe(null);
});
it("rejects failed persistence and leaves disabled tasks untouched", async () => {
  const store = {
    prefs: async () => ({ ai: { ...DEFAULT_PREFS.ai, enableCaption: true } }),
    rows: async () => [row()],
    persist: async () => {
      throw new Error("Disk unavailable");
    },
  };
  await expect(
    invalidateEnrichmentTask({ kind: "caption" }, store),
  ).rejects.toThrow("Disk unavailable");
  await expect(
    invalidateEnrichmentTask(
      { kind: "caption" },
      {
        ...store,
        prefs: async () => ({
          ai: { ...DEFAULT_PREFS.ai, enableCaption: false },
        }),
      },
    ),
  ).resolves.toMatchObject({ ok: false, count: 0 });
});
