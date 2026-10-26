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
});
