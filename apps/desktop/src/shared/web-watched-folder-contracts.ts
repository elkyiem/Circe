import { z } from "zod";
import { HostLocationHandleSchema } from "./web-host-locations";

export const WebWatchedFolderRequestSchema = z.discriminatedUnion("name", [
  z.strictObject({
    name: z.literal("autoImport.pickFolder"),
    params: z.strictObject({
      folder: HostLocationHandleSchema,
      enabled: z.boolean().optional(),
    }),
  }),
  z.strictObject({
    name: z.literal("autoImport.set"),
    params: z.strictObject({
      enabled: z.boolean().optional(),
      path: z.literal("").optional(),
      mode: z.enum(["copy", "move"]).optional(),
    }),
  }),
  z.strictObject({
    name: z.literal("autoImport.reveal"),
    params: z.strictObject({}),
  }),
]);
export type WebWatchedFolderRequest = z.infer<
  typeof WebWatchedFolderRequestSchema
>;
