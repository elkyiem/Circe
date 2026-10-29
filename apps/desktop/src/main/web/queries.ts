import type { QueryResult } from "../../shared/query-contracts";
import type { WebQueryName } from "../../shared/web-capabilities";
import { WEB_QUERY_ACCESS } from "../../shared/web-capabilities";
import { WebQueryRequestSchema } from "../../shared/web-contracts";
import { withMutationScope } from "../core/executor";
import { undoRevision } from "../core/undo";
import { accountsQueries } from "../ipc/queries/accounts";
import { agentQueries } from "../ipc/queries/agent";
import { apiTokensQueries } from "../ipc/queries/api-tokens";
import { bulkQueries } from "../ipc/queries/bulk";
import { canvasesQueries } from "../ipc/queries/canvases";
import { conversionQueries } from "../ipc/queries/conversion";
import { downloadsQueries } from "../ipc/queries/downloads";
import { enrichmentQueries } from "../ipc/queries/enrichment";
import { fishQueries } from "../ipc/queries/fish";
import { fishMcpQueries } from "../ipc/queries/fish-mcp";
import { foldersQueries } from "../ipc/queries/folders";
import { inspectQueries } from "../ipc/queries/inspect";
import { libraryQueries } from "../ipc/queries/library";
import { libraryRepairQueries } from "../ipc/queries/library-repairs";
import { mediaUnderstandingQueries } from "../ipc/queries/media-understanding";
import { queueQueries } from "../ipc/queries/queue";
import { savedViewsQueries } from "../ipc/queries/saved-views";
import { savesQueries } from "../ipc/queries/saves";
import { settingsQueries } from "../ipc/queries/settings";
import { sourcesQueries } from "../ipc/queries/sources";
import { syncHistoryQueries } from "../ipc/queries/sync-history";
import { tagGroupsQueries } from "../ipc/queries/tag-groups";
import { tagsQueries } from "../ipc/queries/tags";
import { transferJobsQueries } from "../ipc/queries/transfer-jobs";
import { updateQueries } from "../ipc/queries/updates";
import { watchesQueries } from "../ipc/queries/watches";
import { libraryId } from "../paths";
import { updateWebCanvas } from "./canvases";
import { WebRequestError } from "./errors";

const handlers = {
  ...apiTokensQueries,
  ...libraryRepairQueries,
  ...enrichmentQueries,
  ...fishQueries,
  ...fishMcpQueries,
  ...inspectQueries,
  ...transferJobsQueries,
  ...syncHistoryQueries,
  ...sourcesQueries,
  ...mediaUnderstandingQueries,
  ...conversionQueries,
  ...bulkQueries,
  ...agentQueries,
  "saves.mediaTiming": inspectQueries["saves.mediaTiming"],
  ...accountsQueries,
  ...canvasesQueries,
  ...downloadsQueries,
  ...foldersQueries,
  ...libraryQueries,
  ...queueQueries,
  ...savedViewsQueries,
  ...savesQueries,
  ...settingsQueries,
  ...tagGroupsQueries,
  ...tagsQueries,
  ...watchesQueries,
  ...updateQueries,
};

export async function runWebQuery(
  request: ReturnType<typeof WebQueryRequestSchema.parse>,
): Promise<{ value: QueryResult<WebQueryName>; revision: number | undefined }> {
  const {
    name,
    params,
    libraryId: expectedLibrary,
  } = WebQueryRequestSchema.parse(request);
  if (
    name === "libraryRepairs.preview" ||
    name === "libraryRepairs.apply" ||
    name === "libraryRepairs.cancel"
  ) {
    if (expectedLibrary !== libraryId())
      throw new WebRequestError(
        "The active Library changed. Reload before editing.",
      );
    // The job owns its full lifetime and its recoverable commits. Control calls
    // must stay outside that mutation queue so cancellation cannot wait on itself.
    return { value: await handlers[name](params), revision: undefined };
  }
  if (WEB_QUERY_ACCESS[name] === "write") {
    return withMutationScope(async () => {
      if (expectedLibrary !== libraryId())
        throw new WebRequestError(
          "The active Library changed. Reload before editing.",
        );
      const value =
        name === "canvases.update"
          ? updateWebCanvas(params ?? {})
          : await handlers[name](params);
      return { value, revision: undoRevision() };
    });
  }
  return { value: await handlers[name](params), revision: undefined };
}
