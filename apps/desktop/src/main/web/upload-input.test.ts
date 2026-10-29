import { expect, it } from "vitest";
import { consumeWebUpload } from "./upload-input";

it("keeps the source alive until persistence settles and preserves a committed result if cleanup fails", async () => {
  const written = Promise.withResolvers<void>();
  const began = Promise.withResolvers<void>();
  let removed = false;
  const result = consumeWebUpload({
    token: "ticket",
    library: "library",
    uploads: {
      async get(token, library) {
        expect([token, library]).toEqual(["ticket", "library"]);
        return {
          id: "id",
          libraryId: library,
          filename: "image.png",
          size: 1,
          createdAt: 0,
          path: "/staged/image.png",
        };
      },
      async remove() {
        removed = true;
        throw new Error("Staging is temporarily locked");
      },
    },
    async apply(file) {
      expect(file.path).toBe("/staged/image.png");
      began.resolve();
      await written.promise;
      expect(removed).toBe(false);
      return { ok: true, id: "persisted-save" };
    },
  });
  await began.promise;
  expect(removed).toBe(false);
  written.resolve();
  await expect(result).resolves.toEqual({ ok: true, id: "persisted-save" });
  expect(removed).toBe(true);
});

it("retains the original persistence error when staging cleanup also fails", async () => {
  const failure = new Error("The Library edit could not commit");
  await expect(
    consumeWebUpload({
      token: "ticket",
      library: "library",
      uploads: {
        async get() {
          return {
            id: "id",
            libraryId: "library",
            filename: "image.png",
            size: 1,
            createdAt: 0,
            path: "/staged/image.png",
          };
        },
        async remove() {
          throw new Error("Staging is locked");
        },
      },
      async apply() {
        throw failure;
      },
    }),
  ).rejects.toBe(failure);
});

it("does not consume a ticket rejected by the Library-scoped store", async () => {
  let edited = false;
  let removed = false;
  await expect(
    consumeWebUpload({
      token: "foreign-ticket",
      library: "library",
      uploads: {
        async get() {
          throw new Error("This upload belongs to another Library");
        },
        async remove() {
          removed = true;
        },
      },
      async apply() {
        edited = true;
      },
    }),
  ).rejects.toThrow("another Library");
  expect(edited || removed).toBe(false);
});
