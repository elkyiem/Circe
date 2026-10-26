import { SOURCES, type Source as SourceId } from "@pond/schema/db";
import { z } from "zod";
import {
  isAllPaused,
  pauseAll,
  resumeAll,
  resumeSource,
} from "../core/pipeline/rate-governor";
import {
  cancelAllIngest,
  cancelSavesIngest,
  setReconcilerPaused,
} from "../core/pipeline/reconciler-client";
import { isSourceConnected, refreshSave } from "../core/refresh";
import {
  archiveSiteForSave,
  startArchiveBackfill,
} from "../core/refresh/archive-backfill";
import {
  cancelRefreshBackfill,
  startRefreshBackfill,
} from "../core/refresh/backfill";
import {
  cancelSync,
  getAccountSync,
  isSyncing,
  syncAccount,
  syncAllSources,
} from "../core/sync";
import { getWatch, getWatchSync } from "../core/sync/watches";
import { watchNow } from "../core/watch/run";
import { clearPendingSessionSource } from "../pending-session";
import {
  closeWebSourceConnection,
  openWebSourceConnection,
} from "./source-connection";

const Source = z.enum(SOURCES);
const Id = z.string().min(1).max(200);
export const WebCommandSchema = z.discriminatedUnion("name", [
  z.object({ name: z.literal("pipelinePause"), paused: z.boolean() }),
  z.object({
    name: z.literal("pipelineCancelSaves"),
    ids: z.array(Id).max(100000),
  }),
  z.object({ name: z.literal("pipelineCancelAll") }),
  z.object({ name: z.literal("connectSource"), source: Source }),
  z.object({ name: z.literal("sourceStatus"), source: Source }),
  z.object({
    name: z.literal("clearPendingSession"),
    source: Source.optional(),
  }),
  z.object({
    name: z.literal("syncRunNow"),
    accountId: Id,
    forceFull: z.boolean().optional(),
  }),
  z.object({
    name: z.literal("syncRunAll"),
    forceFull: z.boolean().optional(),
  }),
  z.object({ name: z.literal("syncCancel"), accountId: Id }),
  z.object({ name: z.literal("syncStatus"), accountId: Id }),
  z.object({ name: z.literal("governorSetPaused"), paused: z.boolean() }),
  z.object({ name: z.literal("governorResumeSource"), source: Source }),
  z.object({ name: z.literal("refreshSave"), id: Id }),
  z.object({
    name: z.literal("refreshBackfillStart"),
    source: Source.nullable().optional(),
    onlyMissing: z.boolean().optional(),
    overwrite: z.boolean().optional(),
  }),
  z.object({ name: z.literal("refreshBackfillCancel") }),
  z.object({ name: z.literal("archiveSite"), id: Id }),
  z.object({ name: z.literal("archiveBackfillStart") }),
]);

export async function runWebCommand(
  input: z.infer<typeof WebCommandSchema>,
  connectSource: (source: SourceId) => Promise<{
    ok: boolean;
    mode: "external" | "extension";
  }> = openWebSourceConnection,
) {
  switch (input.name) {
    case "pipelinePause":
      return { ok: true, paused: await setReconcilerPaused(input.paused) };
    case "pipelineCancelSaves":
      return { ok: true, cancelled: await cancelSavesIngest(input.ids) };
    case "pipelineCancelAll":
      return { ok: true, cancelled: await cancelAllIngest() };
    case "connectSource":
      return connectSource(input.source);
    case "sourceStatus":
      return { ok: true, connected: await isSourceConnected(input.source) };
    case "clearPendingSession":
      closeWebSourceConnection(input.source);
      clearPendingSessionSource(input.source);
      return { ok: true };
    case "syncRunNow": {
      if (isSyncing(input.accountId))
        return { ok: false, reason: "already_running" };
      if (await getWatch(input.accountId))
        void watchNow(input.accountId, { trigger: "manual" });
      else
        void syncAccount(input.accountId, {
          trigger: "manual",
          forceFull: input.forceFull ?? false,
        });
      return { ok: true };
    }
    case "syncRunAll":
      void syncAllSources({
        trigger: "manual",
        forceFull: input.forceFull ?? false,
      });
      return { ok: true };
    case "syncCancel": {
      const running = isSyncing(input.accountId);
      cancelSync(input.accountId);
      return { ok: true, running };
    }
    case "syncStatus": {
      const state = (await getWatch(input.accountId))
        ? await getWatchSync(input.accountId)
        : await getAccountSync(input.accountId);
      return {
        ok: true,
        running: isSyncing(input.accountId),
        lastSyncedAt: state.lastSyncedAt,
        lastError: state.lastError,
      };
    }
    case "governorSetPaused":
      if (input.paused) pauseAll();
      else resumeAll();
      return { ok: true, allPaused: isAllPaused() };
    case "governorResumeSource":
      resumeSource(input.source);
      return { ok: true };
    case "refreshSave":
      return refreshSave(input.id);
    case "refreshBackfillStart":
      return startRefreshBackfill({
        source: input.source ?? null,
        onlyMissing: input.onlyMissing ?? false,
        overwrite: input.overwrite ?? false,
      });
    case "refreshBackfillCancel":
      cancelRefreshBackfill();
      return { ok: true };
    case "archiveSite":
      return archiveSiteForSave(input.id);
    case "archiveBackfillStart":
      return startArchiveBackfill();
  }
}
