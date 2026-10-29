import { app, BrowserWindow } from "electron";
import log from "electron-log/main.js";
import { userError } from "../../../shared/user-error";
import { startAutoImport, stopAutoImport } from "../../core/auto-import";
import { closeCombineImagesWindow } from "../../core/combine-images-window";
import { resumeMutations, suspendMutations } from "../../core/executor";
import { libraryAccess } from "../../core/library-access";
import {
  resumeLibraryTransfers,
  stopLibraryTransfers,
} from "../../core/library-transfers";
import { downloadActivity } from "../../core/pipeline/download-activity";
import { createLibraryWorkCoordinator } from "../../core/pipeline/library-work-coordinator";
import {
  pauseAndDrainReconciler,
  setReconcilerPaused,
} from "../../core/pipeline/reconciler-client";
import { invalidatePrefs } from "../../core/prefs";
import { closePreviewWindows } from "../../core/preview-windows";
import { reconcileLibrary } from "../../core/scan";
import {
  startStorageWatcher,
  stopStorageWatcher,
} from "../../core/storage-watcher";
import { flushTagsDump, hydrateTagsFromBundle } from "../../core/tags-bundle";
import { clearUndoHistory } from "../../core/undo";
import { closeDb, drainDb } from "../../db";
import { rotateBundleBackups } from "../../lib/library-config";
import { invalidatePaths, resolvePaths } from "../../paths";

const libraryWork = createLibraryWorkCoordinator({
  stopAutoImport,
  stopLibraryTransfers,
  pauseAndDrainReconciler,
  suspendMutations,
  resumeMutations,
  resumeLibraryTransfers,
  setReconcilerPaused,
  startAutoImport,
  warn: (message, error) => log.warn(message, error),
});

export async function suspendLibraryWork(): Promise<void> {
  await libraryWork.suspend();
  libraryAccess.sealDatabase();
  await drainDb();
}

export async function resumeLibraryWork(): Promise<void> {
  await libraryWork.resume();
}

let relaunchPending = false;
let locationChange: Promise<void> = Promise.resolve();

export async function serializeLocationChange<T>(
  operation: () => Promise<T>,
): Promise<T> {
  libraryAccess.releaseCurrent();
  const next = locationChange.then(() => {
    if (relaunchPending) {
      throw userError("The library is reopening. Try again when it opens.");
    }
    return libraryAccess
      .transition({
        prepare: async () => {
          const [
            { stopEnrichmentOwner },
            { stopAllMessages },
            { conversionJobs },
            { cancelAllLibraryRepairs },
          ] = await Promise.all([
            import("../../core/enrichment-owner"),
            import("../../core/agent/chat"),
            import("../../core/conversion-jobs"),
            import("../../core/library-repair-jobs"),
          ]);
          stopEnrichmentOwner();
          await Promise.all([
            stopAutoImport(),
            stopStorageWatcher(),
            stopAllMessages(),
            conversionJobs.cancelAll(),
            cancelAllLibraryRepairs(),
          ]);
        },
        operation,
        keepClosed: () => relaunchPending,
      })
      .finally(() => {
        if (!relaunchPending) {
          void startStorageWatcher().catch((error) =>
            log.warn("[pond] storage watcher resume failed", error),
          );
          void startAutoImport().catch((error) =>
            log.warn("[pond] watched folder resume failed", error),
          );
          void import("../../core/enrichment-owner")
            .then(({ startEnrichmentOwner }) => startEnrichmentOwner())
            .catch((error) =>
              log.error("[pond] enrichment resume failed", error),
            );
        }
      });
  });
  locationChange = next.then(
    () => {},
    () => {},
  );
  return next;
}

export function waitForLibraryLocationChanges(): Promise<void> {
  return locationChange;
}

export function isWebHostRelaunchPending(): boolean {
  return (
    relaunchPending && (process.env.CIRCE_WEB ?? process.env.IRIS_WEB) === "1"
  );
}

export async function relaunchSoon(): Promise<void> {
  if (process.env.ELECTRON_RENDERER_URL) {
    await softRepointInDev();
    return;
  }
  relaunchPending = true;
  setTimeout(() => {
    log.info("[pond library-ops] relaunching into new library");
    if ((process.env.CIRCE_WEB ?? process.env.IRIS_WEB) === "1") {
      // The launcher retains the address/proxy while replacing the complete host.
      app.quit();
      return;
    }
    app.relaunch();
    app.exit(0);
  }, 150);
}

async function softRepointInDev(): Promise<void> {
  log.info("[pond library-ops] dev re-point into new library (no relaunch)");
  await flushTagsDump().catch((err) =>
    log.warn("[pond library-ops] tags.json flush failed", err),
  );
  downloadActivity.reset();
  closeDb();
  invalidatePaths();
  invalidatePrefs();
  clearUndoHistory();
  resumeMutations();
  try {
    const paths = resolvePaths();
    rotateBundleBackups(paths.backupDir, [
      paths.libraryMetadata,
      paths.settingsFile,
      paths.tagsFile,
    ]);
  } catch (err) {
    log.warn("[pond library-ops] bundle backup rotation failed", err);
  }
  try {
    await hydrateTagsFromBundle();
  } catch (err) {
    log.warn("[pond library-ops] tags.json hydrate failed", err);
  }
  try {
    await reconcileLibrary();
  } catch (err) {
    log.warn("[pond library-ops] dev re-point reconcile failed", err);
  }
  await resumeLibraryWork();
  closePreviewWindows();
  closeCombineImagesWindow();
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.reload();
  }
}
