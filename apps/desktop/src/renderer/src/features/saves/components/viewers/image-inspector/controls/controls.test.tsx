import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resultNavigation } from "@/features/saves/state/result-navigation";
import { ImageControls } from ".";

describe("image inspector toolbar", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    resultNavigation.setSource({ ids: ["image"], total: 493 });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it("shows the compact image action sequence at the small size", async () => {
    const noop = vi.fn();
    await act(async () =>
      root.render(
        <ImageControls.Hud
          actual={1}
          active
          busy={false}
          canCrop={false}
          saveId="image"
          mode="view"
          onActualSize={noop}
          onApplyCrop={noop}
          onCancelCrop={noop}
          onFit={noop}
          onFlip={noop}
          onRotate={noop}
          onSaveCrop={noop}
          onToggleCrop={noop}
          onZoomIn={noop}
          onZoomOut={noop}
          onZoomRatio={noop}
        />,
      ),
    );

    const labels = [...host.querySelectorAll("button")]
      .map((button) => button.getAttribute("aria-label"))
      .filter((label): label is string => label !== null);
    expect(labels).toEqual([
      "Zoom Out",
      "Zoom Ratio",
      "Zoom In",
      "Previous Save",
      "Next Save",
      "Flip",
      "Rotate",
      "Crop",
      "Actual Size",
      "Fit to Window",
      "Previous Slide",
      "Next Slide",
    ]);
    expect(host.textContent).not.toContain("1 / 493");
    const end = host.querySelector('[data-viewer-bar-slot="end"]');
    expect(end?.textContent).toBe("");
    for (const label of ["Previous Slide", "Next Slide"])
      expect(
        end?.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)
          ?.disabled,
      ).toBe(true);
    const start = host.querySelector('[data-viewer-bar-slot="start"]');
    expect(start?.textContent).toBe("");
    expect(
      start?.querySelector<HTMLButtonElement>('[aria-label="Previous Save"]')
        ?.disabled,
    ).toBe(true);
    expect(host.querySelectorAll('[role="separator"]')).toHaveLength(0);

    for (const label of labels) {
      const button = host.querySelector<HTMLButtonElement>(
        `button[aria-label="${label}"]`,
      );
      expect(button, label).not.toBeNull();
      expect(button?.dataset.size, label).toBe("sm");
    }
  });

  it("puts slide arrows on the right and image actions in the middle", async () => {
    const noop = vi.fn();
    const onNext = vi.fn();
    const onPrevious = vi.fn();
    await act(async () =>
      root.render(
        <ImageControls.Hud
          actual={1}
          active
          busy={false}
          canCrop={false}
          saveId="image"
          mode="view"
          slideNavigation={{
            index: 0,
            count: 2,
            onNext,
            onPrevious,
          }}
          onActualSize={noop}
          onApplyCrop={noop}
          onCancelCrop={noop}
          onFit={noop}
          onFlip={noop}
          onRotate={noop}
          onSaveCrop={noop}
          onToggleCrop={noop}
          onZoomIn={noop}
          onZoomOut={noop}
          onZoomRatio={noop}
        />,
      ),
    );

    const previous = host.querySelector<HTMLButtonElement>(
      '[aria-label="Previous Slide"]',
    );
    const next = host.querySelector<HTMLButtonElement>(
      '[aria-label="Next Slide"]',
    );
    expect(previous?.disabled).toBe(true);
    expect(next?.disabled).toBe(false);
    const end = host.querySelector('[data-viewer-bar-slot="end"]');
    const center = host.querySelector('[data-viewer-bar-slot="center"]');
    expect(end?.contains(previous ?? null)).toBe(true);
    expect(end?.textContent).toBe("1 / 2");
    expect(center?.querySelector('[aria-label="Flip"]')).not.toBeNull();
    expect(host.querySelectorAll('[role="separator"]')).toHaveLength(0);
    expect(
      [...host.querySelectorAll("button")]
        .map((button) => button.getAttribute("aria-label"))
        .filter((label): label is string => label !== null)
        .slice(-3),
    ).toEqual(["Fit to Window", "Previous Slide", "Next Slide"]);
    await act(async () => next?.click());
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("adds GIF Frames without adding a separator", async () => {
    const noop = vi.fn();
    await act(async () =>
      root.render(
        <ImageControls.Hud
          actual={1}
          active
          busy={false}
          canCrop={false}
          saveId="image"
          isGif
          gifFramesOpen
          mode="view"
          onActualSize={noop}
          onApplyCrop={noop}
          onCancelCrop={noop}
          onFit={noop}
          onFlip={noop}
          onRotate={noop}
          onSaveCrop={noop}
          onToggleCrop={noop}
          onToggleGifFrames={noop}
          onZoomIn={noop}
          onZoomOut={noop}
          onZoomRatio={noop}
        />,
      ),
    );

    expect(host.querySelector('[aria-label="GIF Frames"]')).not.toBeNull();
    expect(host.querySelectorAll('[role="separator"]')).toHaveLength(0);
  });

  it("keeps view controls but hides destructive edits when edits are disabled", async () => {
    const noop = vi.fn();
    await act(async () =>
      root.render(
        <ImageControls.Hud
          actual={1}
          active
          busy={false}
          canCrop={false}
          edits="none"
          saveId="image"
          mode="view"
          onActualSize={noop}
          onApplyCrop={noop}
          onCancelCrop={noop}
          onFit={noop}
          onFlip={noop}
          onRotate={noop}
          onSaveCrop={noop}
          onToggleCrop={noop}
          onZoomIn={noop}
          onZoomOut={noop}
          onZoomRatio={noop}
        />,
      ),
    );

    const labeled = (label: string) =>
      host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    expect(labeled("Actual Size")).not.toBeNull();
    expect(labeled("Fit to Window")).not.toBeNull();
    expect(labeled("Flip")).toBeNull();
    expect(labeled("Rotate")).toBeNull();
    expect(labeled("Crop")).toBeNull();
  });

  it("puts three tooltip-backed icon actions at the end of crop mode", async () => {
    const noop = vi.fn();
    await act(async () =>
      root.render(
        <ImageControls.Hud
          actual={1}
          active
          busy={false}
          canCrop
          saveId="image"
          mode="crop"
          onActualSize={noop}
          onApplyCrop={noop}
          onCancelCrop={noop}
          onFit={noop}
          onFlip={noop}
          onRotate={noop}
          onSaveCrop={noop}
          onToggleCrop={noop}
          onZoomIn={noop}
          onZoomOut={noop}
          onZoomRatio={noop}
        />,
      ),
    );

    expect(host.textContent).not.toContain("Select an area to crop");
    expect(host.querySelector('[aria-label="Aspect Ratio"]')).toBeNull();
    const actions = ["Apply Crop", "Save as New Image", "Cancel"];
    for (const label of actions) {
      const button = host.querySelector<HTMLButtonElement>(
        `button[aria-label="${label}"]`,
      );
      expect(button, label).not.toBeNull();
      expect(
        button?.closest('[data-viewer-bar-slot="end"]'),
        `${label} should be in the top-right group`,
      ).not.toBeNull();
      expect(button?.textContent, `${label} should be icon-only`).toBe("");
    }
  });
});
