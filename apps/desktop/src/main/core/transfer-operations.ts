import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import log from "electron-log/main.js";
import type { TransferRequest } from "../../shared/transfer-contracts";
import { libraryId, libraryRoot } from "../paths";
import { importEaglePackage } from "./eagle-package";
import {
  exportSavesToDirectory,
  exportSavesToEaglePackage,
} from "./export-saves";
import { copyPackageToLibrary, packageLibrary } from "./library-transfer-files";
import { runLibraryTransfer } from "./library-transfers";
import { exportPondPackage, importPondPackage } from "./pond-package";
import { runTransferJob, transferJobStore } from "./transfer-jobs";
import { createTransferRetry } from "./transfer-retry";

export function copySaveSelectionToLibrary(
  ids: readonly string[],
  target: string,
) {
  return runLibraryTransfer(async () => {
    if ((await realpath(target)) === (await realpath(libraryRoot())))
      throw new Error("Choose a different library.");
    const temporary = await mkdtemp(join(tmpdir(), "pond-library-copy-"));
    try {
      const packagePath = join(temporary, "Selection.pondpack");
      await exportPondPackage(ids, packagePath);
      return await copyPackageToLibrary(packagePath, target);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
}
export function mergeLibraryFrom(source: string) {
  return runLibraryTransfer(async () => {
    if ((await realpath(source)) === (await realpath(libraryRoot())))
      throw new Error("Choose a different library.");
    const temporary = await mkdtemp(join(tmpdir(), "pond-library-merge-"));
    try {
      await packageLibrary(source, temporary);
      return { path: libraryRoot(), ...(await importPondPackage(temporary)) };
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
}
async function executeRequest(request: TransferRequest) {
  if ((await realpath(request.origin)) !== (await realpath(libraryRoot())))
    throw new Error("Open the original library before retrying this transfer.");
  switch (request.kind) {
    case "export_eagle_package":
      return exportSavesToEaglePackage(request.ids ?? [], request.destination);
    case "export_files":
      return exportSavesToDirectory(request.ids ?? [], request.destination);
    case "export_package":
      return exportPondPackage(request.ids ?? [], request.destination);
    case "copy_library":
      return copySaveSelectionToLibrary(request.ids ?? [], request.destination);
    case "import_eagle_package":
      return importEaglePackage(request.source || request.destination);
    case "import_package":
      return importPondPackage(request.source || request.destination);
    case "merge_library":
      return mergeLibraryFrom(request.source || request.destination);
  }
}
export const retryTransferJob = createTransferRetry({
  list: () => transferJobStore().list(),
  libraryRoot,
  libraryId,
  run: runTransferJob,
  execute: executeRequest,
  warn: (error) => log.warn("Transfer retry stopped", error),
});
