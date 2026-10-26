import type { CaptureReceipt } from "@pond/schema/capture";
import { describe, expect, it } from "vitest";
import { isSettled, outcomeFromResponse } from "./outcome";

function receipt(change: Partial<CaptureReceipt>): CaptureReceipt {
  return {
    id: "c1",
    library: "Memes",
    state: "complete",
    completed: 1,
    total: 1,
    saveIds: ["s1"],
    duplicateCount: 0,
    ...change,
  };
}

describe("outcomeFromResponse", () => {
  it("reports Pond as offline", () => {
    expect(outcomeFromResponse("c1", { ok: false, error: "offline" })).toEqual({
      status: "offline",
      id: "c1",
    });
  });

  it("turns native error codes into copy", () => {
    const outcome = outcomeFromResponse("c1", {
      ok: false,
      error: "unsupported_url",
    });
    expect(outcome).toMatchObject({ status: "failed" });
    expect(
      outcomeFromResponse("c1", { ok: false, error: "something_new" }),
    ).toEqual({
      status: "failed",
      id: "c1",
      message: "Pond couldn't save this. Try again.",
    });
  });

  it("reads a finished save", () => {
    expect(outcomeFromResponse("c1", { ok: true, data: receipt({}) })).toEqual({
      status: "saved",
      id: "c1",
      saveId: "s1",
    });
  });

  it("reports a save that was already in the library", () => {
    expect(
      outcomeFromResponse("c1", {
        ok: true,
        data: receipt({ duplicateCount: 1 }),
      }),
    ).toMatchObject({ status: "duplicate", saveId: "s1" });
  });

  it("reports a save as saved even when its folders didn't apply", () => {
    expect(
      outcomeFromResponse("c1", {
        ok: true,
        data: receipt({ warning: "Saved without your folders." }),
      }),
    ).toEqual({
      status: "saved",
      id: "c1",
      saveId: "s1",
      warning: "Saved without your folders.",
    });
  });

  it("carries Pond's error for a failed save", () => {
    expect(
      outcomeFromResponse("c1", {
        ok: true,
        data: receipt({ state: "failed", saveIds: [], error: "Disk full." }),
      }),
    ).toEqual({ status: "failed", id: "c1", message: "Disk full." });
  });

  it("treats an accepted or unreadable receipt as still sending", () => {
    const accepted = outcomeFromResponse("c1", {
      ok: true,
      data: receipt({ state: "accepted", saveIds: [] }),
    });
    expect(accepted).toEqual({ status: "sending", id: "c1" });
    expect(isSettled(accepted)).toBe(false);
    expect(outcomeFromResponse("c1", { ok: true, data: null })).toEqual({
      status: "sending",
      id: "c1",
    });
  });
});
