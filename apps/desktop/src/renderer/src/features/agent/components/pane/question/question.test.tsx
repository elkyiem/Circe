import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { KoiQuestion } from ".";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const options = ["Grid", "List"];
const continueButton = () =>
  [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "Continue",
  );

it("letters each option, then a freeform row", async () => {
  await act(async () =>
    root.render(
      <KoiQuestion
        question="Which layout?"
        options={options}
        onAnswer={vi.fn()}
      />,
    ),
  );
  const choices = [...host.querySelectorAll("button[aria-pressed]")];
  expect(choices.map((choice) => choice.textContent)).toEqual([
    "AGrid",
    "BList",
  ]);
  expect(host.querySelector('input[aria-label="Your answer"]')).not.toBeNull();
  expect(continueButton()?.disabled).toBe(true);
});

it("sends the picked option", async () => {
  const onAnswer = vi.fn(async () => {});
  await act(async () =>
    root.render(
      <KoiQuestion
        question="Which layout?"
        options={options}
        onAnswer={onAnswer}
      />,
    ),
  );
  const list = host.querySelectorAll<HTMLButtonElement>(
    "button[aria-pressed]",
  )[1];
  await act(async () => list?.click());
  expect(list?.getAttribute("aria-pressed")).toBe("true");
  await act(async () => continueButton()?.click());
  expect(onAnswer).toHaveBeenCalledWith("List");
});

it("sends an option on Enter", async () => {
  const onAnswer = vi.fn(async () => {});
  await act(async () =>
    root.render(
      <KoiQuestion
        question="Which layout?"
        options={options}
        onAnswer={onAnswer}
      />,
    ),
  );
  const grid = host.querySelector<HTMLButtonElement>("button[aria-pressed]");
  await act(async () =>
    grid?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    ),
  );
  expect(onAnswer).toHaveBeenCalledWith("Grid");
});

it("hides freeform on older questions", async () => {
  await act(async () =>
    root.render(
      <KoiQuestion
        question="Which layout?"
        options={options}
        disabled
        onAnswer={vi.fn()}
      />,
    ),
  );
  expect(host.querySelector("input")).toBeNull();
});

it("shows an answered question as the question over the answer", async () => {
  await act(async () =>
    root.render(
      <KoiQuestion
        question="Which layout?"
        options={options}
        answered="List"
        onAnswer={vi.fn()}
      />,
    ),
  );
  expect(host.textContent).toBe("Which layout?List");
  expect(continueButton()).toBeUndefined();
});
