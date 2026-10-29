import { realpath } from "node:fs/promises";
import type { OkResult } from "../../shared/query-contracts-shared";
import type {
  TransferJob,
  TransferRequest,
} from "../../shared/transfer-contracts";

export interface TransferRetryOptions<Result> {
  wait?: boolean;
  requireLibraryIdentity?: boolean;
  prepare?: (request: TransferRequest) => Promise<void>;
  complete?: (request: TransferRequest, result: Result) => Promise<void>;
}

/** A retry executes only the persisted request, under the current native transfer owner. */
export function createTransferRetry<Result>(dependencies: {
  list(): Promise<TransferJob[]>;
  libraryRoot(): string;
  libraryId(): string;
  run<T>(
    request: TransferRequest,
    operation: () => Promise<T>,
    retryId?: string,
  ): Promise<T>;
  execute(request: TransferRequest): Promise<Result>;
  warn(error: Error): void;
}) {
  return async (
    id: string,
    options: TransferRetryOptions<Result> = {},
  ): Promise<OkResult> => {
    const job = (await dependencies.list()).find((entry) => entry.id === id);
    if (!job || !["failed", "cancelled", "interrupted"].includes(job.status))
      return { ok: false, error: "This transfer can't be retried." };
    if (
      (await realpath(job.request.origin)) !==
      (await realpath(dependencies.libraryRoot()))
    )
      throw new Error(
        "Open the original library before retrying this transfer.",
      );
    if (
      (job.request.originLibraryId &&
        job.request.originLibraryId !== dependencies.libraryId()) ||
      (options.requireLibraryIdentity && !job.request.originLibraryId)
    )
      throw new Error(
        "This transfer belongs to another or an older Library. Start a new transfer.",
      );
    const operation = dependencies.run(
      job.request,
      async () => {
        await options.prepare?.(job.request);
        const result = await dependencies.execute(job.request);
        await options.complete?.(job.request, result);
        return result;
      },
      id,
    );
    if (options.wait) await operation;
    else
      void operation.catch((cause) =>
        dependencies.warn(
          cause instanceof Error ? cause : new Error(String(cause)),
        ),
      );
    return { ok: true };
  };
}
