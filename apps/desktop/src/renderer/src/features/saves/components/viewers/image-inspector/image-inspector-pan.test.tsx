import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { setupImageInspectorTest } from "./image-inspector-test-harness";

const inspector = setupImageInspectorTest();
afterEach(() => {
  delete document.documentElement.dataset.runtime;
});

async function gesture(frame: Element, button: number, finish = "pointerup") {
  await act(async () =>
    frame.dispatchEvent(
      new MouseEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        button,
        clientX: 100,
        clientY: 100,
      }),
    ),
  );
  await act(async () =>
    frame.dispatchEvent(
      new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 160,
        clientY: 140,
      }),
    ),
  );
  await act(async () =>
    frame.dispatchEvent(
      new MouseEvent(finish, {
        bubbles: true,
        button,
        clientX: 160,
        clientY: 140,
      }),
    ),
  );
}

it.each([0, 1])(
  "pans browser images at fit and below with mouse button %s",
  async (button) => {
    document.documentElement.dataset.runtime = "browser";
    await inspector.render(undefined, `pond://pan/browser-${button}.jpg`);
    const frame = inspector.prepareFrame();
    const image = inspector.host.querySelector("img");
    const position = image?.parentElement?.parentElement;
    expect(image?.draggable).toBe(false);
    await gesture(frame, button);
    expect(position?.style.transform).toBe("translate(60px, 40px) scale(1)");
    await act(async () => inspector.button("Fit to Window").click());
    await act(async () => inspector.button("Zoom Out").click());
    await gesture(frame, button);
    expect(position?.style.transform).toBe("translate(60px, 40px) scale(0.8)");
    expect(inspector.tx).not.toHaveBeenCalled();
  },
);

it("keeps native file dragging at fit while supporting middle-button pan", async () => {
  await inspector.render(undefined, "pond://pan/native.jpg");
  const frame = inspector.prepareFrame();
  const image = inspector.host.querySelector("img");
  const position = image?.parentElement?.parentElement;
  expect(image?.draggable).toBe(true);
  await gesture(frame, 0);
  expect(position?.style.transform).toBe("translate(0px, 0px) scale(1)");
  await gesture(frame, 1);
  expect(position?.style.transform).toBe("translate(60px, 40px) scale(1)");
});

it.each(["pointercancel", "lostpointercapture"])(
  "ends panning on %s",
  async (finish) => {
    document.documentElement.dataset.runtime = "browser";
    await inspector.render(undefined, `pond://pan/${finish}.jpg`);
    const frame = inspector.prepareFrame();
    await gesture(frame, 0, finish);
    const position =
      inspector.host.querySelector("img")?.parentElement?.parentElement;
    const stopped = position?.style.transform;
    expect(stopped).toBe("translate(60px, 40px) scale(1)");
    await act(async () =>
      frame.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 200,
          clientY: 200,
        }),
      ),
    );
    expect(position?.style.transform).toBe(stopped);
  },
);

it("keeps image movement under the physical pointer at 150% interface zoom", async () => {
  document.documentElement.dataset.runtime = "browser";
  await inspector.render(undefined, "pond://pan/scaled.jpg");
  const frame = inspector.prepareFrame();
  Object.defineProperty(frame, "clientWidth", { value: 400 });
  vi.spyOn(frame, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 600, 600),
  );
  await gesture(frame, 0);
  const position =
    inspector.host.querySelector("img")?.parentElement?.parentElement;
  expect(position?.style.transform).toBe(
    "translate(40px, 26.666666666666668px) scale(1)",
  );
});
