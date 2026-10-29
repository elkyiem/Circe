import { inverse, type Transaction } from "@pond/schema/tx";
import log from "electron-log/main.js";
import { IPC } from "../../shared/constants";
import type { HistoryState } from "../../shared/history-contracts";
import { broadcast } from "../lib/broadcast";
import { executeBatch, withMutationScope } from "./executor";

const MAX_HISTORY = 200;
export function createUndoHistory(
  commit: (transactions: Transaction[]) => Promise<void>,
  changed?: (state: HistoryState) => void,
) {
  const undoStack: Transaction[][] = [];
  const redoStack: Transaction[][] = [];
  let epoch = 0;
  let revision = 0;
  let commandTail = Promise.resolve();
  let pending: { kind: "undo" | "redo"; epoch: number } | null = null;
  // A popped batch remains part of the committed history until its write settles.
  function canUndo() {
    return (
      undoStack.length > 0 ||
      (pending?.kind === "undo" && pending.epoch === epoch)
    );
  }
  function canRedo() {
    return (
      redoStack.length > 0 ||
      (pending?.kind === "redo" && pending.epoch === epoch)
    );
  }
  function publish() {
    try {
      changed?.({
        revision,
        canUndo: canUndo(),
        canRedo: canRedo(),
      });
    } catch (error) {
      log.warn("[pond undo] history observer failed", error);
    }
  }
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
      publish();
    },
    clear(): void {
      epoch++;
      undoStack.length = 0;
      redoStack.length = 0;
      revision++;
      publish();
    },
    undo(expectedRevision?: number): Promise<boolean> {
      return serialize(async () => {
        if (expectedRevision !== undefined && expectedRevision !== revision)
          return false;
        const started = epoch;
        const transactions = undoStack.pop();
        if (!transactions) return false;
        pending = { kind: "undo", epoch: started };
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
            pending = null;
            revision++;
            publish();
          }
          return true;
        } catch (error) {
          log.warn("[pond undo] failed", error);
          if (epoch === started) {
            undoStack.push(transactions);
            pending = null;
            publish();
          }
          return false;
        } finally {
          pending = null;
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
        pending = { kind: "redo", epoch: started };
        try {
          await commit(
            transactions.map((item) => ({
              ...item,
              meta: { ...item.meta, actorReason: "redo" },
            })),
          );
          if (epoch === started) {
            undoStack.push(transactions);
            pending = null;
            revision++;
            publish();
          }
          return true;
        } catch (error) {
          log.warn("[pond redo] failed", error);
          if (epoch === started) {
            redoStack.push(transactions);
            pending = null;
            publish();
          }
          return false;
        } finally {
          pending = null;
        }
      });
    },
    canUndo,
    canRedo,
    revision(): number {
      return revision;
    },
  };
}
const history = createUndoHistory(
  async (transactions) => {
    await executeBatch(transactions);
  },
  (state) => broadcast(IPC.historyChanged, state),
);
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
