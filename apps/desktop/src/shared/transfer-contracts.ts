import { z } from "zod";
import type { CancellableResult, OkResult } from "./query-contracts-shared";

export const TransferRequestSchema = z.object({
  kind: z.enum([
    "export_eagle_package",
    "export_files",
    "export_package",
    "import_eagle_package",
    "import_package",
    "copy_library",
    "merge_library",
  ]),
  origin: z.string().min(1),
  originLibraryId: z.string().min(1).optional(),
  destination: z.string().min(1),
  source: z.string().optional(),
  ids: z.array(z.string()).optional(),
});
export type TransferRequest = z.infer<typeof TransferRequestSchema>;
export const TransferJobSchema = z.object({
  id: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/),
  request: TransferRequestSchema,
  status: z.enum([
    "running",
    "cancelling",
    "completed",
    "failed",
    "cancelled",
    "interrupted",
  ]),
  phase: z.string(),
  completed: z.number(),
  total: z.number(),
  bytes: z.number(),
  currentFile: z.string().nullable(),
  error: z.string().nullable(),
  browserDownload: z.boolean().optional(),
  startedAt: z.number(),
  updatedAt: z.number(),
});
export type TransferJob = z.infer<typeof TransferJobSchema>;

export interface TransferQueryInputs {
  "transferJobs.list": Record<string, never>;
  "transferJobs.cancel": { id: string };
  "transferJobs.retry": { id: string };
  "transferJobs.download": { id: string };
}
export interface TransferQueryResults {
  "transferJobs.list": TransferJob[];
  "transferJobs.cancel": OkResult;
  "transferJobs.retry": OkResult;
  "transferJobs.download": CancellableResult<{
    download?: string;
    filename?: string;
  }>;
}
