import { expect, it } from "vitest";
import { libraryAccess } from "../core/library-access";
import { createWebEventQueue } from "./event-queue";

it("retains every event during temporary closure and resumes in order without aborting", async () => {
  const delivered: string[] = [];
  let aborted = false;
  const queue = createWebEventQueue({
    sessionValid: () => true,
    scopeCurrent: () => {
      libraryAccess.assertDatabaseAvailable();
      return true;
    },
    write: async ({ data }) => {
      delivered.push(data);
    },
    abort: () => {
      aborted = true;
    },
  });
  queue.start();
  try {
    await libraryAccess.transition({
      prepare: async () => {
        queue.offer({ event: "enrichment", data: "paused" });
      },
      operation: async () => {
        libraryAccess.sealDatabase();
        queue.offer({ event: "sync", data: "merge-1" });
        queue.offer({ event: "sync", data: "merge-2" });
        expect(delivered).toEqual([]);
        expect(aborted).toBe(false);
      },
      keepClosed: () => false,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(delivered).toEqual(["paused", "merge-1", "merge-2"]);
    expect(aborted).toBe(false);
  } finally {
    queue.dispose();
  }
});

it("discards queued events if reopening points at another Library", async () => {
  const delivered: string[] = [];
  let current = true;
  let aborted = false;
  const queue = createWebEventQueue({
    sessionValid: () => true,
    scopeCurrent: () => current,
    write: async ({ data }) => {
      delivered.push(data);
    },
    abort: () => {
      aborted = true;
    },
  });
  queue.start();
  try {
    await libraryAccess.transition({
      prepare: async () => {},
      operation: async () => {
        current = false;
        queue.offer({ event: "sync", data: "foreign-Library" });
      },
      keepClosed: () => false,
    });
    expect(aborted).toBe(true);
    expect(delivered).toEqual([]);
  } finally {
    queue.dispose();
  }
});

it("bounds pending events and rejects expired sessions even while paths are sealed", async () => {
  for (const reason of ["expired", "overflow"]) {
    let valid = true;
    let aborted = false;
    const queue = createWebEventQueue({
      sessionValid: () => valid,
      scopeCurrent: () => {
        libraryAccess.assertDatabaseAvailable();
        return true;
      },
      write: async () => {
        throw new Error("Must not deliver while sealed");
      },
      abort: () => {
        aborted = true;
      },
    });
    try {
      await libraryAccess.transition({
        prepare: async () => {},
        operation: async () => {
          libraryAccess.sealDatabase();
          if (reason === "expired") valid = false;
          for (
            let index = 0;
            index < (reason === "overflow" ? 5001 : 1);
            index++
          )
            queue.offer({ event: "sync", data: "fixture" });
          expect(aborted).toBe(true);
        },
        keepClosed: () => false,
      });
    } finally {
      queue.dispose();
    }
  }
});
