import { expect, it } from "vitest";
import { waitForHostRestart } from "./host-restart";

it("waits through the old process and downtime until the replacement host is ready", async () => {
  const replies = ["old", new Error("proxy unavailable"), "new"];
  let pauses = 0;
  await waitForHostRestart({
    previous: "old",
    attempts: 5,
    timeoutMs: 60_000,
    pause: async () => {
      pauses++;
    },
    readInstance: async () => {
      const reply = replies.shift();
      if (reply instanceof Error) throw reply;
      if (!reply) throw new Error("No readiness reply");
      return reply;
    },
  });
  expect(pauses).toBe(3);
  expect(replies).toEqual([]);
});

it("reports a saved operation whose host did not return instead of reloading into downtime", async () => {
  await expect(
    waitForHostRestart({
      previous: "old",
      attempts: 2,
      timeoutMs: 60_000,
      pause: async () => {},
      readInstance: async () => "old",
    }),
  ).rejects.toThrow("The Library was saved, but the host has not returned.");
});

it("bounds downtime by elapsed time, including slow readiness requests", async () => {
  let elapsed = 0;
  let requests = 0;
  await expect(
    waitForHostRestart({
      previous: "old",
      attempts: 120,
      timeoutMs: 60_000,
      now: () => elapsed,
      pause: async (milliseconds) => {
        elapsed += milliseconds;
      },
      readInstance: async (remainingMs) => {
        requests++;
        elapsed += Math.min(5000, remainingMs);
        throw new Error("Readiness timed out");
      },
    }),
  ).rejects.toThrow("has not returned");
  expect(elapsed).toBe(60_000);
  expect(requests).toBeLessThan(12);
});
