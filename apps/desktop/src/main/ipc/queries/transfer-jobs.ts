import { copyFile } from "node:fs/promises";
import { dialog } from "electron";
import { z } from "zod";
import type { OkResult } from "../../../shared/query-contracts-shared";
import {
  type TransferDelivery,
  transferDelivery,
} from "../../core/transfer-delivery";
import { transferJobStore } from "../../core/transfer-jobs";
import { retryTransferJob } from "../../core/transfer-operations";
import { type QueryHandlerMap, query, StringParam } from "./params";

export function createTransferJobQueries(dependencies: {
  delivery(): TransferDelivery | null;
  store: typeof transferJobStore;
  retry(id: string): Promise<OkResult>;
  chooseFile(filename: string): Promise<string | null>;
  copyFile(source: string, destination: string): Promise<void>;
}) {
  return {
    "transferJobs.list": query(
      z.object({}),
      () => dependencies.delivery()?.list() ?? dependencies.store().list(),
    ),
    "transferJobs.cancel": query(z.object({ id: StringParam }), ({ id }) =>
      dependencies.store().cancel(id),
    ),
    "transferJobs.download": query(
      z.object({ id: StringParam }),
      async ({ id }) => {
        const owner = dependencies.delivery();
        if (!owner)
          return {
            ok: false as const,
            error: "This transfer has no browser download.",
          };
        const artifact = await owner.artifact(id);
        const destination = await dependencies.chooseFile(artifact.filename);
        if (!destination)
          return { ok: false as const, reason: "cancelled" as const };
        const current = await owner.artifact(id);
        await dependencies.copyFile(current.path, destination);
        return { ok: true as const };
      },
    ),
    "transferJobs.retry": query(
      z.object({ id: StringParam }),
      ({ id }) => dependencies.delivery()?.retry(id) ?? dependencies.retry(id),
    ),
  } satisfies QueryHandlerMap;
}

export const transferJobsQueries = createTransferJobQueries({
  delivery: transferDelivery,
  store: transferJobStore,
  retry: retryTransferJob,
  chooseFile: async (filename) => {
    const chosen = await dialog.showSaveDialog({
      title: "Save Export",
      defaultPath: filename,
    });
    return chosen.canceled ? null : (chosen.filePath ?? null);
  },
  copyFile,
});
