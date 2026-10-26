import { describe, expect, it } from "vitest";
import { nextTrackWidth } from "./track";

describe("nextTrackWidth", () => {
  it("grows the sidebar when dragging right", () => {
    expect(
      nextTrackWidth({
        edge: "left",
        startWidth: 220,
        startX: 220,
        clientX: 260,
        min: 180,
        max: 420,
      }),
    ).toBe(260);
  });

  it("grows Assistant when dragging left", () => {
    expect(
      nextTrackWidth({
        edge: "right",
        startWidth: 340,
        startX: 900,
        clientX: 860,
        min: 280,
        max: 560,
      }),
    ).toBe(380);
  });

  it("clamps to min and max", () => {
    expect(
      nextTrackWidth({
        edge: "left",
        startWidth: 220,
        startX: 220,
        clientX: 100,
        min: 180,
        max: 420,
      }),
    ).toBe(180);
    expect(
      nextTrackWidth({
        edge: "right",
        startWidth: 340,
        startX: 900,
        clientX: 500,
        min: 280,
        max: 560,
      }),
    ).toBe(560);
  });

  it.each([172, 120, 80])(
    "collapses an opted-in sidebar at %ipx",
    (clientX) => {
      expect(
        nextTrackWidth({
          edge: "left",
          startWidth: 300,
          startX: 300,
          clientX,
          min: 220,
          max: 420,
          collapseAtMin: true,
        }),
      ).toBeNull();
    },
  );

  it.each([220, 200, 173])(
    "holds at min before the collapse overshoot at %ipx",
    (clientX) => {
      expect(
        nextTrackWidth({
          edge: "left",
          startWidth: 300,
          startX: 300,
          clientX,
          min: 220,
          max: 420,
          collapseAtMin: true,
        }),
      ).toBe(220);
    },
  );

  it("keeps resizing above the collapse boundary", () => {
    expect(
      nextTrackWidth({
        edge: "left",
        startWidth: 300,
        startX: 300,
        clientX: 221,
        min: 220,
        max: 420,
        collapseAtMin: true,
      }),
    ).toBe(221);
  });

  it("still clamps tracks that do not opt into collapsing", () => {
    expect(
      nextTrackWidth({
        edge: "right",
        startWidth: 340,
        startX: 900,
        clientX: 1000,
        min: 280,
        max: 560,
      }),
    ).toBe(280);
  });
});
