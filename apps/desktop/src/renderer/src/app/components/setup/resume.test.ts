// @vitest-environment jsdom

import { afterEach, expect, it } from "vitest";
import { setupResume } from "./resume";

afterEach(() => localStorage.clear());

it("reopens on the import step once after a relaunch", () => {
  setupResume.mark();
  expect(setupResume.take()).toBe(true);
  expect(setupResume.take()).toBe(false);
});

it("forgets the step when the Library change fails", () => {
  setupResume.mark();
  setupResume.clear();
  expect(setupResume.take()).toBe(false);
});
