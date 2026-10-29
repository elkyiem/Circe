import { join } from "node:path";
import { app } from "electron";
import type { QueryInput, QueryResult } from "../../shared/query-contracts";
import type { EagleImportProgress } from "../../shared/saves-import-contracts";
import { dryRunEagleLibrary, importEagleLibrary } from "./eagle-import";
import { readEagleShortcuts } from "./eagle-shortcuts";
import { setPrefs } from "./prefs";

/** Both transports retain the same native import, shortcut policy and progress pacing. */
export async function importEagleWithOptions(
  input: QueryInput<"saves.importEagleLibrary">,
  onProgress?: (progress: EagleImportProgress) => void,
): Promise<QueryResult<"saves.importEagleLibrary">> {
  const path = input.path.trim();
  const discovery = await readEagleShortcuts(
    join(app.getPath("appData"), "Eagle", "Settings"),
  );
  const shortcuts = {
    status: discovery.status,
    importable: Object.keys(discovery.overrides).length,
    imported: 0,
  };
  if (!path)
    return {
      ok: false,
      error: "no_path",
      imported: 0,
      skipped: 0,
      failed: 0,
      deletedSkipped: 0,
      lockedFolders: [],
      droppedFields: [],
      approximatedRules: [],
      shortcuts,
    };
  if (input.dryRun) return { ...(await dryRunEagleLibrary(path)), shortcuts };
  const progressId = input.progressId?.trim();
  let lastProgressAt = 0;
  const result = await importEagleLibrary(path, {
    onProgress:
      progressId && onProgress
        ? (progress) => {
            const now = Date.now();
            if (
              progress.processed > 0 &&
              progress.processed < progress.total &&
              now - lastProgressAt < 100
            )
              return;
            lastProgressAt = now;
            onProgress({ id: progressId, ...progress });
          }
        : undefined,
  });
  if (!input.importShortcuts || !result.ok || !shortcuts.importable)
    return { ...result, shortcuts };
  try {
    await setPrefs({
      shortcuts: { profile: "eagle", overrides: discovery.overrides },
    });
    return {
      ...result,
      shortcuts: { ...shortcuts, imported: shortcuts.importable },
    };
  } catch {
    return { ...result, shortcuts: { ...shortcuts, status: "apply_failed" } };
  }
}
