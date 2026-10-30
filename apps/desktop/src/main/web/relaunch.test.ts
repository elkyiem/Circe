import { expect, it } from "vitest";
import { relaunchWebHost } from "./relaunch";

it("reopens a standalone host before exiting the prepared process", () => {
  const events: Array<string | number> = [];
  relaunchWebHost(
    {
      relaunch: () => events.push("relaunch"),
      exit: (code) => events.push(code ?? 0),
    },
    false,
  );
  expect(events).toEqual(["relaunch", 0]);
});

it("hands replacement to the terminal supervisor without spawning another host", () => {
  const events: Array<string | number> = [];
  relaunchWebHost(
    {
      relaunch: () => events.push("relaunch"),
      exit: (code) => events.push(code ?? 0),
    },
    true,
  );
  expect(events).toEqual([75]);
});
