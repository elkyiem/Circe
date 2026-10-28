import { describe, expect, it } from "vitest";
import {
  menuActionSourceFromClick,
  shouldOpenLibraryForMenuAction,
} from "./menu-action";

describe("menu action delivery", () => {
  it("treats accelerator clicks as accelerator-sourced", () => {
    expect(menuActionSourceFromClick({ triggeredByAccelerator: true })).toBe(
      "accelerator",
    );
    expect(menuActionSourceFromClick({ triggeredByAccelerator: false })).toBe(
      "menu",
    );
    expect(menuActionSourceFromClick()).toBe("menu");
  });

  it("does not focus the library for accelerator-sourced actions", () => {
    expect(shouldOpenLibraryForMenuAction("accelerator")).toBe(false);
    expect(shouldOpenLibraryForMenuAction("menu")).toBe(true);
    expect(shouldOpenLibraryForMenuAction("automation")).toBe(true);
  });

  it("keeps a connect or sign-in window focused while typing accelerators fire", () => {
    expect(shouldOpenLibraryForMenuAction("accelerator")).toBe(false);
  });
});
