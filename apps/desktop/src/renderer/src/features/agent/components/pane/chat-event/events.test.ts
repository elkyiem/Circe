import type { AssistantChange } from "@shared/assistant";
import { describe, expect, it } from "vitest";
import { reviewOutcomeText, routineEventText } from "./events";

function change(status: AssistantChange["status"]): AssistantChange {
  return {
    id: status,
    saveId: "save",
    title: "Poster",
    reason: "",
    status,
    field: "title",
    before: null,
    after: "Poster",
  };
}

describe("routineEventText", () => {
  it("says who started the routine and what it looked at", () => {
    expect(routineEventText("Koi", { trigger: "manual" })).toBe(
      "You ran Koi's routine",
    );
    expect(routineEventText("Koi", { trigger: "schedule" })).toBe(
      "Koi ran its scheduled routine",
    );
    expect(routineEventText("Koi", { trigger: "newSaves", saves: 1 })).toBe(
      "Koi looked at 1 new Save",
    );
    expect(routineEventText("Koi", { trigger: "newSaves", saves: 4 })).toBe(
      "Koi looked at 4 new Saves",
    );
  });

  it("names the routine when the run carries one", () => {
    expect(
      routineEventText("Koi", { trigger: "manual", name: "Morning Digest" }),
    ).toBe('You ran "Morning Digest"');
    expect(
      routineEventText("Koi", { trigger: "schedule", name: "Morning Digest" }),
    ).toBe('Koi ran "Morning Digest"');
  });
});

describe("reviewOutcomeText", () => {
  it("waits until every change is resolved", () => {
    expect(reviewOutcomeText([])).toBeNull();
    expect(
      reviewOutcomeText([change("applied"), change("pending")]),
    ).toBeNull();
  });

  it("summarizes what you did with the changes", () => {
    expect(reviewOutcomeText([change("applied")])).toBe("You applied 1 change");
    expect(
      reviewOutcomeText([
        change("applied"),
        change("applied"),
        change("dismissed"),
      ]),
    ).toBe("You applied 2 changes and dismissed 1");
    expect(
      reviewOutcomeText([
        change("applied"),
        change("dismissed"),
        change("undone"),
      ]),
    ).toBe("You applied 1 change, dismissed 1, and undid 1");
  });
});
