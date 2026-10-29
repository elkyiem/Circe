import {
  HostLocationEntrySchema,
  HostLocationListingSchema,
  type HostLocationPurpose,
  type HostLocationsRequest,
} from "@shared/web-host-locations";
import type { WebValue } from "@shared/web-serialization";
import { WebWatchedFolderRequestSchema } from "@shared/web-watched-folder-contracts";
import { z } from "zod";
import { pickHostLocation } from "./host-locations";

const names = new Set([
  "autoImport.pickFolder",
  "autoImport.set",
  "autoImport.reveal",
]);

export function createBrowserWatchedFolder(
  request: (path: string, body?: string) => Promise<WebValue>,
) {
  const location = (input: HostLocationsRequest) =>
    request("locations", JSON.stringify(input));
  const pick = (
    purpose: HostLocationPurpose,
    title: string,
    initial?: string,
  ) =>
    pickHostLocation({
      purpose,
      title,
      initial,
      list: async (input) =>
        HostLocationListingSchema.parse(await location(input)),
      mkdir: async (input) =>
        HostLocationEntrySchema.parse(await location(input)),
    });
  const send = (input: z.infer<typeof WebWatchedFolderRequestSchema>) =>
    request(
      "watched-folder",
      JSON.stringify(WebWatchedFolderRequestSchema.parse(input)),
    );
  return {
    handles: (name: string) => names.has(name),
    async query(
      name: string,
      params: Record<string, z.infer<ReturnType<typeof z.json>>>,
    ): Promise<WebValue> {
      if (name === "autoImport.pickFolder") {
        const folder = await pick(
          "watch",
          "Choose a folder to watch on the Mac host",
        );
        if (!folder) return { ok: false, reason: "cancelled" };
        return send({ name, params: { folder: folder.entry.handle } });
      }
      if (name === "autoImport.set")
        return send(WebWatchedFolderRequestSchema.parse({ name, params }));
      const result = await send({ name: "autoImport.reveal", params: {} });
      const reply = z
        .object({
          ok: z.boolean(),
          location: HostLocationEntrySchema.optional(),
        })
        .parse(result);
      if (reply.ok && reply.location)
        await pick(
          "inspect",
          "Browse the watched folder on the Mac host",
          reply.location.handle,
        );
      return result;
    },
  };
}
