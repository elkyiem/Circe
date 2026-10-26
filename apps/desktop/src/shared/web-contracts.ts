import { z } from "zod";
import type { QueryName } from "./query-contracts";

/** Browser access is deliberately independent of the Agent operation catalog. */
const WEB_QUERY_NAMES = [
  "saves.listPage",
  "saves.list",
  "saves.get",
  "saves.getMany",
  "saves.rawJson",
  "saves.mediaTiming",
  "saves.queryPage",
  "saves.queryIds",
  "saves.queryCount",
  "saves.query",
  "saves.searchFts",
  "saves.sidebarCounts",
  "saves.listBlankDocuments",
  "folders.list",
  "folders.memberships",
  "folders.create",
  "folders.rename",
  "folders.setSaveFolders",
  "folders.addSaves",
  "folders.assign",
  "folders.summaries",
  "folders.downloading",
  "folders.metadata.get",
  "folders.rules.get",
  "savedViews.list",
  "tags.list",
  "tagGroups.list",
  "downloads.activity",
  "downloads.history",
  "downloads.ingestingOrFailed",
  "queue.summary",
  "queue.sourceGates",
  "queue.generations",
  "queue.attempts",
  "pipeline.status",
  "pipeline.inflight",
  "accounts.list",
  "watches.list",
  "canvases.list",
  "settings.getPrefs",
  "library.info",
  "updates.currentNotice",
] as const satisfies readonly QueryName[];

export const WebQueryNameSchema = z.enum(WEB_QUERY_NAMES);
export const WebQueryRequestSchema = z.object({
  name: WebQueryNameSchema,
  params: z.record(z.string(), z.json()).optional(),
});

export const WebSessionSchema = z.object({
  libraryId: z.string(),
  fixtures: z.boolean(),
});
export const WebFixtureSchema = z.enum(["quote", "image", "video"]);
