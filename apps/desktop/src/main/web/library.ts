import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  type WebLibraryRequest,
  WebLibraryRequestSchema,
} from "../../shared/web-library-contracts";
import { libraryBackupQueries } from "../ipc/queries/library-backups";
import { libraryLocationMaintenanceQueries } from "../ipc/queries/library-location-maintenance";
import { libraryLocationOpenQueries } from "../ipc/queries/library-location-open";
import {
  isWebHostRelaunchPending,
  serializeLocationChange,
} from "../ipc/queries/library-location-runtime";
import { libraryId, libraryRoot } from "../paths";
import { WebRequestError } from "./errors";
import type { createHostLocations, HostLocationScope } from "./host-locations";

type HostLocations = ReturnType<typeof createHostLocations>;
/** Unwrapped native handlers enter one transition after scoped selections have been revalidated. */
export function runWebLibrary(
  input: WebLibraryRequest,
  expectedLibrary: string,
  session: string,
  locations: HostLocations,
) {
  const request = WebLibraryRequestSchema.parse(input);
  return serializeLocationChange(async () => {
    if (expectedLibrary !== libraryId())
      throw new WebRequestError(
        "The active Library changed. Reload before editing.",
      );
    const scope: HostLocationScope = { library: expectedLibrary, session };
    const before = libraryRoot();
    const result = await (async () => {
      switch (request.name) {
        case "library.rename":
          return libraryLocationMaintenanceQueries[request.name](
            request.params,
          );
        case "library.createAt": {
          const path = await locations.parent(
            request.params.parent,
            "parent",
            scope,
          );
          const name = request.params.name.replace(/\.pond$/i, "");
          if (!name || existsSync(join(path, `${name}.pond`)))
            throw new WebRequestError(
              "A Library with this name already exists. Choose another name or location.",
              422,
            );
          return libraryLocationOpenQueries[request.name]({ path, name });
        }
        case "library.switchTo":
          return libraryLocationOpenQueries[request.name]({
            path: await locations.source(request.params.source, "open", scope),
          });
        case "library.move":
          return libraryLocationMaintenanceQueries[request.name]({
            path: await locations.destination(
              request.params.destination,
              "move",
              scope,
            ),
          });
        case "library.backupTo":
          return libraryBackupQueries[request.name]({
            path: await locations.destination(
              request.params.destination,
              "backup",
              scope,
            ),
          });
        case "library.mergeFrom":
          return libraryLocationMaintenanceQueries[request.name]({
            source: await locations.source(
              request.params.source,
              "merge",
              scope,
            ),
          });
        case "library.restoreBackup":
          return libraryBackupQueries[request.name]({
            source: await locations.source(
              request.params.source,
              "restore-source",
              scope,
            ),
            destination: await locations.destination(
              request.params.destination,
              "restore-destination",
              scope,
            ),
          });
      }
    })();
    return {
      ...result,
      restarting: result.ok && isWebHostRelaunchPending(),
      reloading:
        result.ok &&
        request.name !== "library.backupTo" &&
        request.name !== "library.mergeFrom" &&
        "path" in result &&
        result.path !== before,
    };
  });
}
