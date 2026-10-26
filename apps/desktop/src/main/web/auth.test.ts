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
