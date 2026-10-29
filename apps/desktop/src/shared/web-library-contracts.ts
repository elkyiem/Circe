import { z } from "zod";
import { LibraryMarkSourceSchema } from "./library-mark";
import {
  HostDestinationSchema,
  HostLocationHandleSchema,
  HostLocationNameSchema,
} from "./web-host-locations";

/** Library transitions have their own admission boundary, outside ordinary writes. */
export const WebLibraryRequestSchema = z.discriminatedUnion("name", [
  z
    .object({
      name: z.literal("library.rename"),
      params: z
        .object({
          name: HostLocationNameSchema,
          icon: z.string().max(1_000_000).nullable().optional(),
          mark: LibraryMarkSourceSchema.nullable().optional(),
          accent: z.string().nullable().optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal("library.createAt"),
      params: z
        .object({
          parent: HostLocationHandleSchema,
          name: HostLocationNameSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal("library.switchTo"),
      params: z.object({ source: HostLocationHandleSchema }).strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal("library.move"),
      params: z.object({ destination: HostDestinationSchema }).strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal("library.backupTo"),
      params: z.object({ destination: HostDestinationSchema }).strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal("library.mergeFrom"),
      params: z.object({ source: HostLocationHandleSchema }).strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal("library.restoreBackup"),
      params: z
        .object({
          source: HostLocationHandleSchema,
          destination: HostDestinationSchema,
        })
        .strict(),
    })
    .strict(),
]);
export type WebLibraryRequest = z.infer<typeof WebLibraryRequestSchema>;
