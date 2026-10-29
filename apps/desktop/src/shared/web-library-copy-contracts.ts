import { z } from "zod";
import { HostLocationHandleSchema } from "./web-host-locations";

export const WebLibraryCopySchema = z.strictObject({
  ids: z.array(z.string().min(1).max(200)).min(1).max(100000),
  destination: HostLocationHandleSchema,
});
export type WebLibraryCopy = z.infer<typeof WebLibraryCopySchema>;
