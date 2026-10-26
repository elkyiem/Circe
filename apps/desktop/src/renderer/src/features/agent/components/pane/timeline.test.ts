import { expect, it } from "vitest";
import type { PondUIMessage } from "@/features/agent/state/pond-messages";
import { timeBreaks, timeLabel, turnMarks } from "./timeline";

const at = (hours: number, minutes = 0) =>
  new Date(2026, 9, 20, hours, minutes);

it("stamps the first message and each return after a quiet stretch", () => {
  expect(
    timeBreaks([at(1, 49), at(1, 50), undefined, at(2, 6), at(2, 40)]),
  ).toEqual([true, false, false, false, true]);
});

it("leaves live messages without a time unstamped", () => {
  expect(timeBreaks([undefined, undefined])).toEqual([false, false]);
});

it("names the day relative to now", () => {
  const now = at(21);
  expect(timeLabel(at(1, 49), now)).toMatch(/^Today /);
  expect(timeLabel(new Date(2026, 9, 19, 9), now)).toMatch(/^Yesterday /);
  expect(timeLabel(new Date(2026, 9, 1, 9), now)).toMatch(/^Oct 1, /);
});

function said(
  id: string,
  role: PondUIMessage["role"],
  text: string,
  metadata: PondUIMessage["metadata"] = null,
): PondUIMessage {
  return { id, role, parts: [{ type: "text", text }], metadata };
}

it("marks each turn you started with a preview of the reply", () => {
  const marks = turnMarks(
    [
      said("u1", "user", "Find my **poster** saves"),
      said("a1", "assistant", "Found 3.\n[[next]]\nWant them tagged?"),
      said("u2", "user", "", { routine: { trigger: "schedule" } }),
      said("a2", "assistant", ""),
      said("u3", "user", "Thanks"),
    ],
    "chat",
    "Koi",
  );
  expect(marks).toEqual([
    {
      id: "u1",
      title: "Find my poster saves",
      description: "Found 3. Want them tagged?",
    },
    {
      id: "u2",
      title: "Koi ran its scheduled routine",
      description: undefined,
    },
    { id: "u3", title: "Thanks", description: undefined },
  ]);
});
