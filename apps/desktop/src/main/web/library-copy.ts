import type { QueryResult } from "../../shared/query-contracts";
import {
  type WebLibraryCopy,
  WebLibraryCopySchema,
} from "../../shared/web-library-copy-contracts";
import { WebRequestError } from "./errors";
import type { createHostLocations } from "./host-locations";

/** Existing host Libraries are selected with a session- and purpose-bound grant. */
export function createWebLibraryCopy(dependencies: {
  locations: Pick<ReturnType<typeof createHostLocations>, "source">;
  libraryId(): string;
  copy(
    ids: string[],
    destination: string,
  ): Promise<QueryResult<"saves.copyToLibrary">>;
}) {
  return async (raw: WebLibraryCopy, expected: string, session: string) => {
    const input = WebLibraryCopySchema.parse(raw);
    if (expected !== dependencies.libraryId())
      throw new WebRequestError(
        "The active Library changed. Reload before copying Saves.",
      );
    const destination = await dependencies.locations.source(
      input.destination,
      "copy",
      { library: expected, session },
    );
    if (expected !== dependencies.libraryId())
      throw new WebRequestError(
        "The active Library changed. Reload before copying Saves.",
      );
    return dependencies.copy(input.ids, destination);
  };
}
