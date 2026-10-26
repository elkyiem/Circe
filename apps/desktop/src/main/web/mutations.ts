import type { Save } from "@pond/schema/db";
import type { Transaction } from "@pond/schema/tx";
import { WebTransactionsSchema } from "../../shared/web-mutations";
import { executeBatch, withMutationScope } from "../core/executor";
import { readSave } from "../core/pipeline/workers/apply";
import { recordBatchForUndo, undoRevision } from "../core/undo";
import { hasUserTitle } from "../core/user-metadata";
import { libraryId } from "../paths";
import { WebRequestError } from "./errors";

export async function applyWebTransactions(
  raw: ReturnType<typeof WebTransactionsSchema.parse>,
  expectedLibrary: string,
) {
  return withMutationScope(async () => {
    if (expectedLibrary !== libraryId())
      throw new WebRequestError(
        "The active Library changed. Reload before editing.",
      );
    const input = WebTransactionsSchema.parse(raw);
    const transactions: Transaction[] = [];
    const seen = new Set<string>();
    for (const transaction of input.transactions) {
      if (seen.has(transaction.id))
        throw new WebRequestError("Edit each Save once per batch.", 422);
      seen.add(transaction.id);
      const save = await readSave(transaction.id);
      if (!save)
        throw new WebRequestError("This Save is no longer available.", 404);
      if (transaction.kind === "update") {
        if (save.deletedAt)
          throw new WebRequestError("Restore this Save before editing it.");
        if (
          transaction.patch.coverIndex !== undefined &&
          transaction.patch.coverIndex >= save.files.length
        )
          throw new WebRequestError(
            "Choose an existing file for this Save.",
            422,
          );
        const before: Partial<Save> = {};
        for (const key of Object.keys(transaction.patch)) {
          const current = Object.entries(save).find(
            ([name]) => name === key,
          )?.[1];
          const supplied = Object.entries(transaction.before).find(
            ([name]) => name === key,
          )?.[1];
          if (JSON.stringify(current) !== JSON.stringify(supplied))
            throw new WebRequestError(
              "This Save changed in another window. Reload before editing.",
            );
          Object.assign(before, { [key]: current });
        }
        const prepared: Extract<
          Transaction,
          { kind: "update"; model: "save" }
        > = {
          ...transaction,
          before,
        };
        if (transaction.patch.title !== undefined)
          prepared.titleLock = { before: hasUserTitle(save.id), after: true };
        transactions.push(prepared);
      } else transactions.push(transaction);
    }
    await executeBatch(transactions);
    recordBatchForUndo(transactions);
    return { revision: undoRevision() };
  });
}
