import { z } from "zod";

export const HistoryStateSchema = z.object({
  revision: z.number().int().nonnegative(),
  canUndo: z.boolean(),
  canRedo: z.boolean(),
});
export type HistoryState = z.infer<typeof HistoryStateSchema>;
