import { inverse, type Transaction } from "@pond/schema/tx";
import log from "electron-log/main.js";
import { executeBatch, withMutationScope } from "./executor";

const MAX_HISTORY = 200;
export function createUndoHistory(
  commit: (transactions: Transaction[]) => Promise<void>,
) {
  const undoStack: Transaction[][] = [];
  const redoStack: Transaction[][] = [];
  let epoch = 0;
  let revision = 0;
  let commandTail = Promise.resolve();
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = commandTail.then(operation);
    commandTail = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  return {
    record(transactions: Transaction[]): void {
      if (!transactions.length) return;
      undoStack.push(structuredClone(transactions));
      if (undoStack.length > MAX_HISTORY) undoStack.shift();
      redoStack.length = 0;
      revision++;
    },
    clear(): void {
      epoch++;
      undoStack.length = 0;
      redoStack.length = 0;
      revision++;
    },
    undo(expectedRevision?: number): Promise<boolean> {
      return serialize(async () => {
        if (expectedRevision !== undefined && expectedRevision !== revision)
          return false;
        const started = epoch;
        const transactions = undoStack.pop();
        if (!transactions) return false;
        try {
          await commit(
            [...transactions].reverse().map((item) => {
              const reverse = inverse(item);
              return {
                ...reverse,
                meta: { ...reverse.meta, actorReason: "undo" },
              };
            }),
          );
          if (epoch === started) {
            redoStack.push(transactions);
            revision++;
          }
          return true;
        } catch (error) {
          log.warn("[pond undo] failed", error);
          if (epoch === started) undoStack.push(transactions);
          return false;
        }
      });
    },
    redo(expectedRevision?: number): Promise<boolean> {
      return serialize(async () => {
        if (expectedRevision !== undefined && expectedRevision !== revision)
          return false;
        const started = epoch;
        const transactions = redoStack.pop();
        if (!transactions) return false;
        try {
          await commit(
            transactions.map((item) => ({
              ...item,
              meta: { ...item.meta, actorReason: "redo" },
            })),
          );
          if (epoch === started) {
            undoStack.push(transactions);
            revision++;
          }
          return true;
        } catch (error) {
          log.warn("[pond redo] failed", error);
          if (epoch === started) redoStack.push(transactions);
          return false;
        }
      });
    },
    canUndo(): boolean {
      return undoStack.length > 0;
    },
    canRedo(): boolean {
      return redoStack.length > 0;
    },
    revision(): number {
      return revision;
    },
  };
}
const history = createUndoHistory(async (transactions) => {
  await executeBatch(transactions);
});
export function recordForUndo(transaction: Transaction): void {
  history.record([transaction]);
}
export function recordBatchForUndo(transactions: Transaction[]): void {
  history.record(transactions);
}
export const undo = (expectedRevision?: number) =>
  withMutationScope(() => history.undo(expectedRevision));
export const redo = (expectedRevision?: number) =>
  withMutationScope(() => history.redo(expectedRevision));
export const canUndo = history.canUndo;
export const canRedo = history.canRedo;
export const undoRevision = history.revision;

export const clearUndoHistory = history.clear;
