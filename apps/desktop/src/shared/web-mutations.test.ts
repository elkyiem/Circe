import { expect, it } from "vitest";
import { WebTransactionSchema } from "./web-mutations";

it("rejects internal metadata, source identity and file writes through user edits", () => {
  for (const patch of [
    { rawJson: {} },
    { files: [] },
    { id: "other" },
    { sourceId: "other" },
    { status: "complete" },
    { savedAt: 0 },
    { embedding: [1] },
  ]) {
    expect(
      WebTransactionSchema.safeParse({
        kind: "update",
        model: "save",
        id: "a",
        patch,
        before: {},
      }).success,
    ).toBe(false);
  }
  expect(
    WebTransactionSchema.safeParse({
      kind: "delete",
      model: "save",
      id: "a",
      before: {},
    }).success,
  ).toBe(false);
  expect(
    WebTransactionSchema.safeParse({
      kind: "create",
      model: "save",
      id: "a",
      data: {},
    }).success,
  ).toBe(false);
});

it("accepts a compare-and-set edit while rejecting forged title locks and filesystem bytes", () => {
  const edit = {
    kind: "update",
    model: "save",
    id: "a",
    patch: { title: "New" },
    before: { title: "Old" },
  };
  expect(WebTransactionSchema.safeParse(edit).success).toBe(true);
  expect(
    WebTransactionSchema.safeParse({
      ...edit,
      titleLock: { before: false, after: false },
    }).success,
  ).toBe(false);
  expect(
    WebTransactionSchema.safeParse({
      ...edit,
      files: [{ filename: "outside", bytes: [] }],
    }).success,
  ).toBe(false);
});
