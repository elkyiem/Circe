import { randomUUID } from "node:crypto";
import { inverse, type Transaction } from "@pond/schema/tx";
import type { UndoLatestResult, UndoStepOutcome } from "@shared/wire";
import log from "electron-log/main.js";
import { IPC } from "../../shared/constants";
import type { HistoryState } from "../../shared/history-contracts";
import { broadcast } from "../lib/broadcast";
import { executeBatch, withMutationScope } from "./executor";

const MAX_HISTORY = 200;

interface UndoStep {
  id: string;
  transactions: Transaction[];
}

export function createUndoHistory(
  commit: (transactions: Transaction[]) => Promise<void>,
  changed?: (state: HistoryState) => void,
  createId: () => string = randomUUID,
) {
  const undoStack: UndoStep[] = [];
  const redoStack: UndoStep[] = [];
  let epoch = 0;
  let revision = 0;
  let commandTail = Promise.resolve();
  let pending: { kind: "undo" | "redo"; epoch: number } | null = null;
  // A popped step remains part of the committed history until its write settles.
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
  async function move(kind: "undo" | "redo", step: UndoStep): Promise<boolean> {
    const started = epoch;
    const [from, to] =
      kind === "undo" ? [undoStack, redoStack] : [redoStack, undoStack];
    pending = { kind, epoch: started };
    try {
      await commit(
        kind === "undo"
          ? [...step.transactions].reverse().map((item) => {
              const reverse = inverse(item);
              return {
                ...reverse,
                meta: { ...reverse.meta, actorReason: "undo" },
              };
            })
          : step.transactions.map((item) => ({
              ...item,
              meta: { ...item.meta, actorReason: "redo" },
            })),
      );
      if (epoch === started) {
        to.push(step);
        pending = null;
        revision++;
        publish();
      }
      return true;
    } catch (error) {
      log.warn(`[pond ${kind}] failed`, error);
      if (epoch === started) {
        from.push(step);
        pending = null;
        publish();
      }
      return false;
    } finally {
      pending = null;
    }
  }
  function latest(
    kind: "undo" | "redo",
    expectedRevision?: number,
  ): Promise<UndoLatestResult> {
    return serialize(async () => {
      if (expectedRevision !== undefined && expectedRevision !== revision)
        return { ok: false, step: null };
      const step = (kind === "undo" ? undoStack : redoStack).pop();
      if (!step) return { ok: false, step: null };
      return { ok: await move(kind, step), step: step.id };
    });
  }
  return {
    record(transactions: Transaction[]): string | null {
      if (!transactions.length) return null;
      const id = createId();
      undoStack.push({ id, transactions: structuredClone(transactions) });
      if (undoStack.length > MAX_HISTORY) undoStack.shift();
      redoStack.length = 0;
      revision++;
      publish();
      return id;
    },
    clear(): void {
      epoch++;
      undoStack.length = 0;
      redoStack.length = 0;
      revision++;
      publish();
    },
    undoLatest: (expectedRevision?: number) => latest("undo", expectedRevision),
    redoLatest: (expectedRevision?: number) => latest("redo", expectedRevision),
    async undo(expectedRevision?: number): Promise<boolean> {
      return (await latest("undo", expectedRevision)).ok;
    },
    async redo(expectedRevision?: number): Promise<boolean> {
      return (await latest("redo", expectedRevision)).ok;
    },
    /** Reverses one recorded step only while it is still the latest change; an already-undone step reports `done`. */
    undoStep(id: string): Promise<UndoStepOutcome> {
      return serialize(async () => {
        if (redoStack.at(-1)?.id === id) return "done";
        if (undoStack.at(-1)?.id !== id) return "stale";
        const step = undoStack.pop();
        if (!step) return "stale";
        return (await move("undo", step)) ? "done" : "failed";
      });
    },
    /** Reapplies one undone step only while it is still the latest undo; an already-redone step reports `done`. */
    redoStep(id: string): Promise<UndoStepOutcome> {
      return serialize(async () => {
        if (undoStack.at(-1)?.id === id) return "done";
        if (redoStack.at(-1)?.id !== id) return "stale";
        const step = redoStack.pop();
        if (!step) return "stale";
        return (await move("redo", step)) ? "done" : "failed";
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
export function recordForUndo(transaction: Transaction): string | null {
  return history.record([transaction]);
}
export function recordBatchForUndo(transactions: Transaction[]): string | null {
  return history.record(transactions);
}
export const undoLatest = (expectedRevision?: number) =>
  withMutationScope(() => history.undoLatest(expectedRevision));
export const redoLatest = (expectedRevision?: number) =>
  withMutationScope(() => history.redoLatest(expectedRevision));
export const undo = (expectedRevision?: number) =>
  withMutationScope(() => history.undo(expectedRevision));
export const redo = (expectedRevision?: number) =>
  withMutationScope(() => history.redo(expectedRevision));
export const undoStep = (id: string) =>
  withMutationScope(() => history.undoStep(id));
export const redoStep = (id: string) =>
  withMutationScope(() => history.redoStep(id));
export const canUndo = history.canUndo;
export const canRedo = history.canRedo;
export const undoRevision = history.revision;

export const clearUndoHistory = history.clear;
