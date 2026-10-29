import type { Prefs } from "@pond/schema/db";
import {
  type WebWatchedFolderRequest,
  WebWatchedFolderRequestSchema,
} from "../../shared/web-watched-folder-contracts";
import type { configureAutoImport } from "../core/auto-import";
import { WebRequestError } from "./errors";
import type { createHostLocations } from "./host-locations";

/** Watch control drains native scans without holding their mutation queue. */
export function createWebWatchedFolder(dependencies: {
  locations: ReturnType<typeof createHostLocations>;
  libraryId(): string;
  read(): Promise<Prefs["autoImport"]>;
  configure: typeof configureAutoImport;
}) {
  return async (
    raw: WebWatchedFolderRequest,
    expected: string,
    session: string,
  ) => {
    const input = WebWatchedFolderRequestSchema.parse(raw);
    if (expected !== dependencies.libraryId())
      throw new WebRequestError(
        "The active Library changed. Reload before changing its watched folder.",
      );
    const scope = { library: expected, session };
    if (input.name === "autoImport.reveal") {
      const prefs = await dependencies.read();
      if (!prefs.path) return { ok: false, reason: "missing" };
      return {
        ok: true,
        location: await dependencies.locations.known(
          prefs.path,
          "inspect",
          scope,
        ),
      };
    }
    const patch =
      input.name === "autoImport.pickFolder"
        ? {
            enabled: input.params.enabled ?? true,
            path: await dependencies.locations.parent(
              input.params.folder,
              "watch",
              scope,
            ),
          }
        : input.params;
    try {
      return await dependencies.configure(patch);
    } catch (error) {
      throw new WebRequestError(
        error instanceof Error
          ? error.message
          : "Could not update the watched folder.",
        422,
      );
    }
  };
}
