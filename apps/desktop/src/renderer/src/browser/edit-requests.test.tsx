import { afterEach, expect, it, vi } from "vitest";
import { onBrowserEditRequest } from "./edit-requests";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.replaceChildren();
});
function key(input: KeyboardEventInit, target: EventTarget = window) {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...input,
  });
  target.dispatchEvent(event);
  return event;
}

it("routes Mac Edit shortcuts and releases its keyboard subscription", () => {
  const undo = vi.fn();
  const redo = vi.fn();
  const detach = onBrowserEditRequest("undo", undo, "mac");
  cleanups.push(detach, onBrowserEditRequest("redo", redo, "mac"));
  expect(key({ key: "z", ctrlKey: true }).defaultPrevented).toBe(false);
  expect(key({ key: "z", metaKey: true }).defaultPrevented).toBe(true);
  expect(
    key({ key: "Z", metaKey: true, shiftKey: true }).defaultPrevented,
  ).toBe(true);
  expect(undo).toHaveBeenCalledOnce();
  expect(redo).toHaveBeenCalledOnce();
  detach();
  expect(key({ key: "z", metaKey: true }).defaultPrevented).toBe(false);
  expect(undo).toHaveBeenCalledOnce();
});

it.each(["windows", "linux"] as const)(
  "uses Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y on %s",
  (platform) => {
    const undo = vi.fn();
    const redo = vi.fn();
    cleanups.push(
      onBrowserEditRequest("undo", undo, platform),
      onBrowserEditRequest("redo", redo, platform),
    );
    key({ key: "z", ctrlKey: true });
    key({ key: "Z", ctrlKey: true, shiftKey: true });
    key({ key: "y", ctrlKey: true });
    expect(key({ key: "z", metaKey: true }).defaultPrevented).toBe(false);
    expect(undo).toHaveBeenCalledOnce();
    expect(redo).toHaveBeenCalledTimes(2);
  },
);

it.each(["input", "textarea", "select", "contenteditable"])(
  "retains the browser's editing history in a %s",
  (name) => {
    const callback = vi.fn();
    cleanups.push(onBrowserEditRequest("undo", callback, "windows"));
    const element = document.createElement(
      name === "contenteditable" ? "div" : name,
    );
    if (name === "contenteditable") {
      element.setAttribute("contenteditable", "true");
      element.setAttribute("tabindex", "0");
    }
    document.body.append(element);
    element.focus();
    expect(key({ key: "z", ctrlKey: true }, element).defaultPrevented).toBe(
      false,
    );
    expect(callback).not.toHaveBeenCalled();
  },
);

it("respects already handled keys, composition and unrelated modifier chords", () => {
  const callback = vi.fn();
  cleanups.push(onBrowserEditRequest("undo", callback, "windows"));
  const handled = new KeyboardEvent("keydown", {
    key: "z",
    ctrlKey: true,
    cancelable: true,
  });
  handled.preventDefault();
  window.dispatchEvent(handled);
  key({ key: "z", ctrlKey: true, isComposing: true });
  key({ key: "z", ctrlKey: true, altKey: true });
  key({ key: "z" });
  expect(callback).not.toHaveBeenCalled();
});
