import type { NewSave } from "@pond/schema/db";
import { z } from "zod";

/** Only user-editable Save fields cross the browser transaction boundary. */
const WebSavePatchSchema = z
  .object({
    title: z.string().max(20000).nullable().optional(),
    notes: z.string().max(1000000).nullable().optional(),
    description: z.string().max(1000000).nullable().optional(),
    url: z.string().max(20000).optional(),
    rating: z.number().int().min(0).max(5).nullable().optional(),
    tags: z.array(z.string().min(1).max(1000)).max(10000).optional(),
    coverIndex: z.number().int().min(0).optional(),
    primaryColor: z.string().max(100).nullable().optional(),
    rotate: z
      .union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
      .optional(),
    flipX: z.boolean().optional(),
    flipY: z.boolean().optional(),
    crop: z
      .object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        w: z.number().positive().max(1),
        h: z.number().positive().max(1),
      })
      .nullable()
      .optional(),
  } satisfies Partial<Record<keyof NewSave, z.ZodType>>)
  .strict();
const SaveId = z.string().min(1).max(200);
const Meta = z
  .object({
    actor: z.literal("user").optional(),
    actorReason: z.string().max(1000).optional(),
  })
  .strict()
  .optional();
export const WebTransactionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("update"),
      model: z.literal("save"),
      id: SaveId,
      patch: WebSavePatchSchema,
      before: WebSavePatchSchema,
      meta: Meta,
    })
    .strict(),
  z
    .object({
      kind: z.literal("trash"),
      model: z.literal("save"),
      id: SaveId,
      meta: Meta,
    })
    .strict(),
  z
    .object({
      kind: z.literal("untrash"),
      model: z.literal("save"),
      id: SaveId,
      meta: Meta,
    })
    .strict(),
]);
export const WebTransactionsSchema = z
  .object({
    transactions: z.array(WebTransactionSchema).min(1).max(10000),
  })
  .strict();
export const WebHistorySchema = z.object({
  revision: z.number().int().nonnegative(),
  canUndo: z.boolean(),
  canRedo: z.boolean(),
});
