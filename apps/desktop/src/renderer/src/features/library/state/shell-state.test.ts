import { describe, expect, it } from "vitest";
import { occupiedPaneWidth, predictGridWidth } from "./shell-state";

describe("grid width prediction", () => {
  it("predicts the final grid width from pane state in the same render", () => {
    const open = occupiedPaneWidth({ sidebarOpen: true, sidebarWidth: 220 });
    const closed = occupiedPaneWidth({ sidebarOpen: false, sidebarWidth: 220 });

    expect(open).toBe(220);
    expect(closed).toBe(0);
    expect(predictGridWidth(600, open, closed)).toBe(820);
  });
});
