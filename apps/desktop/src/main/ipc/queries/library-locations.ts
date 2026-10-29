import { libraryBackupQueries } from "./library-backups";
import { libraryLocationMaintenanceQueries } from "./library-location-maintenance";
import { libraryLocationOpenQueries } from "./library-location-open";
import {
  serializeLocationChange,
  waitForLibraryLocationChanges,
} from "./library-location-runtime";
import type { QueryHandlerMap } from "./params";

const locationQueries = {
  ...libraryLocationOpenQueries,
  ...libraryLocationMaintenanceQueries,
  ...libraryBackupQueries,
} satisfies QueryHandlerMap;

export const libraryLocationQueries = {
  ...locationQueries,
  "library.createAt": (
    ...args: Parameters<(typeof locationQueries)["library.createAt"]>
  ) =>
    serializeLocationChange(() => locationQueries["library.createAt"](...args)),
  "library.switchTo": (
    ...args: Parameters<(typeof locationQueries)["library.switchTo"]>
  ) =>
    serializeLocationChange(() => locationQueries["library.switchTo"](...args)),
  "library.move": (
    ...args: Parameters<(typeof locationQueries)["library.move"]>
  ) => serializeLocationChange(() => locationQueries["library.move"](...args)),
  "library.backupTo": (
    ...args: Parameters<(typeof locationQueries)["library.backupTo"]>
  ) =>
    serializeLocationChange(() => locationQueries["library.backupTo"](...args)),
  "library.restoreBackup": (
    ...args: Parameters<(typeof locationQueries)["library.restoreBackup"]>
  ) =>
    serializeLocationChange(() =>
      locationQueries["library.restoreBackup"](...args),
    ),
  "library.rename": (
    ...args: Parameters<(typeof locationQueries)["library.rename"]>
  ) =>
    serializeLocationChange(() => locationQueries["library.rename"](...args)),
  "library.mergeFrom": (
    ...args: Parameters<(typeof locationQueries)["library.mergeFrom"]>
  ) =>
    serializeLocationChange(() =>
      locationQueries["library.mergeFrom"](...args),
    ),
} satisfies QueryHandlerMap;

export { isWebHostRelaunchPending } from "./library-location-runtime";
export { waitForLibraryLocationChanges };
