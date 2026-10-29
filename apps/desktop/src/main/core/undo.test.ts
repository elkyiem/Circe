import type { Transaction } from "@pond/schema/tx";
import { expect, it } from "vitest";
import { createUndoHistory } from "./undo";

it("republishes recovered flags when a subscribing client observed an in-flight Undo failure", async () => {
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const states: Array<{
    revision: number;
    canUndo: boolean;
    canRedo: boolean;
  }> = [];
  const history = createUndoHistory(
    async () => {
      started.resolve();
      await release.promise;
      throw new Error("File unavailable");
    },
    (state) => states.push(state),
  );
  history.record([
    {
      kind: "update",
      model: "save",
      id: "save",
      before: { rating: 1 },
      patch: { rating: 2 },
    },
  ]);
  const pending = history.undo(1);
  await started.promise;
  expect(history.canUndo()).toBe(true);
  release.resolve();
  expect(await pending).toBe(false);
  expect(states.at(-1)).toEqual({ revision: 1, canUndo: true, canRedo: false });
  expect(states).toHaveLength(2);
});

it("republishes recovered Redo availability after a failed commit", async () => {
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let commits = 0;
  const states: Array<{
    revision: number;
    canUndo: boolean;
    canRedo: boolean;
  }> = [];
  const history = createUndoHistory(
    async () => {
      if (++commits === 1) return;
      started.resolve();
      await release.promise;
      throw new Error("File unavailable");
    },
    (state) => states.push(state),
  );
  history.record([
    {
      kind: "update",
      model: "save",
      id: "save",
      before: { rating: 1 },
      patch: { rating: 2 },
    },
  ]);
  expect(await history.undo(1)).toBe(true);
  const pending = history.redo(2);
  await started.promise;
  expect(history.canRedo()).toBe(true);
  release.resolve();
  expect(await pending).toBe(false);
  expect(states.at(-1)).toEqual({ revision: 2, canUndo: false, canRedo: true });
  expect(states).toHaveLength(3);
});

it("publishes acknowledged history for background records, Undo, Redo and clearing", async () => {
  const states: Array<{
    revision: number;
    canUndo: boolean;
    canRedo: boolean;
  }> = [];
  const history = createUndoHistory(
    async () => {},
    (state) => states.push(state),
  );
  history.record([
    {
      kind: "update",
      model: "save",
      id: "save",
      before: { rating: 1 },
      patch: { rating: 2 },
    },
  ]);
  expect(await history.undo(0)).toBe(false);
  expect(states).toEqual([{ revision: 1, canUndo: true, canRedo: false }]);
  expect(await history.undo(1)).toBe(true);
  expect(await history.redo(2)).toBe(true);
  history.clear();
  expect(states).toEqual([
    { revision: 1, canUndo: true, canRedo: false },
    { revision: 2, canUndo: false, canRedo: true },
    { revision: 3, canUndo: true, canRedo: false },
    { revision: 4, canUndo: false, canRedo: false },
  ]);
});

it("does not undo another window's edit after history changed", async () => {
  const committed: Transaction[][] = [];
  const history = createUndoHistory(async (transactions) => {
    committed.push(transactions);
  });
  const transaction: Transaction = {
    kind: "update",
    model: "save",
    id: "a",
    patch: { rating: 5 },
    before: { rating: 1 },
  };
  history.record([transaction]);
  const firstWindow = history.revision();
  history.record([{ ...transaction, id: "b" }]);
  expect(await history.undo(firstWindow)).toBe(false);
  expect(committed).toEqual([]);
  expect(await history.undo(history.revision())).toBe(true);
  expect(committed[0]?.[0]?.id).toBe("b");
});

it("undoes and redoes an entire rating batch in one command", async () => {
  const ratings = new Map([
    ["a", 5],
    ["b", 5],
  ]);
  const history = createUndoHistory(async (transactions) => {
    for (const transaction of transactions) {
      if (transaction.kind !== "update" || transaction.model !== "save")
        throw new Error("Unexpected transaction");
      ratings.set(transaction.id, transaction.patch.rating ?? 0);
    }
  });
  const transactions: Transaction[] = ["a", "b"].map((id, index) => ({
    kind: "update",
    model: "save",
    id,
    patch: { rating: 5 },
    before: { rating: index + 1 },
  }));
  history.record(transactions);
  expect(await history.undo()).toBe(true);
  expect([...ratings.values()]).toEqual([1, 2]);
  expect(history.canUndo()).toBe(false);
  expect(await history.redo()).toBe(true);
  expect([...ratings.values()]).toEqual([5, 5]);
  expect(history.canRedo()).toBe(false);
});

it("keeps the batch available when undo fails and clears redo on new work", async () => {
  let failing = true;
  const history = createUndoHistory(async () => {
    if (failing) throw new Error("Library unavailable");
  });
  const transaction: Transaction = {
    kind: "update",
    model: "save",
    id: "a",
    patch: { rating: 5 },
    before: { rating: 1 },
  };
  history.record([transaction]);
  expect(await history.undo()).toBe(false);
  expect(history.canUndo()).toBe(true);
  expect(history.canRedo()).toBe(false);
  failing = false;
  expect(await history.undo()).toBe(true);
  history.record([transaction]);
  expect(history.canRedo()).toBe(false);
});

it("does not carry in-flight undo history into another library", async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const history = createUndoHistory(async () => {
    entered.resolve();
    await release.promise;
  });
  history.record([
    {
      kind: "update",
      model: "save",
      id: "old-library",
      patch: { rating: 5 },
      before: { rating: 1 },
    },
  ]);
  const pending = history.undo();
  await entered.promise;
  history.clear();
  release.resolve();
  await pending;
  expect(history.canUndo()).toBe(false);
  expect(history.canRedo()).toBe(false);
});

it("swaps replacement bytes when undoing and redoing file compression", async () => {
  const committed: Transaction[][] = [];
  const history = createUndoHistory(async (transactions) => {
    committed.push(transactions);
  });
  const original = new Uint8Array([1, 2, 3]);
  const compressed = new Uint8Array([4, 5]);
  history.record([
    {
      kind: "update",
      model: "save",
      id: "image",
      before: { files: [] },
      patch: { files: [] },
      files: [{ filename: "image.png", bytes: compressed }],
      beforeFiles: [{ filename: "image.png", bytes: original }],
    },
  ]);
  expect(await history.undo()).toBe(true);
  expect(committed[0]?.[0]).toMatchObject({
    files: [{ filename: "image.png", bytes: original }],
    beforeFiles: [{ filename: "image.png", bytes: compressed }],
  });
  expect(await history.redo()).toBe(true);
  expect(committed[1]?.[0]).toMatchObject({
    files: [{ filename: "image.png", bytes: compressed }],
    beforeFiles: [{ filename: "image.png", bytes: original }],
  });
});
