import { describe, expect, it } from "vitest";
import { rowPreview, rowTime, rowTimestamp } from "./row";

const idle = { activity: null, lastRun: null, latest: null } as const;

describe("rowPreview", () => {
  it("shows what the fish is doing over its last message", () => {
    expect(
      rowPreview({
        ...idle,
        activity: "searching",
        latest: { from: "fish", text: "Done.", at: 1 },
      }),
    ).toEqual({ text: "Searching your library", tone: "busy" });
  });

  it("surfaces an unseen routine result before the last message", () => {
    const run = {
      chatId: "c",
      at: 1,
      status: "done",
      changes: 3,
      seen: false,
    } as const;
    expect(rowPreview({ ...idle, lastRun: run }).text).toBe(
      "3 changes to review",
    );
    expect(
      rowPreview({
        ...idle,
        lastRun: { ...run, status: "failed", error: "No model.", changes: 0 },
      }),
    ).toEqual({ text: "No model.", tone: "alert" });
    expect(
      rowPreview({
        ...idle,
        lastRun: { ...run, seen: true },
        latest: { from: "fish", text: "Tagged them.", at: 2 },
      }).text,
    ).toBe("Tagged them.");
  });

  it("labels who spoke last", () => {
    expect(
      rowPreview({ ...idle, latest: { from: "you", text: "Tag these", at: 1 } })
        .text,
    ).toBe("You: Tag these");
    expect(
      rowPreview({ ...idle, latest: { from: "routine", text: "", at: 1 } })
        .text,
    ).toBe("Ran its routine");
    expect(rowPreview(idle)).toEqual({
      text: "No messages yet",
      tone: "quiet",
    });
  });
});

describe("rowTime", () => {
  const now = new Date(2026, 9, 24, 15, 0);

  it("uses the clock today, then relative days, then the date", () => {
    expect(rowTime(new Date(2026, 9, 24, 9, 5).getTime(), now)).toMatch(/9:05/);
    expect(rowTime(new Date(2026, 9, 23, 23, 0).getTime(), now)).toBe(
      "Yesterday",
    );
    expect(rowTime(new Date(2026, 9, 20).getTime(), now)).toBe(
      new Date(2026, 9, 20).toLocaleDateString(undefined, { weekday: "short" }),
    );
    expect(rowTime(new Date(2026, 8, 2).getTime(), now)).not.toMatch(/2026/);
    expect(rowTime(new Date(2025, 8, 2).getTime(), now)).toMatch(/2025/);
  });
});

describe("rowTimestamp", () => {
  it("picks the newer of the last message and the last run", () => {
    expect(rowTimestamp({ lastRun: null, latest: null })).toBeNull();
    expect(
      rowTimestamp({
        lastRun: {
          chatId: null,
          at: 9,
          status: "failed",
          changes: 0,
          seen: false,
        },
        latest: { from: "you", text: "hi", at: 4 },
      }),
    ).toBe(9);
  });
});
