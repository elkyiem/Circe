import { expect, it } from "vitest";
import { createLibraryAccess, LibraryTransitionError } from "./library-access";

it("closes admission before cancellation and waits for admitted asynchronous reads", async () => {
  const access = createLibraryAccess();
  const read = Promise.withResolvers<void>();
  const began = Promise.withResolvers<void>();
  const events: string[] = [];
  const pending = access.run(async () => {
    events.push("read");
    await read.promise;
    events.push("read settled");
  });
  const transition = access.transition({
    prepare: async () => {
      events.push("cancel");
      began.resolve();
    },
    operation: async () => {
      events.push("rename");
    },
    keepClosed: () => false,
  });
  await began.promise;
  await expect(access.run(async () => "late read")).rejects.toBeInstanceOf(
    LibraryTransitionError,
  );
  expect(events).toEqual(["read", "cancel"]);
  read.resolve();
  await Promise.all([pending, transition]);
  expect(events).toEqual(["read", "cancel", "read settled", "rename"]);
  await expect(access.run(async () => "new read")).resolves.toBe("new read");
});

it("tracks detached asynchronous work after its response lease has ended", async () => {
  const access = createLibraryAccess();
  const finish = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  let job: Promise<void> = Promise.resolve();
  await access.run(async () => {
    job = access.run(async () => {
      started.resolve();
      await finish.promise;
    });
  });
  await started.promise;
  let renamed = false;
  const transition = access.transition({
    prepare: async () => {},
    operation: async () => {
      renamed = true;
    },
    keepClosed: () => false,
  });
  await Promise.resolve();
  expect(renamed).toBe(false);
  finish.resolve();
  await Promise.all([job, transition]);
  expect(renamed).toBe(true);
});

it("promotes a nested location request without waiting on its own leases", async () => {
  const access = createLibraryAccess();
  await expect(
    access.run(() =>
      access.run(async () => {
        access.releaseCurrent();
        return access.transition({
          prepare: async () => {},
          operation: async () => "renamed",
          keepClosed: () => false,
        });
      }),
    ),
  ).resolves.toBe("renamed");
  await expect(access.run(async () => "normal request")).resolves.toBe(
    "normal request",
  );
});

it("seals unrelated database openers until restart while allowing transition recovery", async () => {
  const access = createLibraryAccess();
  let keepClosed = true;
  await access.transition({
    prepare: async () => {},
    operation: async () => {
      access.sealDatabase();
      expect(() => access.assertDatabaseAvailable()).not.toThrow();
    },
    keepClosed: () => keepClosed,
  });
  expect(() => access.assertDatabaseAvailable()).toThrow(
    LibraryTransitionError,
  );
  await expect(access.run(async () => "read")).rejects.toThrow(
    LibraryTransitionError,
  );
  keepClosed = false;
  await access.transition({
    prepare: async () => {},
    operation: async () => {},
    keepClosed: () => false,
  });
  expect(() => access.assertDatabaseAvailable()).not.toThrow();
});

it("restores admission if preparation or the transition fails", async () => {
  for (const failure of ["prepare", "operation"]) {
    const access = createLibraryAccess();
    await expect(
      access.transition({
        prepare: async () => {
          if (failure === "prepare") throw new Error("cancel failed");
        },
        operation: async () => {
          access.sealDatabase();
          throw new Error("rename failed");
        },
        keepClosed: () => false,
      }),
    ).rejects.toThrow();
    await expect(
      access.run(async () => {
        access.assertDatabaseAvailable();
        return "usable";
      }),
    ).resolves.toBe("usable");
  }
});

it("returns to normal operation when an unfinished native action prevents draining", async () => {
  const access = createLibraryAccess();
  const finish = Promise.withResolvers<void>();
  const reading = access.run(() => finish.promise);
  let changed = false;
  try {
    await expect(
      access.transition({
        prepare: async () => {},
        operation: async () => {
          changed = true;
        },
        keepClosed: () => false,
        drainTimeoutMs: 1,
      }),
    ).rejects.toThrow("Finish or cancel the current Library action");
    expect(changed).toBe(false);
    await expect(access.run(async () => "ready")).resolves.toBe("ready");
  } finally {
    finish.resolve();
    await reading;
  }
});

it("also bounds cancellation preparation when a native tool does not observe abort", async () => {
  const access = createLibraryAccess();
  const finish = Promise.withResolvers<void>();
  let changed = false;
  try {
    await expect(
      access.transition({
        prepare: () => finish.promise,
        operation: async () => {
          changed = true;
        },
        keepClosed: () => false,
        drainTimeoutMs: 1,
      }),
    ).rejects.toThrow("Finish or cancel the current Library action");
    expect(changed).toBe(false);
    await expect(access.run(async () => "ready")).resolves.toBe("ready");
  } finally {
    finish.resolve();
  }
});
