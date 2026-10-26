import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { ResponseAnnouncement } from "./";

it("announces response boundaries without adding a persistent visual control", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = async (props: {
    running: boolean;
    responseId?: string;
    requiredAction?: string;
    error?: string;
    stopped?: boolean;
  }) => act(async () => root.render(<ResponseAnnouncement {...props} />));
  try {
    await render({ running: false, responseId: "old" });
    expect(host.querySelector('[role="status"]')?.textContent).toBe("");
    await render({ running: true, responseId: "new" });
    expect(host.querySelector('[role="status"]')?.textContent).toBe("");
    await render({ running: false, responseId: "new" });
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      "Response complete.",
    );
    expect(host.querySelector("button")).toBeNull();
    expect(document.activeElement).toBe(document.body);
    await render({ running: false, responseId: "new", stopped: true });
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      "Response stopped.",
    );
    await render({
      running: false,
      responseId: "new",
      requiredAction: "Review changes",
    });
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      "Review changes",
    );
    await render({ running: false, error: "Connection lost" });
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      "Response failed: Connection lost",
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
