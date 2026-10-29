import { describe, expect, it } from "vitest";
import { createWebSessions } from "./auth";

describe("web sessions", () => {
  it("expires, revokes and isolates credentials", () => {
    let now = 0;
    const sessions = createWebSessions("host-key", () => now);
    expect(sessions.login("wrong")).toBeNull();
    const first = sessions.login("host-key") ?? "";
    const second = sessions.login("host-key") ?? "";
    expect(sessions.valid(first)).toBe(true);
    sessions.revoke(first);
    expect(sessions.valid(first)).toBe(false);
    expect(sessions.valid(second)).toBe(true);
    now = 12 * 60 * 60_000;
    expect(sessions.valid(second)).toBe(false);
  });
  it("binds sessions to a Library and origin and immediately notifies revoked streams", () => {
    const sessions = createWebSessions("host-key");
    const id =
      sessions.login("host-key", "https://owner.test\0library-a") ?? "";
    let revoked = 0;
    sessions.onRevoke(id, () => {
      revoked++;
    });
    expect(sessions.valid(id, "https://owner.test\0library-a")).toBe(true);
    expect(sessions.valid(id, "https://owner.test\0library-b")).toBe(false);
    expect(revoked).toBe(1);
    expect(sessions.valid(id, "https://owner.test\0library-a")).toBe(false);
  });
});

it("closes admission before awaiting durable writes and keeps records for the next host", async () => {
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let rows: import("./auth").SavedWebSession[] = [];
  const sessions = createWebSessions("fixture-key", () => 1000, {
    restored: [],
    warn: () => {},
    persist: async (snapshot) => {
      started.resolve();
      await release.promise;
      rows = snapshot;
    },
  });
  const cookie = sessions.login("fixture-key", "scope") ?? "";
  await started.promise;
  let closed = false;
  const closing = sessions.close().then(() => {
    closed = true;
  });
  expect(sessions.valid(cookie, "scope")).toBe(false);
  expect(() => sessions.login("fixture-key", "scope")).toThrow("restarting");
  expect(() => sessions.revoke(cookie)).toThrow("restarting");
  expect(closed).toBe(false);
  release.resolve();
  await closing;
  const reopened = createWebSessions("fixture-key", () => 1000, {
    restored: rows,
    warn: () => {},
    persist: async () => {},
  });
  expect(reopened.valid(cookie, "scope")).toBe(true);
  await reopened.close();
});

it("retries the same logout after a failed durable write without another login", async () => {
  let rows: import("./auth").SavedWebSession[] = [];
  let fail = false;
  const sessions = createWebSessions("fixture-key", () => 1000, {
    restored: [],
    warn: () => {},
    persist: async (snapshot) => {
      if (fail) throw new Error("Fixture disk unavailable");
      rows = snapshot;
    },
  });
  const cookie = sessions.login("fixture-key", "scope") ?? "";
  await sessions.flush();
  expect(rows).toHaveLength(1);
  fail = true;
  sessions.revoke(cookie);
  await expect(sessions.flush()).rejects.toThrow("disk unavailable");
  expect(rows).toHaveLength(1);
  fail = false;
  sessions.revoke(cookie);
  await sessions.flush();
  expect(rows).toEqual([]);
  const reopened = createWebSessions("fixture-key", () => 1000, {
    restored: rows,
    warn: () => {},
    persist: async () => {},
  });
  expect(reopened.valid(cookie, "scope")).toBe(false);
  await Promise.all([sessions.close(), reopened.close()]);
});
