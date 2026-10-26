import { DEFAULT_PREFS } from "@pond/schema";
import { WebQueryRequestSchema } from "../../shared/web-contracts";
import { accountsQueries } from "../ipc/queries/accounts";
import { canvasesQueries } from "../ipc/queries/canvases";
import { downloadsQueries } from "../ipc/queries/downloads";
import { foldersQueries } from "../ipc/queries/folders";
import { inspectQueries } from "../ipc/queries/inspect";
import { libraryQueries } from "../ipc/queries/library";
import { queueQueries } from "../ipc/queries/queue";
import { savedViewsQueries } from "../ipc/queries/saved-views";
import { savesQueries } from "../ipc/queries/saves";
import { settingsQueries } from "../ipc/queries/settings";
import { tagGroupsQueries } from "../ipc/queries/tag-groups";
import { tagsQueries } from "../ipc/queries/tags";
import { watchesQueries } from "../ipc/queries/watches";

const handlers = {
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
  // Browser preferences belong to the visiting device; never return host configuration.
  "settings.getPrefs": () => ({ ...DEFAULT_PREFS, setup: { version: 1 } }),
  "updates.currentNotice": () => null,
};

export async function runWebQuery(
  request: ReturnType<typeof WebQueryRequestSchema.parse>,
) {
  const { name, params } = WebQueryRequestSchema.parse(request);
  return handlers[name](params);
}
