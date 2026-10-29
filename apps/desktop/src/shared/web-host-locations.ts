import { z } from "zod";

export const HostLocationPurposeSchema = z.enum([
  "parent",
  "open",
  "move",
  "backup",
  "restore-source",
  "restore-destination",
  "merge",
  "inspect",
  "watch",
  "copy",
]);
export type HostLocationPurpose = z.infer<typeof HostLocationPurposeSchema>;
export const HostLocationHandleSchema = z.string().uuid();
export const HostLocationNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine(
    (name) =>
      name !== "." &&
      name !== ".." &&
      !/[/\\:\p{Cc}]/u.test(name) &&
      new TextEncoder().encode(name).byteLength <= 240,
    "Enter a single folder name of at most240bytes.",
  );
export const HostLocationEntrySchema = z.object({
  handle: HostLocationHandleSchema,
  name: z.string(),
  path: z.string(),
  kind: z.enum(["directory", "library", "backup"]),
});
export type HostLocationEntry = z.infer<typeof HostLocationEntrySchema>;
export const HostLocationListRequestSchema = z
  .object({
    action: z.literal("list"),
    purpose: HostLocationPurposeSchema,
    handle: HostLocationHandleSchema.optional(),
    filter: z.string().max(200).default(""),
    offset: z.number().int().min(0).max(1000000).default(0),
    hidden: z.boolean().default(false),
  })
  .strict();
export const HostLocationsRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("recent") }).strict(),
  z.object({ action: z.literal("inspect") }).strict(),
  HostLocationListRequestSchema,
  z
    .object({
      action: z.literal("mkdir"),
      purpose: HostLocationPurposeSchema,
      parent: HostLocationHandleSchema,
      name: HostLocationNameSchema,
    })
    .strict(),
]);
export type HostLocationsRequest = z.infer<typeof HostLocationsRequestSchema>;
export const HostLocationListingSchema = z.object({
  current: HostLocationEntrySchema.nullable(),
  parent: HostLocationEntrySchema.nullable(),
  entries: z.array(HostLocationEntrySchema),
  nextOffset: z.number().nullable(),
});
export type HostLocationListing = z.infer<typeof HostLocationListingSchema>;
export const HostDestinationSchema = z
  .object({ parent: HostLocationHandleSchema, name: HostLocationNameSchema })
  .strict();
export type HostDestination = z.infer<typeof HostDestinationSchema>;

export const HostRecentLibrariesSchema = z.array(
  z.object({
    entry: z.object({
      path: z.string(),
      name: z.string(),
      available: z.boolean(),
      active: z.boolean(),
      lastOpened: z.number(),
      icon: z.string().nullable(),
      accent: z.string().nullable(),
    }),
    source: HostLocationHandleSchema.nullable(),
  }),
);
