import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { finishHostLocation, pickHostLocation } from "@/browser/host-locations";
import { fishIntroDialog } from "@/shared/state/fish-intro";
import { FishIntroDialog } from ".";
import { readFishIntroState, writeFishIntroState } from "./eligibility";

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  fishIntroDialog.close();
  finishHostLocation(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.replaceChildren();
});

it.each(["dialog", "alertdialog", "menu"])(
  "defers the automatic introduction while an active %s owns keyboard focus",
  async (role) => {
    vi.useFakeTimers();
    vi.stubGlobal("pond", { query: async () => [], onFish: () => () => {} });
    writeFishIntroState("due");
    const picker = document.createElement("div");
    picker.setAttribute("role", role);
    const input = document.createElement("input");
    picker.append(input);
    document.body.append(picker);
    input.focus();
    const mount = document.createElement("div");
    document.body.append(mount);
    root = createRoot(mount);
    act(() => root?.render(<FishIntroDialog />));
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(fishIntroDialog.isOpen()).toBe(false);
    expect(readFishIntroState()).toBe("due");
    expect(document.activeElement).toBe(input);
    picker.remove();
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(fishIntroDialog.isOpen()).toBe(true);
    expect(readFishIntroState()).toBe("shown");
    expect(
      Array.from(document.querySelectorAll("h2")).some(
        (heading) => heading.textContent === "Meet Your Fish",
      ),
    ).toBe(true);
  },
);

it("defers while a host-folder chooser is requested but its lazy dialog has not mounted", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("pond", { query: async () => [], onFish: () => () => {} });
  writeFishIntroState("due");
  const selection = pickHostLocation({
    title: "Choose a folder",
    purpose: "watch",
    list: async () => ({
      current: null,
      parent: null,
      entries: [],
      nextOffset: null,
    }),
    mkdir: async () => {
      throw new Error("Not used");
    },
  });
  const mount = document.createElement("div");
  document.body.append(mount);
  root = createRoot(mount);
  act(() => root?.render(<FishIntroDialog />));
  await act(async () => {
    vi.advanceTimersByTime(6000);
  });
  expect(fishIntroDialog.isOpen()).toBe(false);
  expect(readFishIntroState()).toBe("due");
  finishHostLocation(null);
  await selection;
  await act(async () => {
    vi.advanceTimersByTime(3000);
  });
  expect(fishIntroDialog.isOpen()).toBe(true);
});
