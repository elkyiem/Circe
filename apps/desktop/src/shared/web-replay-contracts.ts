import { z } from "zod";

export const ReplayPageUrlSchema = z
  .url()
  .max(8192)
  .refine((value) => {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  }, "Choose an HTTP or HTTPS page without embedded credentials.");

export const WebReplayRequestSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("open"),
    saveId: z.string().min(1).max(200),
    pageUrl: ReplayPageUrlSchema,
    workerAsset: z
      .string()
      .regex(/^\/assets\/replay-worker-[A-Za-z0-9_-]+\.js$/)
      .optional(),
    bootstrapAsset: z
      .string()
      .regex(/^\/assets\/replay-bootstrap-[A-Za-z0-9_-]+\.js$/)
      .optional(),
  }),
  z.strictObject({ action: z.literal("close"), id: z.uuid() }),
]);
export const WebReplayTicketSchema = z.strictObject({
  id: z.uuid(),
  generation: z.uuid(),
  origin: z.url(),
  url: z.url(),
});
export type WebReplayTicket = z.infer<typeof WebReplayTicketSchema>;

/** This complete object is readable by archived code: its token can read only one archive. */
export const ReplayPinSchema = z.strictObject({
  collection: z.string().regex(/^[a-z0-9-]{1,100}$/),
  source: z.url(),
  authorization: z.string().regex(/^Bearer [A-Za-z0-9_-]{43}$/),
  parentOrigin: z.url(),
  generation: z.uuid(),
  pageUrl: ReplayPageUrlSchema,
  pages: z.array(ReplayPageUrlSchema).min(1).max(100000),
  csp: z.string().max(20000),
});
export type ReplayPin = z.infer<typeof ReplayPinSchema>;

export const ReplayParentMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("circe-replay:ready"),
    generation: z.uuid(),
  }),
  z.strictObject({
    type: z.literal("circe-replay:navigate"),
    generation: z.uuid(),
    url: ReplayPageUrlSchema,
  }),
  z.strictObject({
    type: z.literal("circe-replay:external"),
    generation: z.uuid(),
    url: ReplayPageUrlSchema,
  }),
  z.strictObject({
    type: z.literal("circe-replay:error"),
    generation: z.uuid(),
    message: z.string().max(1000),
  }),
]);
export const ReplayChildMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("circe-replay:visit"),
    generation: z.uuid(),
    url: ReplayPageUrlSchema,
  }),
  z.strictObject({
    type: z.literal("circe-replay:reload"),
    generation: z.uuid(),
  }),
]);

export function replayDocumentPolicy(parentOrigin: string): string {
  const parent = new URL(parentOrigin).origin;
  return `default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' data: blob:; connect-src 'self' data: blob:; worker-src 'self' blob:; frame-src 'self' data: blob:; form-action 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self' ${parent}`;
}
export const REPLAY_WORKER_POLICY =
  "default-src 'none'; script-src 'self'; connect-src 'self'; worker-src 'none'; object-src 'none'";
